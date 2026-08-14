import * as THREE from 'three'
import { buildShape } from './geometry'

// Смешные препятствия. Всё из коробок и цилиндров, ни одной скачанной модели.
//
// Действий по-прежнему три — перепрыгнуть, подкатиться, объехать, — чтобы
// ребёнку не приходилось переучиваться под каждую новую картинку. Меняется
// только то, КАК это выглядит.

export const ACTION_HOP = 0
export const ACTION_DUCK = 1
export const ACTION_DODGE = 2

/** Варианты комичной смерти. */
export const DEATH_SLIP = 0 // поскользнулся — крутится волчком
export const DEATH_BOUNCE = 1 // отскочил как мячик
export const DEATH_FLIP = 2 // словил верёвку — кувырок назад
export const DEATH_SPLAT = 3 // влип лицом

export interface ObstacleDef {
  name: string
  action: number
  death: number
  /** Габариты хитбокса. Он выведен из ВИДИМОЙ фигуры, а не наоборот:
   *  бить ребёнка невидимым воздухом нельзя. */
  width: number
  depth: number
  minY: number
  maxY: number
  build(): THREE.BufferGeometry
}

const YELLOW = 0xffe066
const BROWN = 0xe8b04b
const GREEN = 0x7bd389
const RED = 0xff6b6b
const CHEESE = 0xffd93d
const PATTY = 0x9c6b3f
const WHITE = 0xfdfdfd
const DARK = 0x3a3a3a
const PINK = 0xff5d8f
const TEAL = 0x4ecdc4
const PURPLE = 0xa06cd5
const ROPE = 0xe9e2d0

/** Банановая кожура: сердцевина и три разлетевшихся лепестка. Низкая и лёгкая —
 *  это первый прыжок, который ребёнок учится делать. */
function buildBanana(): THREE.BufferGeometry {
  const core = new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8)
  const peel = new THREE.BoxGeometry(0.95, 0.09, 0.3)

  return buildShape([
    { geometry: core, color: YELLOW, y: 0.06 },
    { geometry: peel, color: YELLOW, y: 0.1, x: 0.42, rz: 0.22, ry: 0.15 },
    { geometry: peel, color: YELLOW, y: 0.1, x: -0.36, rz: -0.2, ry: -0.5 },
    { geometry: peel, color: 0xf5d76e, y: 0.1, z: 0.34, ry: 1.35, rz: 0.18 },
  ])
}

/** Спящая корова: лежит поперёк дорожки, её надо перепрыгнуть. Спит, а не
 *  злится — никаких рогов вперёд и оскала (правило №4). */
function buildCow(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(1.35, 0.5, 0.78)
  const spot = new THREE.BoxGeometry(0.3, 0.52, 0.34)
  const head = new THREE.BoxGeometry(0.42, 0.38, 0.44)
  const ear = new THREE.BoxGeometry(0.16, 0.12, 0.2)
  const muzzle = new THREE.BoxGeometry(0.24, 0.18, 0.16)
  const eyelid = new THREE.BoxGeometry(0.26, 0.05, 0.02)

  return buildShape([
    { geometry: body, color: WHITE, y: 0.27 },
    { geometry: spot, color: DARK, y: 0.28, x: -0.25, z: 0.12 },
    { geometry: spot, color: DARK, y: 0.28, x: 0.32, z: -0.14 },
    { geometry: head, color: WHITE, x: -0.82, y: 0.3 },
    { geometry: muzzle, color: PINK, x: -1.04, y: 0.24 },
    { geometry: ear, color: DARK, x: -0.78, y: 0.5, z: 0.24 },
    { geometry: ear, color: DARK, x: -0.78, y: 0.5, z: -0.24 },
    // Закрытые глаза — две спокойные полоски
    { geometry: eyelid, color: DARK, x: -0.9, y: 0.36, z: 0.22 },
    { geometry: eyelid, color: DARK, x: -0.9, y: 0.36, z: -0.22 },
  ])
}

