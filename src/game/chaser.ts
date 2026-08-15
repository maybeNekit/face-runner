import * as THREE from 'three'
import {
  CHASER_BOB_SPEED,
  CHASER_LANE_LAG,
  CHASER_SIDE_OFFSET,
  CHASER_Z,
} from './config'
import { buildShape } from './geometry'
import type { ShapePart } from './geometry'

// ЧЕРЕМША — лев с заячьими ушами и необъятной гривой. Гонится за героем.
//
// Собран из примитивов, как и всё в игре. Морда нарочно не злая: брови
// домиком и вечно недовольный вид — это шутка, а не угроза (правило №4).
// Ни клыков, ни когтей, ни оскала.

const FUR_DARK = 0x8a7256
const FUR = 0xa8906f
const FUR_LIGHT = 0xc4ad8c
const MUZZLE = 0xe8dcc4
const EAR_INNER = 0xd9a2a2
const NOSE = 0x5c4033
const EYE_WHITE = 0xf7e9a0
const EYE_DARK = 0x2b2118

/** Клок гривы: сфера со случайным смещением, чтобы грива была лохматой. */
function maneClump(parts: ShapePart[], angle: number, radius: number, size: number): void {
  parts.push({
    geometry: new THREE.SphereGeometry(size, 6, 5),
    color: angle % 2 > 1 ? FUR_DARK : FUR,
    x: Math.cos(angle) * radius,
    y: 1.75 + Math.sin(angle) * radius,
    z: -0.15,
  })
}

function buildCheremsha(): THREE.BufferGeometry {
  const parts: ShapePart[] = []

  // ---- Грива: кольцо лохматых клоков вокруг морды ----
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2
    maneClump(parts, angle, 0.92, 0.42 + (i % 3) * 0.07)
  }
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2 + 0.3
    maneClump(parts, angle, 0.66, 0.36)
  }

  // ---- Туловище: пушистый ком позади ----
  parts.push(
    { geometry: new THREE.SphereGeometry(0.85, 8, 7), color: FUR_DARK, y: 0.85, z: -1.15 },
    { geometry: new THREE.SphereGeometry(0.6, 7, 6), color: FUR, y: 0.5, z: -0.6 },
  )

  // ---- Лапы ----
  const paw = new THREE.SphereGeometry(0.3, 6, 5)
  parts.push(
    { geometry: paw, color: FUR_LIGHT, x: -0.48, y: 0.28, z: 0.35 },
    { geometry: paw, color: FUR_LIGHT, x: 0.48, y: 0.28, z: 0.35 },
  )

  // ---- Морда ----
  parts.push({ geometry: new THREE.SphereGeometry(0.66, 10, 8), color: FUR_LIGHT, y: 1.75, z: 0.1 })

  // Щёки-брыли и подбородок — от них морда становится добродушной
  const cheek = new THREE.SphereGeometry(0.3, 7, 6)
  parts.push(
    { geometry: cheek, color: MUZZLE, x: -0.24, y: 1.5, z: 0.5 },
    { geometry: cheek, color: MUZZLE, x: 0.24, y: 1.5, z: 0.5 },
    { geometry: new THREE.SphereGeometry(0.22, 6, 5), color: MUZZLE, y: 1.32, z: 0.42 },
  )

  // Нос
  parts.push({
    geometry: new THREE.BoxGeometry(0.22, 0.14, 0.12),
    color: NOSE,
    y: 1.66,
    z: 0.62,
    rx: 0.3,
  })

  // ---- Глаза: янтарные, с вечно недовольным прищуром ----
  const eyeBall = new THREE.SphereGeometry(0.17, 7, 6)
  const pupil = new THREE.SphereGeometry(0.085, 6, 5)
  const brow = new THREE.BoxGeometry(0.34, 0.09, 0.1)

  for (const side of [-1, 1]) {
    parts.push(
      { geometry: eyeBall, color: EYE_WHITE, x: side * 0.27, y: 1.87, z: 0.5 },
      { geometry: pupil, color: EYE_DARK, x: side * 0.27, y: 1.87, z: 0.63 },
      // Брови домиком — главный источник комичной хмурости
      {
        geometry: brow,
        color: FUR_DARK,
        x: side * 0.28,
        y: 2.04,
        z: 0.52,
        rz: side * -0.35,
      },
    )
  }

  // ---- Усы ----
  const whisker = new THREE.BoxGeometry(0.5, 0.03, 0.03)
  for (const side of [-1, 1]) {
    parts.push(
      { geometry: whisker, color: MUZZLE, x: side * 0.5, y: 1.52, z: 0.52, rz: side * 0.18 },
      { geometry: whisker, color: MUZZLE, x: side * 0.5, y: 1.44, z: 0.5, rz: side * -0.12 },
    )
  }

  return buildShape(parts)
}

/** Уши строятся отдельным мешем: они машут независимо от туловища. */
function buildEar(): THREE.BufferGeometry {
  return buildShape([
    { geometry: new THREE.CapsuleGeometry(0.2, 1.5, 4, 7), color: FUR, y: 0.85 },
    { geometry: new THREE.CapsuleGeometry(0.11, 1.15, 3, 6), color: EAR_INNER, y: 0.85, z: 0.1 },
  ])
}

