import * as THREE from 'three'
import { buildShape } from './geometry'

// Биомы. Каждые BIOME_LENGTH метров мир полностью меняет палитру
// и декорации по бокам.
//
// Цвета неба, тумана, земли и дороги переливаются плавно, а геометрия
// декораций подменяется разом — но в этот же момент вся уехавшая вперёд
// декорация отправляется за туман, поэтому новый биом «въезжает» из дымки,
// а не хлопает по глазам.

export interface Biome {
  name: string
  /** Цвет у горизонта. Туман красится им же, иначе горизонт видно швом. */
  sky: number
  /** Цвет в зените — верхняя точка градиента неба. */
  skyTop: number
  ground: number
  road: number
  curb: number
  hemiSky: number
  hemiGround: number
  buildTall(): THREE.BufferGeometry
  buildLow(): THREE.BufferGeometry
}

// ---------- Лес ----------

function buildTree(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.22, 0.28, 1.1, 6)
  const crown = new THREE.ConeGeometry(1.05, 1.9, 7)
  const crownTop = new THREE.ConeGeometry(0.75, 1.5, 7)

  return buildShape([
    { geometry: trunk, color: 0x7a5230, y: 0.55 },
    { geometry: crown, color: 0x1f9c5a, y: 1.75 },
    { geometry: crownTop, color: 0x2bb96b, y: 2.6 },
  ])
}

function buildBush(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.75, 7, 6)
  const lump = new THREE.SphereGeometry(0.5, 6, 5)

  return buildShape([
    { geometry: body, color: 0xff9f45, y: 0.6 },
    { geometry: lump, color: 0xffb968, y: 0.85, x: 0.45 },
  ])
}

// ---------- Космос ----------

function buildCrystal(): THREE.BufferGeometry {
  const shard = new THREE.OctahedronGeometry(0.7, 0)
  const small = new THREE.OctahedronGeometry(0.42, 0)

  return buildShape([
    { geometry: shard, color: 0x8f7bff, y: 1.7, rz: 0.2 },
    { geometry: small, color: 0x4ecdc4, y: 0.65, x: 0.55, rz: -0.4 },
    { geometry: small, color: 0xff5d8f, y: 0.5, x: -0.5, rz: 0.5 },
  ])
}

function buildAsteroid(): THREE.BufferGeometry {
  const rock = new THREE.IcosahedronGeometry(0.7, 0)
  const chip = new THREE.IcosahedronGeometry(0.34, 0)

  return buildShape([
    { geometry: rock, color: 0x5a5a7a, y: 0.7 },
    { geometry: chip, color: 0x8080a0, y: 1.2, x: 0.4 },
  ])
}

// ---------- Подводный мир ----------

function buildCoral(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 6)
  const branch = new THREE.CylinderGeometry(0.11, 0.15, 1, 5)
  const tip = new THREE.SphereGeometry(0.22, 6, 5)

  return buildShape([
    { geometry: stem, color: 0xff6f91, y: 0.7 },
    { geometry: branch, color: 0xff8fab, y: 1.5, x: 0.34, rz: -0.6 },
    { geometry: branch, color: 0xffa6c1, y: 1.6, x: -0.3, rz: 0.5 },
    { geometry: tip, color: 0xffd93d, y: 2.05, x: 0.6 },
    { geometry: tip, color: 0xffd93d, y: 2.15, x: -0.55 },
  ])
}

function buildAnemone(): THREE.BufferGeometry {
  const base = new THREE.SphereGeometry(0.6, 7, 6)
  const bubble = new THREE.SphereGeometry(0.28, 6, 5)

  return buildShape([
    { geometry: base, color: 0x6be5c3, y: 0.5 },
    { geometry: bubble, color: 0xbdfff0, y: 1.15, x: 0.2 },
    { geometry: bubble, color: 0xbdfff0, y: 1.55, x: -0.15 },
  ])
}

// ---------- Страна конфет ----------

function buildLollipop(): THREE.BufferGeometry {
  const stick = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6)
  const candy = new THREE.CylinderGeometry(0.85, 0.85, 0.26, 12)
  const swirl = new THREE.TorusGeometry(0.45, 0.12, 6, 12)

  return buildShape([
    { geometry: stick, color: 0xfff6e8, y: 0.9 },
    { geometry: candy, color: 0xff5d8f, y: 2.3, rx: Math.PI / 2 },
    { geometry: swirl, color: 0xfff6e8, y: 2.3, z: 0.16 },
  ])
}

function buildGumdrop(): THREE.BufferGeometry {
  const drop = new THREE.ConeGeometry(0.62, 1.05, 8)
  const top = new THREE.SphereGeometry(0.3, 7, 6)

  return buildShape([
    { geometry: drop, color: 0xa06cd5, y: 0.52 },
    { geometry: top, color: 0xc79bef, y: 1.02 },
  ])
}

export const BIOMES: Biome[] = [
  {
    name: 'Лес',
    skyTop: 0x3aa0ff,
    sky: 0x8fd3ff,
    ground: 0x2f7d4f,
    road: 0x3b4a63,
    curb: 0xffd93d,
    hemiSky: 0xffffff,
    hemiGround: 0x5a7a4a,
    buildTall: buildTree,
    buildLow: buildBush,
  },
  {
    name: 'Космос',
    skyTop: 0x05020f,
    sky: 0x140b33,
    ground: 0x231452,
    road: 0x33246b,
    curb: 0x4ecdc4,
    hemiSky: 0xbba8ff,
    hemiGround: 0x2a1b5e,
    buildTall: buildCrystal,
    buildLow: buildAsteroid,
  },
  {
    name: 'Подводный мир',
    skyTop: 0x02405e,
    sky: 0x0e7ab0,
    ground: 0xd9c58b,
    road: 0x2f6f8f,
    curb: 0xff9f45,
    hemiSky: 0xaee7ff,
    hemiGround: 0x1b5c7a,
    buildTall: buildCoral,
    buildLow: buildAnemone,
  },
  {
    name: 'Страна конфет',
    skyTop: 0xb06cff,
    sky: 0xffd1ea,
    ground: 0xffe8f5,
    road: 0xb87fb0,
    curb: 0xff5d8f,
    hemiSky: 0xffffff,
    hemiGround: 0xffc2e0,
    buildTall: buildLollipop,
    buildLow: buildGumdrop,
  },
]

export function biomeAt(distance: number, biomeLength: number): number {
  return Math.floor(Math.max(distance, 0) / biomeLength) % BIOMES.length
}
