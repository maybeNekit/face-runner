import * as THREE from 'three'
import {
  DESPAWN_Z,
  POOL_SCENERY,
  ROAD_WIDTH,
  SEGMENT_COUNT,
  SEGMENT_LENGTH,
  SPAWN_Z,
} from './config'

// Бесконечная дорога из переиспользуемых сегментов.
//
// Мир едет на игрока: сегменты ползут к камере по +z, а уехавший за камеру
// возвращается вперёд. Ничего не создаётся и не удаляется после инициализации.

const TOTAL_LENGTH = SEGMENT_LENGTH * SEGMENT_COUNT

/**
 * Разметка рисуется в текстуру, а не отдельными мешами: так сегмент
 * остаётся одним draw call вместо пяти.
 *
 * Цвет биома ЗАПЕКАЕТСЯ в текстуру, а материал остаётся белым. Попытка
 * красить материалом проваливалась: цвет умножается на текстуру, и полотно
 * с серой подложкой уходило почти в чёрный, а для светлых биомов нужный
 * множитель вылезал за 255 и упирался в белый.
 */
function paintRoad(canvas: HTMLCanvasElement, color: THREE.Color): void {
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = `#${color.getHexString()}`
  ctx.fillRect(0, 0, 256, 256)

  // Две пунктирные полосы между тремя дорожками. Всегда светлее полотна,
  // в каком бы биоме мы ни были.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.lineWidth = 6
  ctx.setLineDash([34, 30])
  for (const x of [256 / 3, (256 / 3) * 2]) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 256)
    ctx.stroke()
  }
}

export interface Road {
  readonly group: THREE.Group
  update(delta: number): void
  /** Цвета биома, вызывается каждый кадр с уже сглаженными значениями. */
  setColors(ground: THREE.Color, road: THREE.Color, curb: THREE.Color): void
  /** Смена декораций биома. Уехавшее вперёд отправляется за туман, чтобы
   *  новый биом выехал из дымки, а не подменился на глазах. */
  setScenery(tall: THREE.BufferGeometry, low: THREE.BufferGeometry): void
  reset(): void
}

