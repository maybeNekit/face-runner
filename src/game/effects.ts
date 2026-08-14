import * as THREE from 'three'
import {
  DESPAWN_Z,
  POOL_PARTICLES,
  POOL_STREAKS,
  SHAKE_ANGLE,
  SHAKE_DECAY,
  SHAKE_FREQUENCY,
  SHAKE_MAX,
  SPEED_MAX,
  SPEED_START,
} from './config'

// Частицы, тряска камеры и полосы скорости.
//
// Всё живёт в заранее выделенных типизированных массивах: за кадр не
// создаётся ни одного объекта, поэтому сборщик мусора не просыпается
// и не даёт фризов.

const DUST_COLOR = 0xd9c9a8
const SPARK_COLOR = 0xffd93d
const CRASH_COLOR = 0xff7a5c

export interface Effects {
  readonly group: THREE.Group
  emitDust(x: number, y: number, z: number, count: number): void
  emitSparkle(x: number, y: number, z: number, count: number): void
  emitCrash(x: number, y: number, z: number, count: number): void
  addShake(amount: number): void
  /** Текущий доворот камеры от тряски, радианы. */
  readonly shakeRoll: number
  readonly shakePitch: number
  update(dt: number, delta: number, progress: number): void
  reset(): void
}

export function createEffects(): Effects {
  const group = new THREE.Group()

  // ---- Частицы ----
  const particles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    POOL_PARTICLES,
  )
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  particles.count = 0
  particles.frustumCulled = false
  group.add(particles)

  const pX = new Float32Array(POOL_PARTICLES)
  const pY = new Float32Array(POOL_PARTICLES)
  const pZ = new Float32Array(POOL_PARTICLES)
  const vX = new Float32Array(POOL_PARTICLES)
  const vY = new Float32Array(POOL_PARTICLES)
  const vZ = new Float32Array(POOL_PARTICLES)
  const life = new Float32Array(POOL_PARTICLES)
  const maxLife = new Float32Array(POOL_PARTICLES)
  const size = new Float32Array(POOL_PARTICLES)
  const tint = new Uint32Array(POOL_PARTICLES)

  let nextParticle = 0

  // ---- Полосы скорости ----
  const streaks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.05, 0.05, 2.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    POOL_STREAKS,
  )
  streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  streaks.count = 0
  streaks.frustumCulled = false
  group.add(streaks)

  const sX = new Float32Array(POOL_STREAKS)
  const sY = new Float32Array(POOL_STREAKS)
  const sZ = new Float32Array(POOL_STREAKS)

  // ---- Тряска ----
  let trauma = 0
  let shakeTime = 0
  let shakeRoll = 0
  let shakePitch = 0

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const color = new THREE.Color()

  function spawnParticle(
    x: number,
    y: number,
    z: number,
    spread: number,
    upward: number,
    ttl: number,
    scaleSize: number,
    colorHex: number,
  ): void {
    // Кольцевой буфер: если частиц не хватает, самые старые вытесняются.
    // Это лучше, чем пропускать эффект или расширять пул на ходу.
    const i = nextParticle
    nextParticle = (nextParticle + 1) % POOL_PARTICLES

    pX[i] = x
    pY[i] = y
    pZ[i] = z
    vX[i] = (Math.random() - 0.5) * spread
    vY[i] = Math.random() * upward
    vZ[i] = (Math.random() - 0.5) * spread
    life[i] = ttl
    maxLife[i] = ttl
    size[i] = scaleSize * (0.6 + Math.random() * 0.7)
    tint[i] = colorHex
  }

  function emitDust(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      spawnParticle(x, y, z, 2.2, 2.4, 0.45, 0.16, DUST_COLOR)
    }
  }

  function emitSparkle(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      spawnParticle(x, y, z, 3.4, 3.6, 0.4, 0.13, SPARK_COLOR)
    }
  }

  function emitCrash(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      spawnParticle(x, y, z, 6.5, 6.5, 0.9, 0.22, CRASH_COLOR)
    }
  }

  function addShake(amount: number): void {
    trauma = Math.min(trauma + amount, SHAKE_MAX)
  }

  function resetStreak(i: number, z: number): void {
    const side = Math.random() < 0.5 ? -1 : 1
    sX[i] = side * (2.6 + Math.random() * 5)
    sY[i] = 0.4 + Math.random() * 3.4
    sZ[i] = z
  }

  function update(dt: number, delta: number, progress: number): void {
    // ---- Тряска: квадратичное затухание читается мягче линейного ----
    if (trauma > 0) {
      trauma = Math.max(trauma - SHAKE_DECAY * dt * trauma, 0)
      if (trauma < 0.001) trauma = 0
    }

    // Две несоизмеримые частоты дают органичную болтанку. Белый шум по
    // кадрам читался бы как строб и зависел бы от частоты экрана: на 120 Гц
    // каждое значение держалось бы два кадра.
    shakeTime += dt * SHAKE_FREQUENCY
    const shake = trauma * trauma
    shakeRoll = Math.sin(shakeTime) * shake * SHAKE_ANGLE
    shakePitch = Math.sin(shakeTime * 1.63 + 1.7) * shake * SHAKE_ANGLE

    // ---- Частицы ----
    particles.count = 0
    for (let i = 0; i < POOL_PARTICLES; i += 1) {
      if (life[i] <= 0) continue

      life[i] -= dt
      if (life[i] <= 0) continue

      vY[i] -= 9.5 * dt
      pX[i] += vX[i] * dt
      pY[i] += vY[i] * dt
      pZ[i] += vZ[i] * dt + delta

      if (pY[i] < 0) {
        pY[i] = 0
        vY[i] *= -0.35
      }

      const fade = life[i] / maxLife[i]
      const s = size[i] * fade
      position.set(pX[i], pY[i], pZ[i])
      scale.set(s, s, s)
      matrix.compose(position, quaternion, scale)

      color.setHex(tint[i])
      particles.setMatrixAt(particles.count, matrix)
      particles.setColorAt(particles.count, color)
      particles.count += 1
    }
    particles.instanceMatrix.needsUpdate = true
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true

    // ---- Полосы скорости: появляются только на разгоне ----
    const visibleStreaks = Math.floor(POOL_STREAKS * Math.max(0, progress - 0.15) * 1.2)
    streaks.count = Math.min(visibleStreaks, POOL_STREAKS)

    for (let i = 0; i < streaks.count; i += 1) {
      // Полосы летят быстрее мира — именно разница и читается как скорость.
      sZ[i] += delta * 2.1
      if (sZ[i] > DESPAWN_Z) resetStreak(i, -60 - Math.random() * 40)

      position.set(sX[i], sY[i], sZ[i])
      scale.set(1, 1, 1 + progress * 2)
      matrix.compose(position, quaternion, scale)
      streaks.setMatrixAt(i, matrix)
    }
    streaks.instanceMatrix.needsUpdate = true
  }

  function reset(): void {
    life.fill(0)
    trauma = 0
    shakeTime = 0
    shakeRoll = 0
    shakePitch = 0
    particles.count = 0
    streaks.count = 0
    for (let i = 0; i < POOL_STREAKS; i += 1) {
      resetStreak(i, -Math.random() * 100)
    }
  }

  reset()

  return {
    group,
    emitDust,
    emitSparkle,
    emitCrash,
    addShake,
    get shakeRoll() {
      return shakeRoll
    },
    get shakePitch() {
      return shakePitch
    },
    update,
    reset,
  }
}

/**
 * Доля ПРОЙДЕННОГО диапазона разгона: 0 на старте забега, 1 на максимуме.
 *
 * Наивное `speed / SPEED_MAX` давало на старте 0.364, из-за чего FOV покоя
 * был не 62, а 65.3, и за весь забег рос всего на 5.7° из заложенных 9.
 * Плюс startRun выставлял ровно FOV_BASE, и камера в первую секунду каждого
 * забега делала паразитный отъезд.
 */
export function speedProgress(speed: number): number {
  return Math.min(Math.max((speed - SPEED_START) / (SPEED_MAX - SPEED_START), 0), 1)
}
