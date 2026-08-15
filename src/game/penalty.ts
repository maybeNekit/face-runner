import * as THREE from 'three'
import {
  PENALTY_AIM_SPEED,
  PENALTY_AIM_TIME,
  PENALTY_KEEPER_SPEED,
  PENALTY_RESULT_TIME,
  PENALTY_RISE_TIME,
  PENALTY_SHOT_TIME,
} from './config'
import { buildShape } from './geometry'

// Пенальти — мини-игра по силе Роналду.
//
// Порядок такой: земля трясётся, из неё вырастают ворота, включается вид
// от первого лица, вдоль ворот ходит прицел. Ребёнок жмёт — мяч летит
// ровно туда, где стоял прицел.
//
// ВАЖНО про честность: и прицел, и вратарь ходят ВИДИМО и предсказуемо.
// Это навык, а не лотерея — иначе промах ощущался бы как отобранный
// ни за что забег.

export const PENALTY_RISING = 0
export const PENALTY_AIMING = 1
export const PENALTY_FLYING = 2
export const PENALTY_RESULT = 3
export const PENALTY_DONE = 4

const GOAL_WIDTH = 9
const GOAL_HEIGHT = 3.4
const GOAL_Z = -10.5
/** Насколько глубоко ворота сидят в земле до подъёма. */
const BURIED = 5

function buildGoal(): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(0.16, 0.16, GOAL_HEIGHT, 8)
  const bar = new THREE.CylinderGeometry(0.16, 0.16, GOAL_WIDTH + 0.32, 8)
  const net = new THREE.BoxGeometry(GOAL_WIDTH, GOAL_HEIGHT, 0.1)

  return buildShape([
    { geometry: post, color: 0xffffff, x: -GOAL_WIDTH / 2, y: GOAL_HEIGHT / 2 },
    { geometry: post, color: 0xffffff, x: GOAL_WIDTH / 2, y: GOAL_HEIGHT / 2 },
    { geometry: bar, color: 0xffffff, y: GOAL_HEIGHT, rz: Math.PI / 2 },
    { geometry: net, color: 0xc9d4e4, y: GOAL_HEIGHT / 2, z: -1.1 },
  ])
}

function buildKeeper(): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(0.4, 0.75, 4, 8)
  const head = new THREE.SphereGeometry(0.32, 10, 8)
  const glove = new THREE.SphereGeometry(0.28, 7, 6)
  const eye = new THREE.SphereGeometry(0.08, 6, 5)

  return buildShape([
    { geometry: body, color: 0x2ecc71, y: 1.0 },
    { geometry: head, color: 0xffd9a8, y: 1.78 },
    { geometry: eye, color: 0x1a202c, x: -0.12, y: 1.83, z: 0.27 },
    { geometry: eye, color: 0x1a202c, x: 0.12, y: 1.83, z: 0.27 },
    { geometry: glove, color: 0xffd93d, x: -0.78, y: 1.45 },
    { geometry: glove, color: 0xffd93d, x: 0.78, y: 1.45 },
  ])
}

function buildBall(): THREE.BufferGeometry {
  const ball = new THREE.SphereGeometry(0.28, 12, 10)
  const patch = new THREE.SphereGeometry(0.11, 6, 5)

  return buildShape([
    { geometry: ball, color: 0xffffff },
    { geometry: patch, color: 0x1a202c, y: 0.22 },
    { geometry: patch, color: 0x1a202c, x: 0.22 },
    { geometry: patch, color: 0x1a202c, z: 0.22 },
  ])
}

/** Прицел: яркая стрелка, которую видно на любом фоне. */
function buildAim(): THREE.BufferGeometry {
  const shaft = new THREE.BoxGeometry(0.22, 0.9, 0.22)
  const head = new THREE.ConeGeometry(0.42, 0.7, 4)
  const ring = new THREE.TorusGeometry(0.5, 0.11, 6, 14)

  return buildShape([
    { geometry: ring, color: 0xff5d8f, y: 1.5 },
    { geometry: shaft, color: 0xffd93d, y: 0.75 },
    { geometry: head, color: 0xffd93d, y: 0.2, rx: Math.PI },
  ])
}

export interface Penalty {
  readonly group: THREE.Group
  readonly state: number
  readonly scored: boolean
  /** Куда поставить героя на время пенальти. */
  readonly spotX: number
  readonly spotZ: number
  /** Камера от первого лица: позиция и точка взгляда. */
  readonly cameraY: number
  readonly cameraZ: number
  readonly lookY: number
  start(): void
  /** Удар туда, где сейчас стоит прицел. */
  shoot(): void
  /** Сила тряски земли в этом кадре — её подхватывает камера. */
  readonly quake: number
  update(dt: number): boolean
  reset(): void
}