/** Летающие носки на верёвке: висят поперёк дорожки, под ними проезжают.
 *  Нижний край носков специально опущен до самого хитбокса. */
function buildSocks(): THREE.BufferGeometry {
  const rope = new THREE.BoxGeometry(2.1, 0.06, 0.06)
  const leg = new THREE.BoxGeometry(0.32, 0.85, 0.26)
  const foot = new THREE.BoxGeometry(0.5, 0.26, 0.26)
  const peg = new THREE.BoxGeometry(0.08, 0.16, 0.1)

  return buildShape([
    { geometry: rope, color: ROPE, y: 2.4 },
    { geometry: peg, color: BROWN, x: -0.6, y: 2.4 },
    { geometry: peg, color: BROWN, x: 0, y: 2.4 },
    { geometry: peg, color: BROWN, x: 0.6, y: 2.4 },

    { geometry: leg, color: PINK, x: -0.6, y: 1.92 },
    { geometry: foot, color: PINK, x: -0.51, y: 1.45 },

    { geometry: leg, color: TEAL, x: 0, y: 1.85 },
    { geometry: foot, color: TEAL, x: 0.09, y: 1.36 },

    { geometry: leg, color: PURPLE, x: 0.6, y: 1.95 },
    { geometry: foot, color: PURPLE, x: 0.69, y: 1.48 },
  ])
}

/** Гигантский бутерброд: во всю высоту, перепрыгнуть нельзя — только объехать. */
function buildSandwich(): THREE.BufferGeometry {
  const bunBottom = new THREE.BoxGeometry(1.6, 0.4, 0.86)
  const bunTop = new THREE.BoxGeometry(1.62, 0.52, 0.88)
  const salad = new THREE.BoxGeometry(1.72, 0.16, 0.96)
  const tomato = new THREE.BoxGeometry(1.5, 0.2, 0.8)
  const cheese = new THREE.BoxGeometry(1.68, 0.14, 0.92)
  const patty = new THREE.BoxGeometry(1.54, 0.32, 0.82)
  const seed = new THREE.BoxGeometry(0.1, 0.06, 0.1)

  return buildShape([
    { geometry: bunBottom, color: BROWN, y: 0.2 },
    { geometry: salad, color: GREEN, y: 0.48 },
    { geometry: tomato, color: RED, y: 0.68 },
    { geometry: patty, color: PATTY, y: 0.96 },
    { geometry: cheese, color: CHEESE, y: 1.2 },
    { geometry: salad, color: GREEN, y: 1.36 },
    { geometry: bunTop, color: BROWN, y: 1.75 },
    { geometry: seed, color: 0xfff2cc, x: -0.3, y: 1.99, z: 0.1 },
    { geometry: seed, color: 0xfff2cc, x: 0.16, y: 2.0, z: -0.12 },
    { geometry: seed, color: 0xfff2cc, x: 0.42, y: 1.98, z: 0.18 },
  ])
}

export const OBSTACLE_DEFS: ObstacleDef[] = [
  {
    name: 'банан',
    action: ACTION_HOP,
    death: DEATH_SLIP,
    width: 1.5,
    depth: 0.8,
    minY: 0,
    maxY: 0.3,
    build: buildBanana,
  },
  {
    name: 'корова',
    action: ACTION_HOP,
    death: DEATH_BOUNCE,
    width: 1.6,
    depth: 0.85,
    minY: 0,
    maxY: 0.62,
    build: buildCow,
  },
  {
    name: 'носки',
    action: ACTION_DUCK,
    death: DEATH_FLIP,
    width: 1.95,
    depth: 0.5,
    // Верх хитбокса заведомо выше апекса прыжка: носки нельзя перепрыгнуть,
    // под них можно только подкатиться.
    minY: 1.25,
    maxY: 2.7,
    build: buildSocks,
  },
  {
    name: 'бутерброд',
    action: ACTION_DODGE,
    death: DEATH_SPLAT,
    width: 1.6,
    depth: 0.9,
    minY: 0,
    maxY: 2.1,
    build: buildSandwich,
  },
]
