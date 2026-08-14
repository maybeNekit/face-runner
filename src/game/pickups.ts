import * as THREE from 'three'
import {
  COIN_RUN_LENGTH,
  COIN_SPACING,
  DESPAWN_Z,
  LANE_COUNT,
  LANE_X,
  POOL_COINS,
  SPAWN_Z,
} from './config'

// Звёздочки-монетки. Один InstancedMesh на весь пул — один draw call.

/** Высота, на которой монетки собираются только в прыжке. */
const ARC_HEIGHT = 1.5

export interface Pickups {
  readonly group: THREE.Group
  update(delta: number, dt: number, speed: number, spawnEnabled: boolean): void
  /** Возвращает, сколько монеток собрано в этом кадре. */
  collect(x: number, minY: number, maxY: number): number
  /** Раскладывает монетки по трассе до старта забега. */
  prefill(speed: number, safeDistance: number): void
  reset(): void
}

export function createPickups(): Pickups {
  const group = new THREE.Group()

  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12),
    new THREE.MeshLambertMaterial({ color: 0xffd93d, emissive: 0x6b5300 }),
    POOL_COINS,
  )
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.count = 0
  mesh.frustumCulled = false
  group.add(mesh)

  const active = new Uint8Array(POOL_COINS)
  const posX = new Float32Array(POOL_COINS)
  const posY = new Float32Array(POOL_COINS)
  const posZ = new Float32Array(POOL_COINS)

  let metersToSpawn = 30
  let spin = 0

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const scale = new THREE.Vector3(1, 1, 1)

  function take(): number {
    for (let i = 0; i < POOL_COINS; i += 1) {
      if (!active[i]) return i
    }
    return -1
  }

  function spawnRun(z: number): void {
    const lane = Math.floor(Math.random() * LANE_COUNT)
    // Часть дорожек монеток идёт дугой: чтобы собрать, надо прыгнуть.
    // Это учит прыгать раньше, чем прыжок понадобится для препятствия.
    const arc = Math.random() < 0.35

    for (let i = 0; i < COIN_RUN_LENGTH; i += 1) {
      const index = take()
      if (index < 0) return

      const t = i / (COIN_RUN_LENGTH - 1)
      active[index] = 1
      posX[index] = LANE_X[lane]
      posY[index] = arc ? 0.7 + Math.sin(t * Math.PI) * ARC_HEIGHT : 0.7
      posZ[index] = z - i * COIN_SPACING
    }
  }

  function gapFor(speed: number): number {
    return speed * (1.6 + Math.random() * 1.8)
  }

  function prefill(speed: number, safeDistance: number): void {
    let z = -safeDistance
    while (z > SPAWN_Z) {
      spawnRun(z)
      z -= gapFor(speed)
    }
    metersToSpawn = SPAWN_Z - z
    writeMatrices()
  }

  function writeMatrices(): void {
    mesh.count = 0
    euler.x = Math.PI / 2
    euler.y = spin
    quaternion.setFromEuler(euler)

    for (let i = 0; i < POOL_COINS; i += 1) {
      if (!active[i]) continue
      position.set(posX[i], posY[i], posZ[i])
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(mesh.count, matrix)
      mesh.count += 1
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  function update(delta: number, dt: number, speed: number, spawnEnabled: boolean): void {
    spin += dt * 3.2

    for (let i = 0; i < POOL_COINS; i += 1) {
      if (!active[i]) continue
      posZ[i] += delta
      if (posZ[i] > DESPAWN_Z) active[i] = 0
    }

    if (spawnEnabled) {
      metersToSpawn -= delta
      if (metersToSpawn <= 0) {
        spawnRun(SPAWN_Z)
        metersToSpawn = gapFor(speed)
      }
    }

    writeMatrices()
  }

  function collect(x: number, minY: number, maxY: number): number {
    let collected = 0

    for (let i = 0; i < POOL_COINS; i += 1) {
      if (!active[i]) continue
      if (Math.abs(posZ[i]) > 0.85) continue
      if (Math.abs(posX[i] - x) > 0.95) continue
      // Небольшой допуск сверху и снизу — сбор должен быть щедрым.
      if (posY[i] < minY - 0.45 || posY[i] > maxY + 0.45) continue

      active[i] = 0
      collected += 1
    }

    return collected
  }

  function reset(): void {
    active.fill(0)
    metersToSpawn = 0
    spin = 0
    writeMatrices()
  }

  return { group, update, collect, prefill, reset }
}
