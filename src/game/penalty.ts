import * as THREE from 'three'
import {
  PENALTY_AIM_TIME,
  PENALTY_KEEPER_SPEED,
  PENALTY_RESULT_TIME,
  PENALTY_SHOT_TIME,
} from './config'
import { buildShape } from './geometry'

// Пенальти — мини-игра по силе Роналду.
//
// Герой отбегает влево к воротам, вратарь мечется вдоль линии, ребёнок
// бьёт в одну из трёх зон. Попал мимо вратаря — гол и бежим дальше.
//
// ВАЖНО про честность: вратарь ходит ВИДИМО и предсказуемо, а зона удара
// выбирается ребёнком. Это навык, а не лотерея: если бы вратарь прыгал
// случайно, промах ощущался бы как отобранный ни за что забег.

export const PENALTY_AIMING = 0
export const PENALTY_FLYING = 1
export const PENALTY_GOAL = 2
export const PENALTY_SAVED = 3
export const PENALTY_DONE = 4

/** Три зоны удара: влево, по центру, вправо. */
const SHOT_X = [-1.55, 0, 1.55]

const GOAL_WIDTH = 5.2
const GOAL_HEIGHT = 2.4
const GOAL_Z = -13

function buildGoal(): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(0.12, 0.12, GOAL_HEIGHT, 8)
  const bar = new THREE.CylinderGeometry(0.12, 0.12, GOAL_WIDTH, 8)
  const net = new THREE.BoxGeometry(GOAL_WIDTH, GOAL_HEIGHT, 0.08)

  return buildShape([
    { geometry: post, color: 0xffffff, x: -GOAL_WIDTH / 2, y: GOAL_HEIGHT / 2 },
    { geometry: post, color: 0xffffff, x: GOAL_WIDTH / 2, y: GOAL_HEIGHT / 2 },
    { geometry: bar, color: 0xffffff, y: GOAL_HEIGHT, rz: Math.PI / 2 },
    // Сетка — полупрозрачной её делать незачем, достаточно светлой плиты
    // позади: на скорости ребёнок читает силуэт ворот, а не ячейки.
    { geometry: net, color: 0xdfe6f0, y: GOAL_HEIGHT / 2, z: -0.9 },
  ])
}

function buildKeeper(): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(0.34, 0.6, 4, 8)
  const head = new THREE.SphereGeometry(0.28, 10, 8)
  const glove = new THREE.SphereGeometry(0.22, 7, 6)
  const eye = new THREE.SphereGeometry(0.07, 6, 5)

  return buildShape([
    { geometry: body, color: 0x2ecc71, y: 0.85 },
    { geometry: head, color: 0xffd9a8, y: 1.5 },
    { geometry: eye, color: 0x1a202c, x: -0.1, y: 1.55, z: 0.24 },
    { geometry: eye, color: 0x1a202c, x: 0.1, y: 1.55, z: 0.24 },
    // Руки в стороны — поза вратаря читается мгновенно
    { geometry: glove, color: 0xffd93d, x: -0.62, y: 1.25 },
    { geometry: glove, color: 0xffd93d, x: 0.62, y: 1.25 },
  ])
}

function buildBall(): THREE.BufferGeometry {
  const ball = new THREE.SphereGeometry(0.26, 12, 10)
  const patch = new THREE.SphereGeometry(0.1, 6, 5)

  return buildShape([
    { geometry: ball, color: 0xffffff },
    { geometry: patch, color: 0x1a202c, y: 0.2 },
    { geometry: patch, color: 0x1a202c, x: 0.2 },
    { geometry: patch, color: 0x1a202c, z: 0.2 },
    { geometry: patch, color: 0x1a202c, x: -0.2, y: -0.1 },
  ])
}