export interface Chaser {
  readonly group: THREE.Group
  update(dt: number, playerX: number, speed: number, dying: boolean): void
  /** Поза вступления: Черемша стоит в кадре и замечает жест героя. */
  updateIntro(dt: number, time: number, noticed: boolean): void
  reset(): void
}

export function createChaser(): Chaser {
  const group = new THREE.Group()

  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })
  const body = new THREE.Mesh(buildCheremsha(), material)
  group.add(body)

  // Уши — отдельные меши, чтобы махать ими на бегу.
  const earGeometry = buildEar()
  const leftEar = new THREE.Mesh(earGeometry, material)
  const rightEar = new THREE.Mesh(earGeometry, material)
  leftEar.position.set(-0.34, 2.05, -0.1)
  rightEar.position.set(0.34, 2.05, -0.1)
  group.add(leftEar)
  group.add(rightEar)

  // Тень-пятно: без неё Черемша висит в воздухе.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 18),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.03
  group.add(shadow)

  let phase = 0
  let x = 0

  /**
   * Вступление: Черемша стоит сбоку от героя, сначала спокойно, потом
   * замечает жест и вскипает — подпрыгивает, уши встают торчком.
   * Это и есть завязка: побежали потому, что она увидела.
   */
  function updateIntro(dt: number, time: number, noticed: boolean): void {
    phase += dt * (noticed ? CHASER_BOB_SPEED : 2.2)

    // Стоит справа и заметно ближе к камере, чем на бегу: её должно быть
    // хорошо видно рядом с героем.
    group.position.set(3.1, 0, 1.4)
    group.rotation.set(0, -0.5, 0)

    if (!noticed) {
      // Пока не заметила — мирно принюхивается.
      const idle = Math.sin(time * 2.4) * 0.06
      group.position.y = 0
      body.rotation.x = idle
      body.scale.set(1, 1, 1)
      leftEar.rotation.z = 0.2 + idle
      rightEar.rotation.z = -0.2 - idle
      shadow.position.y = 0.03
      return
    }

    // Заметила: подпрыгивает от возмущения, уши встают торчком.
    const outrage = Math.abs(Math.sin(phase)) * 0.55
    group.position.y = outrage
    body.rotation.x = -0.18
    const puff = 1 + Math.sin(phase * 2) * 0.1
    body.scale.set(2 - puff, puff, 2 - puff)
    leftEar.rotation.z = 0.05
    rightEar.rotation.z = -0.05
    leftEar.rotation.x = -0.05
    rightEar.rotation.x = -0.05
    shadow.position.y = -outrage + 0.03
  }

  function update(dt: number, playerX: number, speed: number, dying: boolean): void {
    phase += dt * CHASER_BOB_SPEED

    // Едет за игроком по дорожкам с отставанием: если бы повторял точь-в-точь,
    // погоня выглядела бы приклеенной.
    //
    // Держится сбоку, а не строго за спиной: иначе полностью закрывает
    // героя, ведь бежит между камерой и игроком. Сторону выбирает так,
    // чтобы не выскакивать за край дороги.
    const side = playerX > 0 ? -1 : 1
    const target = playerX + side * CHASER_SIDE_OFFSET
    x += (target - x) * Math.min(1, dt * CHASER_LANE_LAG)
    group.position.x = x

    // Скачет вприпрыжку — заяц всё-таки.
    const hop = Math.abs(Math.sin(phase)) * 0.42
    group.position.y = hop
    group.position.z = CHASER_Z

    // При скачке тело чуть вытягивается, на приземлении сплющивается.
    const stretch = 1 + Math.cos(phase) * 0.08
    body.scale.set(2 - stretch, stretch, 2 - stretch)

    // Уши отстают от скачка — это и делает его смешным.
    const earSwing = Math.sin(phase - 0.7) * 0.45
    leftEar.rotation.z = 0.16 + earSwing
    rightEar.rotation.z = -0.16 - earSwing
    leftEar.rotation.x = -0.2 + Math.sin(phase * 0.7) * 0.12
    rightEar.rotation.x = -0.2 + Math.cos(phase * 0.7) * 0.12

    // Тень остаётся на земле и сжимается в прыжке.
    shadow.position.y = -hop + 0.03
    const shadowScale = 1 - hop * 0.35
    shadow.scale.set(shadowScale, shadowScale, 1)

    // Когда герой споткнулся — Черемша радостно набегает и нависает.
    if (dying) {
      group.position.z = CHASER_Z + Math.min(phase * 0.35, 3.2)
      body.rotation.x = -0.25
    } else {
      body.rotation.x = 0
    }

    // На разгоне наклоняется вперёд.
    group.rotation.x = -Math.min(speed * 0.006, 0.14)
  }

  function reset(): void {
    phase = 0
    x = 0
    group.position.set(0, 0, CHASER_Z)
    group.rotation.set(0, 0, 0)
    body.rotation.set(0, 0, 0)
    body.scale.set(1, 1, 1)
  }

  reset()

  return { group, update, updateIntro, reset }
}
