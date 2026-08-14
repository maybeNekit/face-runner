import * as THREE from 'three'
import {
  DESPAWN_Z,
  LANE_COUNT,
  LANE_X,
  POWERUP_GAP_MAX,
  POWERUP_GAP_MIN,
  SPAWN_Z,
} from './config'
import { MOD_COUNT } from './modifiers'
import { buildShape } from './geometry'

// Бонусы-сюрпризы: крутящаяся звезда на дорожке. Что именно достанется —
// видно только после сбора, и это часть радости.

const POOL = 4

export interface Powerups {
  readonly group: THREE.Group
  update(delta: number, dt: number, spawnEnabled: boolean): void
  /** Возвращает номер модификатора или -1. */
  collect(x: number, minY: number, maxY: number): number
  prefill(): void
  reset(): void
}

/** Звезда-сюрприз: два конуса «носами» врозь плюс поясок. */
function buildStar(): THREE.BufferGeometry {
  const spike = new THREE.ConeGeometry(0.34, 0.42, 6)
  const belt = new THREE.TorusGeometry(0.3, 0.07, 6, 12)

  return buildShape([
    { geometry: spike, color: 0xfff2a8, y: 0.21 },
    { geometry: spike, color: 0xffd93d, y: -0.21, rz: Math.PI },
    { geometry: belt, color: 0xff9f45, rx: Math.PI / 2 },
  ])
}

export function createPowerups(): Powerups {
  const group = new THREE.Group()

  const mesh = new THREE.InstancedMesh(
    buildStar(),
    new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x554400 }),
    POOL,
  )
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.count = 0
  mesh.frustumCulled = false
  group.add(mesh)

  const active = new Uint8Array(POOL)
  const posX = new Float32Array(POOL)
  const posZ = new Float32Array(POOL)

  let metersToSpawn = POWERUP_GAP_MIN
  let spin = 0
  let bob = 0

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const scale = new THREE.Vector3(1, 1, 1)

  function nextGap(): number {
    return POWERUP_GAP_MIN + Math.random() * (POWERUP_GAP_MAX - POWERUP_GAP_MIN)
  }

  function spawn(z: number): void {
    for (let i = 0; i < POOL; i += 1) {
      if (active[i]) continue
      active[i] = 1
      posX[i] = LANE_X[Math.floor(Math.random() * LANE_COUNT)]
      posZ[i] = z
      return
    }
  }

  function writeMatrices(): void {
    mesh.count = 0
    euler.y = spin
    euler.z = Math.sin(spin * 0.6) * 0.25
    quaternion.setFromEuler(euler)

    for (let i = 0; i < POOL; i += 1) {
      if (!active[i]) continue
      position.set(posX[i], 1.05 + Math.sin(bob + i) * 0.14, posZ[i])
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(mesh.count, matrix)
      mesh.count += 1
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  function update(delta: number, dt: number, spawnEnabled: boolean): void {
    spin += dt * 2.4
    bob += dt * 2.2

    for (let i = 0; i < POOL; i += 1) {
      if (!active[i]) continue
      posZ[i] += delta
      if (posZ[i] > DESPAWN_Z) active[i] = 0
    }

    if (spawnEnabled) {
      metersToSpawn -= delta
      if (metersToSpawn <= 0) {
        spawn(SPAWN_Z)
        metersToSpawn = nextGap()
      }
    }

    writeMatrices()
  }

  function collect(x: number, minY: number, maxY: number): number {
    for (let i = 0; i < POOL; i += 1) {
      if (!active[i]) continue
      if (Math.abs(posZ[i]) > 0.9) continue
      if (Math.abs(posX[i] - x) > 1) continue
      // Звезда висит на высоте 1.05 — до неё достаёт бегущий, но не
      // подкатывающийся. Допуск щедрый.
      if (1.05 < minY - 0.5 || 1.05 > maxY + 0.6) continue

      active[i] = 0
      return Math.floor(Math.random() * MOD_COUNT)
    }
    return -1
  }

  /** Одна звезда уже на трассе в начале забега — иначе про бонусы можно
   *  не узнать за весь первый забег. */
  function prefill(): void {
    spawn(-140)
    metersToSpawn = nextGap()
    writeMatrices()
  }

  function reset(): void {
    active.fill(0)
    metersToSpawn = POWERUP_GAP_MIN
    spin = 0
    bob = 0
    writeMatrices()
  }

  return { group, update, collect, prefill, reset }
}
