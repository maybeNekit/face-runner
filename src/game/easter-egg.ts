import * as THREE from 'three'
import { EASTER_EGG_METERS, SPAWN_Z } from './config'
import { buildShape } from './geometry'
import type { ShapePart } from './geometry'

// Пасхалка: на 500 метрах из земли вырастает гигантский резиновый утёнок
// в короне, машет лапой и крякает. Ровно один раз за забег.

/** С какого расстояния утёнок начинает вылезать из земли. */
const RISE_DISTANCE = 70
/** Насколько глубоко он прячется под землёй. */
const BURIED = 9

function buildDuck(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(1, 12, 10)
  const head = new THREE.SphereGeometry(0.62, 10, 8)
  const beak = new THREE.ConeGeometry(0.3, 0.7, 8)
  const eye = new THREE.SphereGeometry(0.12, 6, 5)
  const tail = new THREE.ConeGeometry(0.45, 0.8, 6)
  const crownBand = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10)
  const spike = new THREE.ConeGeometry(0.12, 0.32, 5)

  const parts: ShapePart[] = [
    { geometry: body, color: 0xffd93d, y: 1, z: 0 },
    { geometry: tail, color: 0xffd93d, y: 1.15, z: -1.1, rx: -1.9 },
    { geometry: head, color: 0xffe066, y: 2.15, z: 0.55 },
    { geometry: beak, color: 0xff9f45, y: 2.05, z: 1.2, rx: 1.5 },
    { geometry: eye, color: 0x2b2b2b, y: 2.35, z: 1.02, x: 0.28 },
    { geometry: eye, color: 0x2b2b2b, y: 2.35, z: 1.02, x: -0.28 },
    { geometry: crownBand, color: 0xffc300, y: 2.72, z: 0.5 },
  ]

  // Зубцы короны по кругу — процедурно, а не руками.
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2
    parts.push({
      geometry: spike,
      color: 0xffc300,
      x: Math.cos(angle) * 0.36,
      y: 2.95,
      z: 0.5 + Math.sin(angle) * 0.36,
    })
  }

  return buildShape(parts)
}

export interface EasterEgg {
  readonly group: THREE.Group
  /** Возвращает true ровно в тот кадр, когда утёнок поравнялся с игроком. */
  update(distance: number, dt: number): boolean
  reset(): void
}

export function createEasterEgg(): EasterEgg {
  const group = new THREE.Group()
  group.visible = false

  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })
  const duck = new THREE.Mesh(buildDuck(), material)
  group.add(duck)

  // Лапа отдельным мешем — ей надо махать.
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.9, 0.55),
    new THREE.MeshLambertMaterial({ color: 0xffc300 }),
  )
  wing.position.set(1.05, 1.35, 0)
  group.add(wing)

  // Стоит сбоку от дороги: пасхалка не должна мешать бежать.
  group.position.x = 11
  group.scale.setScalar(2.6)

  let triggered = false
  let wave = 0

  function update(distance: number, dt: number): boolean {
    const remaining = EASTER_EGG_METERS - distance

    if (remaining > -RISE_DISTANCE && remaining < -SPAWN_Z) {
      group.visible = true
      group.position.z = -remaining

      // Вылезает из земли по мере приближения.
      const rise = Math.min(Math.max(1 - remaining / RISE_DISTANCE, 0), 1)
      group.position.y = -BURIED + BURIED * rise

      wave += dt * 7
      wing.rotation.z = -0.6 + Math.sin(wave) * 0.9
    } else {
      group.visible = false
    }

    if (!triggered && remaining <= 0 && distance > 0) {
      triggered = true
      return true
    }
    return false
  }

  function reset(): void {
    triggered = false
    wave = 0
    group.visible = false
    group.position.y = -BURIED
  }

  reset()

  return { group, update, reset }
}
