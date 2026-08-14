import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Сборка сложных фигур из примитивов в ОДНУ геометрию.
//
// Зачем: InstancedMesh умеет рисовать только одну геометрию, а бутерброд или
// корова — это стопка коробок разного цвета. Красим вершины и склеиваем всё
// в один буфер: объект остаётся разноцветным, но стоит один draw call.
//
// Никаких загруженных моделей — всё описывается примитивами прямо в коде
// (правило проекта №1).

export interface ShapePart {
  geometry: THREE.BufferGeometry
  color: number
  x?: number
  y?: number
  z?: number
  /** Повороты в радианах, применяются до сдвига. */
  rx?: number
  ry?: number
  rz?: number
}

const tintColor = new THREE.Color()

/** Красит все вершины геометрии одним цветом. */
function paint(geometry: THREE.BufferGeometry, color: number): void {
  tintColor.setHex(color)
  // Цвета уходят в шейдер как есть, поэтому переводим в рабочее
  // цветовое пространство — иначе разноцветные части выглядят выцветшими.
  tintColor.convertSRGBToLinear()

  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = tintColor.r
    colors[i * 3 + 1] = tintColor.g
    colors[i * 3 + 2] = tintColor.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/**
 * Склеивает части в одну геометрию с вершинными цветами.
 *
 * Материал должен быть создан с `vertexColors: true` и белым цветом.
 */
export function buildShape(parts: ShapePart[]): THREE.BufferGeometry {
  const prepared: THREE.BufferGeometry[] = []

  for (const part of parts) {
    const geometry = part.geometry.clone()

    if (part.rx) geometry.rotateX(part.rx)
    if (part.ry) geometry.rotateY(part.ry)
    if (part.rz) geometry.rotateZ(part.rz)
    geometry.translate(part.x ?? 0, part.y ?? 0, part.z ?? 0)

    paint(geometry, part.color)
    prepared.push(geometry)
  }

  const merged = mergeGeometries(prepared, false)
  if (!merged) throw new Error('Не удалось склеить геометрию')

  // Исходники больше не нужны: слияние скопировало данные в новый буфер.
  for (const geometry of prepared) geometry.dispose()

  return merged
}