export function createRoad(): Road {
  const group = new THREE.Group()

  // ---- Земля вокруг дороги: один статичный меш ----
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2f7d4f })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, TOTAL_LENGTH * 2), groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(0, -0.42, -TOTAL_LENGTH / 2)
  group.add(ground)

  // ---- Полотно дороги ----
  const roadGeometry = new THREE.BoxGeometry(ROAD_WIDTH, 0.4, SEGMENT_LENGTH)

  const roadCanvas = document.createElement('canvas')
  roadCanvas.width = 256
  roadCanvas.height = 256
  const roadTexture = new THREE.CanvasTexture(roadCanvas)
  roadTexture.wrapS = THREE.ClampToEdgeWrapping
  roadTexture.wrapT = THREE.RepeatWrapping
  roadTexture.repeat.set(1, 3)
  const roadMaterial = new THREE.MeshLambertMaterial({ map: roadTexture })

  /** Последний запечённый цвет — перерисовываем только когда он заметно уехал. */
  const paintedRoad = new THREE.Color(-1, -1, -1)

  const segments: THREE.Mesh[] = []
  const segmentZ = new Float32Array(SEGMENT_COUNT)

  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    const mesh = new THREE.Mesh(roadGeometry, roadMaterial)
    mesh.position.y = -0.2
    segments.push(mesh)
    group.add(mesh)
  }

  // ---- Бордюры: один InstancedMesh на оба края всех сегментов ----
  const curbMaterial = new THREE.MeshLambertMaterial({ color: 0xffd93d })
  const curbs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.55, 0.62, SEGMENT_LENGTH),
    curbMaterial,
    SEGMENT_COUNT * 2,
  )
  curbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  group.add(curbs)

  // ---- Декорации по бокам ----
  // Цвета запечены в вершины (фигуры разноцветные), поэтому материал белый
  // с vertexColors — биом меняет саму геометрию, а не оттенок.
  const sceneryMaterial = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
  })

  const tall = new THREE.InstancedMesh(new THREE.BufferGeometry(), sceneryMaterial, POOL_SCENERY)
  tall.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  tall.frustumCulled = false
  group.add(tall)

  const low = new THREE.InstancedMesh(new THREE.BufferGeometry(), sceneryMaterial, POOL_SCENERY)
  low.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  low.frustumCulled = false
  group.add(low)

  const sceneryZ = new Float32Array(POOL_SCENERY)
  const sceneryX = new Float32Array(POOL_SCENERY)
  const sceneryScale = new Float32Array(POOL_SCENERY)

  // Скретч-объекты: переиспользуются каждый кадр, чтобы в цикле не было new.
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scale = new THREE.Vector3(1, 1, 1)

  function placeScenery(index: number, z: number): void {
    const side = index % 2 === 0 ? -1 : 1
    sceneryZ[index] = z
    sceneryX[index] = side * (ROAD_WIDTH / 2 + 2.5 + Math.random() * 9)
    sceneryScale[index] = 0.7 + Math.random() * 0.8
  }

  function writeScenery(): void {
    for (let i = 0; i < POOL_SCENERY; i += 1) {
      const s = sceneryScale[i]

      euler.set(0, i * 1.7, 0)
      quaternion.setFromEuler(euler)

      position.set(sceneryX[i], -0.35, sceneryZ[i])
      scale.set(s, s, s)
      matrix.compose(position, quaternion, scale)
      tall.setMatrixAt(i, matrix)

      // Мелкие декорации стоят чуть дальше и в шахматном порядке с крупными.
      position.set(sceneryX[i] * 1.35, -0.35, sceneryZ[i] + SEGMENT_LENGTH * 0.5)
      scale.set(s * 0.8, s * 0.8, s * 0.8)
      matrix.compose(position, quaternion, scale)
      low.setMatrixAt(i, matrix)
    }

    tall.instanceMatrix.needsUpdate = true
    low.instanceMatrix.needsUpdate = true
  }

  function writeCurbs(): void {
    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      const z = segmentZ[i]

      position.set(-(ROAD_WIDTH / 2), -0.1, z)
      quaternion.identity()
      matrix.compose(position, quaternion, scale.set(1, 1, 1))
      curbs.setMatrixAt(i * 2, matrix)

      position.set(ROAD_WIDTH / 2, -0.1, z)
      matrix.compose(position, quaternion, scale)
      curbs.setMatrixAt(i * 2 + 1, matrix)
    }
    curbs.instanceMatrix.needsUpdate = true
  }

  function setColors(groundColor: THREE.Color, roadColor: THREE.Color, curbColor: THREE.Color): void {
    groundMaterial.color.copy(groundColor)
    curbMaterial.color.copy(curbColor)

    // Перерисовка канваса стоит заметно дороже присваивания цвета, поэтому
    // делаем её только когда оттенок реально сдвинулся. За двухсекундный
    // переход это несколько десятков перерисовок вместо 120.
    const drift =
      Math.abs(paintedRoad.r - roadColor.r) +
      Math.abs(paintedRoad.g - roadColor.g) +
      Math.abs(paintedRoad.b - roadColor.b)

    if (drift > 0.02) {
      paintedRoad.copy(roadColor)
      paintRoad(roadCanvas, roadColor)
      roadTexture.needsUpdate = true
    }
  }

  function setScenery(tallGeometry: THREE.BufferGeometry, lowGeometry: THREE.BufferGeometry): void {
    tall.geometry = tallGeometry
    low.geometry = lowGeometry

    // Всё, что уже видно, уезжает за туман и вернётся уже в новом облике.
    for (let i = 0; i < POOL_SCENERY; i += 1) {
      placeScenery(i, SPAWN_Z - Math.random() * 60)
    }
    writeScenery()
  }

  function reset(): void {
    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      segmentZ[i] = DESPAWN_Z - (i + 1) * SEGMENT_LENGTH
      segments[i].position.z = segmentZ[i]
    }
    for (let i = 0; i < POOL_SCENERY; i += 1) {
      placeScenery(i, DESPAWN_Z - (i / 2) * SEGMENT_LENGTH * 0.6 - Math.random() * 8)
    }
    writeCurbs()
    writeScenery()
  }

  function update(delta: number): void {
    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      let z = segmentZ[i] + delta
      if (z > DESPAWN_Z) z -= TOTAL_LENGTH
      segmentZ[i] = z
      segments[i].position.z = z
    }

    for (let i = 0; i < POOL_SCENERY; i += 1) {
      const z = sceneryZ[i] + delta
      if (z > DESPAWN_Z) {
        placeScenery(i, z - TOTAL_LENGTH)
      } else {
        sceneryZ[i] = z
      }
    }

    writeCurbs()
    writeScenery()
  }

  reset()

  return { group, update, setColors, setScenery, reset }
}
