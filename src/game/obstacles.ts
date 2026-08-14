import * as THREE from 'three'
import {
  DESPAWN_Z,
  DOUBLE_LANE_CHANCE,
  LANE_COUNT,
  LANE_X,
  PATTERN_EMPTY_CHANCE,
  POOL_OBSTACLES,
  SINGLE_LANE_UNTIL,
  SPAWN_Z,
} from './config'
import { OBSTACLE_DEFS } from './obstacle-shapes'

// Препятствия. Ничего страшного и агрессивного — только нелепое (правило №4).

const DEF_COUNT = OBSTACLE_DEFS.length

export interface ObstacleWorld {
  readonly group: THREE.Group
  update(
    delta: number,
    speed: number,
    reactionTime: number,
    elapsed: number,
    spawnEnabled: boolean,
    forceSingleLane: boolean,
  ): void
  /** Возвращает вариант смерти при столкновении или -1, если чисто. */
  hits(x: number, halfWidth: number, minY: number, maxY: number): number
  /** Заполняет трассу до старта, чтобы забег не начинался с пустоты. */
  prefill(speed: number, reactionTime: number, safeDistance: number): void
  reset(): void
}

export function createObstacles(): ObstacleWorld {
  const group = new THREE.Group()

  // По одному InstancedMesh на вид препятствия. Каждая фигура склеена
  // из примитивов в одну геометрию с вершинными цветами, поэтому
  // разноцветный бутерброд стоит ровно один draw call.
  const meshes: THREE.InstancedMesh[] = []
  for (let i = 0; i < DEF_COUNT; i += 1) {
    const mesh = new THREE.InstancedMesh(
      OBSTACLE_DEFS[i].build(),
      new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }),
      POOL_OBSTACLES,
    )
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    // Считать баунды пула бессмысленно: объекты постоянно переезжают.
    mesh.frustumCulled = false
    meshes.push(mesh)
    group.add(mesh)
  }

  // Фальшивые тени: тёмные плоскости на земле под каждым препятствием.
  // Главное — носки висят на высоте и вообще не касаются земли, из-за чего
  // на расстоянии не понять, на какой они дорожке.
  const shadows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26 }),
    POOL_OBSTACLES,
  )
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  shadows.count = 0
  shadows.frustumCulled = false
  shadows.rotation.x = -Math.PI / 2
  shadows.position.y = 0.02
  group.add(shadows)

  // Пул: параллельные массивы вместо массива объектов — ни одной аллокации
  // при спавне и переработке.
  const active = new Uint8Array(POOL_OBSTACLES)
  const kind = new Uint8Array(POOL_OBSTACLES)
  const lane = new Uint8Array(POOL_OBSTACLES)
  const posZ = new Float32Array(POOL_OBSTACLES)

  let metersToSpawn = 0

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const shadowPosition = new THREE.Vector3()
  const shadowScale = new THREE.Vector3(1, 1, 1)

  function take(): number {
    for (let i = 0; i < POOL_OBSTACLES; i += 1) {
      if (!active[i]) return i
    }
    return -1
  }

  function spawnOne(laneIndex: number, defIndex: number, z: number): void {
    const index = take()
    if (index < 0) return
    active[index] = 1
    kind[index] = defIndex
    lane[index] = laneIndex
    posZ[index] = z
  }

  /**
   * Ставит группу препятствий. Занимаем максимум две дорожки из трёх —
   * проход обязан существовать всегда, иначе забег обрывается не по вине
   * ребёнка.
   *
   * `avoidCenter` — для самой первой группы забега: первое препятствие
   * в жизни ребёнок должен просто рассмотреть и проехать мимо.
   */
  function spawnPattern(
    z: number,
    elapsed: number,
    avoidCenter: boolean,
    forceSingleLane = false,
  ): void {
    if (Math.random() < PATTERN_EMPTY_CHANCE) return

    const warmup = forceSingleLane || elapsed < SINGLE_LANE_UNTIL
    const blockCount = warmup || Math.random() >= DOUBLE_LANE_CHANCE ? 1 : 2

    if (blockCount === 1) {
      let laneIndex = Math.floor(Math.random() * LANE_COUNT)
      if (avoidCenter && laneIndex === 1) laneIndex = Math.random() < 0.5 ? 0 : 2
      spawnOne(laneIndex, Math.floor(Math.random() * DEF_COUNT), z)
      return
    }

    const freeLane = avoidCenter ? 1 : Math.floor(Math.random() * LANE_COUNT)
    for (let laneIndex = 0; laneIndex < LANE_COUNT; laneIndex += 1) {
      if (laneIndex === freeLane) continue
      spawnOne(laneIndex, Math.floor(Math.random() * DEF_COUNT), z)
    }
  }

  function prefill(speed: number, reactionTime: number, safeDistance: number): void {
    const gap = speed * reactionTime
    let z = -safeDistance
    let first = true

    while (z > SPAWN_Z) {
      spawnPattern(z, 0, first, false)
      first = false
      z -= gap
    }

    // Следующая группа должна встать туда, где остановился шаг: ей нужно
    // проехать до SPAWN_Z, прежде чем сработает обычный спавн.
    metersToSpawn = SPAWN_Z - z
    writeMatrices()
  }

  function writeMatrices(): void {
    for (let i = 0; i < DEF_COUNT; i += 1) meshes[i].count = 0
    shadows.count = 0

    for (let i = 0; i < POOL_OBSTACLES; i += 1) {
      if (!active[i]) continue

      const def = OBSTACLE_DEFS[kind[i]]
      const mesh = meshes[kind[i]]
      const x = LANE_X[lane[i]]

      position.set(x, 0, posZ[i])
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(mesh.count, matrix)
      mesh.count += 1

      // Тень лежит в локальных координатах повёрнутого меша: после
      // rotation.x = -90° его локальный Y смотрит в мировой -Z.
      shadowPosition.set(x, -posZ[i], 0)
      shadowScale.set(def.width * 0.92, def.depth * 1.5, 1)
      matrix.compose(shadowPosition, quaternion, shadowScale)
      shadows.setMatrixAt(shadows.count, matrix)
      shadows.count += 1
    }

    for (let i = 0; i < DEF_COUNT; i += 1) {
      meshes[i].instanceMatrix.needsUpdate = true
    }
    shadows.instanceMatrix.needsUpdate = true
  }

  function update(
    delta: number,
    speed: number,
    reactionTime: number,
    elapsed: number,
    spawnEnabled: boolean,
    forceSingleLane: boolean,
  ): void {
    for (let i = 0; i < POOL_OBSTACLES; i += 1) {
      if (!active[i]) continue
      posZ[i] += delta
      if (posZ[i] > DESPAWN_Z) active[i] = 0
    }

    if (spawnEnabled) {
      metersToSpawn -= delta
      if (metersToSpawn <= 0) {
        spawnPattern(SPAWN_Z, elapsed, false, forceSingleLane)
        // Дистанция до следующей группы считается через время на реакцию,
        // поэтому на любой скорости у ребёнка одинаковый запас времени.
        metersToSpawn = speed * reactionTime
      }
    }

    writeMatrices()
  }

  function hits(x: number, halfWidth: number, minY: number, maxY: number): number {
    for (let i = 0; i < POOL_OBSTACLES; i += 1) {
      if (!active[i]) continue

      const def = OBSTACLE_DEFS[kind[i]]
      const z = posZ[i]

      // Игрок всегда в z = 0, поэтому достаточно сравнить с глубиной.
      if (Math.abs(z) > def.depth / 2 + 0.3) continue
      if (Math.abs(LANE_X[lane[i]] - x) > def.width / 2 + halfWidth) continue
      if (maxY <= def.minY || minY >= def.maxY) continue

      return def.death
    }
    return -1
  }

  function reset(): void {
    active.fill(0)
    metersToSpawn = 0
    writeMatrices()
  }

  return { group, update, hits, prefill, reset }
}