export interface Penalty {
  readonly group: THREE.Group
  readonly state: number
  /** Куда встать герою на время пенальти. */
  readonly playerX: number
  readonly playerZ: number
  start(): void
  /** Удар в зону: -1 влево, 0 центр, 1 вправо. */
  shoot(direction: -1 | 0 | 1): void
  /** Возвращает true в кадре, когда мини-игра закончилась. */
  update(dt: number): boolean
  readonly scored: boolean
  reset(): void
}

export function createPenalty(): Penalty {
  const group = new THREE.Group()
  group.visible = false
  // Площадка стоит слева от трассы — герой к ней отбегает.
  group.position.set(-11, 0, 0)

  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })

  const goal = new THREE.Mesh(buildGoal(), material)
  goal.position.z = GOAL_Z
  group.add(goal)

  const keeper = new THREE.Mesh(buildKeeper(), material)
  keeper.position.z = GOAL_Z + 0.9
  group.add(keeper)

  const ball = new THREE.Mesh(buildBall(), material)
  ball.position.set(0, 0.26, -2)
  group.add(ball)

  // Газон под площадкой
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 18),
    new THREE.MeshLambertMaterial({ color: 0x3f9c58 }),
  )
  pitch.rotation.x = -Math.PI / 2
  pitch.position.set(0, 0.01, GOAL_Z / 2)
  group.add(pitch)

  let state = PENALTY_DONE
  let timer = 0
  let keeperPhase = 0
  let keeperX = 0
  let shotLane = 0
  let shotProgress = 0
  let scored = false

  function start(): void {
    state = PENALTY_AIMING
    timer = PENALTY_AIM_TIME
    keeperPhase = 0
    shotProgress = 0
    scored = false
    ball.position.set(0, 0.26, -2)
    ball.visible = true
    group.visible = true
  }

  function shoot(direction: -1 | 0 | 1): void {
    if (state !== PENALTY_AIMING) return
    shotLane = direction
    state = PENALTY_FLYING
    shotProgress = 0
  }

  function update(dt: number): boolean {
    if (state === PENALTY_DONE) return false

    // Вратарь ходит вдоль линии по синусу — видно и предсказуемо.
    keeperPhase += dt * PENALTY_KEEPER_SPEED
    keeperX = Math.sin(keeperPhase) * (GOAL_WIDTH / 2 - 0.8)
    keeper.position.x = keeperX
    keeper.position.y = Math.abs(Math.sin(keeperPhase * 2)) * 0.12

    if (state === PENALTY_AIMING) {
      timer -= dt
      // Время вышло — бьём наугад по центру, чтобы забег не завис навсегда.
      if (timer <= 0) shoot(0)
      return false
    }

    if (state === PENALTY_FLYING) {
      shotProgress += dt / PENALTY_SHOT_TIME
      const t = Math.min(shotProgress, 1)

      const targetX = SHOT_X[shotLane + 1]
      ball.position.x = targetX * t
      ball.position.z = -2 + (GOAL_Z + 1.2 + 2) * t
      // Дуга — мяч не едет по линейке
      ball.position.y = 0.26 + Math.sin(t * Math.PI) * 0.9
      ball.rotation.x -= dt * 14

      if (t >= 1) {
        // Вратарь ловит, если оказался достаточно близко к зоне удара.
        const caught = Math.abs(keeperX - targetX) < 1.0
        scored = !caught
        state = scored ? PENALTY_GOAL : PENALTY_SAVED
        timer = PENALTY_RESULT_TIME
        if (caught) ball.position.x = keeperX
      }
      return false
    }

    // Итог показан — уходим обратно на трассу.
    timer -= dt
    if (state === PENALTY_GOAL) {
      ball.position.y = 0.26 + Math.abs(Math.sin(timer * 9)) * 0.3
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
    keeperPhase = 0
    shotProgress = 0
    scored = false
    group.visible = false
  }

  return {
    group,
    get state() {
      return state
    },
    get playerX() {
      return group.position.x
    },
    get playerZ() {
      return -1.2
    },
    start,
    shoot,
    update,
    get scored() {
      return scored
    },
    reset,
  }
}