export function createPenalty(): Penalty {
  const group = new THREE.Group()
  group.visible = false
  // Площадка стоит слева от трассы — герой к ней отбегает.
  group.position.set(-14, 0, 0)

  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })

  // Ворота и вратарь сидят в общей группе: она и вылезает из земли.
  const risen = new THREE.Group()
  risen.position.y = -BURIED
  group.add(risen)

  const goal = new THREE.Mesh(buildGoal(), material)
  goal.position.z = GOAL_Z
  risen.add(goal)

  const keeper = new THREE.Mesh(buildKeeper(), material)
  keeper.position.z = GOAL_Z + 1.0
  risen.add(keeper)

  const ball = new THREE.Mesh(buildBall(), material)
  ball.position.set(0, 0.28, -2.2)
  group.add(ball)

  const aim = new THREE.Mesh(buildAim(), material)
  aim.position.set(0, 0.5, GOAL_Z + 1.6)
  aim.visible = false
  group.add(aim)

  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 26),
    new THREE.MeshLambertMaterial({ color: 0x3f9c58 }),
  )
  pitch.rotation.x = -Math.PI / 2
  pitch.position.set(0, 0.01, GOAL_Z / 2)
  group.add(pitch)

  let state = PENALTY_DONE
  let timer = 0
  let keeperPhase = 0
  let keeperX = 0
  let aimPhase = 0
  let aimX = 0
  let shotX = 0
  let shotProgress = 0
  let scored = false
  let quake = 0

  function start(): void {
    state = PENALTY_RISING
    timer = PENALTY_RISE_TIME
    keeperPhase = 0
    aimPhase = 0
    shotProgress = 0
    scored = false
    quake = 1
    ball.position.set(0, 0.28, -2.2)
    aim.visible = false
    risen.position.y = -BURIED
    group.visible = true
  }

  function shoot(): void {
    if (state !== PENALTY_AIMING) return
    // Бьём ровно туда, где прицел стоял в момент нажатия.
    shotX = aimX
    state = PENALTY_FLYING
    shotProgress = 0
    aim.visible = false
  }

  function update(dt: number): boolean {
    if (state === PENALTY_DONE) return false

    // ---- Земля трясётся, ворота вылезают ----
    if (state === PENALTY_RISING) {
      timer -= dt
      const t = 1 - Math.max(timer, 0) / PENALTY_RISE_TIME
      // Вылезают рывком с замедлением — будто их выталкивает из земли.
      const eased = 1 - Math.pow(1 - t, 3)
      risen.position.y = -BURIED + BURIED * eased
      // Тряска сильнее всего в начале и затухает к концу подъёма.
      quake = (1 - t) * 1.2

      if (timer <= 0) {
        risen.position.y = 0
        quake = 0
        state = PENALTY_AIMING
        timer = PENALTY_AIM_TIME
        aim.visible = true
      }
      return false
    }

    quake = 0

    // Вратарь ходит вдоль линии — видно и предсказуемо.
    keeperPhase += dt * PENALTY_KEEPER_SPEED
    keeperX = Math.sin(keeperPhase) * (GOAL_WIDTH / 2 - 1.2)
    keeper.position.x = keeperX
    keeper.position.y = Math.abs(Math.sin(keeperPhase * 2)) * 0.14

    if (state === PENALTY_AIMING) {
      // Прицел ходит быстрее вратаря и в другой фазе: поймать промежуток
      // можно, но надо смотреть.
      aimPhase += dt * PENALTY_AIM_SPEED
      aimX = Math.sin(aimPhase) * (GOAL_WIDTH / 2 - 0.7)
      aim.position.x = aimX
      aim.rotation.y += dt * 3
      aim.position.y = 0.5 + Math.abs(Math.sin(aimPhase * 3)) * 0.2

      timer -= dt
      // Время вышло — бьём туда, где прицел, чтобы забег не завис.
      if (timer <= 0) shoot()
      return false
    }

    if (state === PENALTY_FLYING) {
      shotProgress += dt / PENALTY_SHOT_TIME
      const t = Math.min(shotProgress, 1)

      ball.position.x = shotX * t
      ball.position.z = -2.2 + (GOAL_Z + 1.4 + 2.2) * t
      ball.position.y = 0.28 + Math.sin(t * Math.PI) * 1.1
      ball.rotation.x -= dt * 16

      if (t >= 1) {
        // Вратарь дотягивается, если оказался рядом с точкой удара.
        const caught = Math.abs(keeperX - shotX) < 1.3
        scored = !caught
        state = PENALTY_RESULT
        timer = PENALTY_RESULT_TIME
        if (caught) ball.position.x = keeperX
      }
      return false
    }

    // ---- Итог ----
    timer -= dt
    if (scored) {
      ball.position.y = 0.28 + Math.abs(Math.sin(timer * 9)) * 0.35
    }
    if (timer <= 0) {
      state = PENALTY_DONE
      group.visible = false
      return true
    }
    return false
  }

  function reset(): void {
    state = PENALTY_DONE
    timer = 0
    quake = 0
    scored = false
    aim.visible = false
    group.visible = false
    risen.position.y = -BURIED
  }

  return {
    group,
    get state() {
      return state
    },
    get scored() {
      return scored
    },
    get spotX() {
      return group.position.x
    },
    get spotZ() {
      return -1.4
    },
    // Вид от первого лица: камера стоит на уровне глаз и ЧУТЬ ВПЕРЕДИ
    // героя — иначе он попадает в кадр и получается вид из-за спины,
    // а не от первого лица.
    get cameraY() {
      return 1.7
    },
    get cameraZ() {
      return -2
    },
    get lookY() {
      return 1.25
    },
    get quake() {
      return quake
    },
    start,
    shoot,
    update,
    reset,
  }
}
