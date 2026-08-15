import * as THREE from 'three'
import {
  AIR_DIVE_BUFFER,
  AIR_DIVE_VELOCITY,
  COIN_SQUASH,
  COYOTE_TIME,
  DEATH_BACK_VELOCITY,
  DEATH_BOUNCE,
  DEATH_LAUNCH_VELOCITY,
  DEATH_TUMBLE_DAMP,
  DEATH_TUMBLE_SPEED,
  GIANT_HEAD_SCALE,
  GRAVITY_DOWN,
  GRAVITY_UP,
  GRIMACE_DURATION,
  GRIMACE_GAP_MAX,
  GRIMACE_GAP_MIN,
  GRIMACE_STRENGTH,
  HEAD_BOB,
  HITBOX_SCALE,
  HITBOX_WIDTH,
  INPUT_BUFFER_TIME,
  JELLY_AMPLITUDE,
  JELLY_FREQUENCY,
  JET_GRAVITY_SCALE,
  JET_JUMP_BOOST,
  JUMP_VELOCITY,
  KOLOBOK_RADIUS,
  KOLOBOK_SPIN,
  LANE_BLOCKED_TILT,
  LANE_CHANGE_TIME,
  LANE_COUNT,
  LANE_TILT,
  LANE_WIDTH,
  LANE_X,
  MODIFIER_MORPH_SPEED,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SLIDE_HEIGHT,
  RUN_CYCLE_BASE,
  RUN_CYCLE_SPEED_GAIN,
  SLIDE_DURATION,
  SQUASH_LAND,
  SQUASH_RECOVER,
  STRETCH_JUMP,
  TINY_BODY_SCALE,
} from './config'
import {
  MOD_GIANT_HEAD,
  MOD_JELLY,
  MOD_JET_BOOTS,
  MOD_KOLOBOK,
  MOD_NONE,
  MOD_TINY_BODY,
} from './modifiers'
import { DEATH_BOUNCE as HIT_BOUNCE, DEATH_FLIP, DEATH_SLIP, DEATH_SPLAT } from './obstacle-shapes'

// Персонаж: низкополигональное тело из примитивов, на голове — лицо ребёнка.

export interface PlayerHandlers {
  onJump(): void
  onLand(): void
  onSlide(): void
  onLaneChange(): void
  /** Свайп в сторону, где дорожки уже нет. Молчать тут нельзя: ребёнок
   *  читает тишину как «игра меня не услышала» и свайпает сильнее. */
  onLaneBlocked(): void
  /** Персонаж скорчил рожу — момент, когда надо издать нелепый звук. */
  onGrimace(kind: number): void
}

export interface Player {
  readonly group: THREE.Group
  readonly x: number
  readonly halfWidth: number
  readonly minY: number
  readonly maxY: number
  readonly lane: number
  readonly isDead: boolean

  setFace(dataUrl: string | null): void
  leaveGround(): void
  requestJump(): void
  requestSlide(): void
  requestLane(direction: -1 | 1): void
  celebrate(): void
  setModifier(modifier: number): void
  /** Поза вступления: герой лицом к камере делает жест «6-7». */
  setIntro(active: boolean, time: number): void
  update(dt: number, speed: number): void
  die(variant: number): void
  reset(): void
}

const SKIN = 0xffd9a8
const SHIRT = 0x4ecdc4
const PANTS = 0x46508f
const SHOE = 0xff5d8f

/** Виды гримас. */
export const GRIMACE_PUFF = 0
export const GRIMACE_STRETCH = 1
export const GRIMACE_WOBBLE = 2
const GRIMACE_KINDS = 3

export function createPlayer(handlers: PlayerHandlers): Player {
  const group = new THREE.Group()

  // pivot несёт squash & stretch, чтобы не трогать масштаб корневой группы,
  // от которой считаются позиция и хитбокс.
  const pivot = new THREE.Group()
  group.add(pivot)

  const skinMaterial = new THREE.MeshLambertMaterial({ color: SKIN })
  const shirtMaterial = new THREE.MeshLambertMaterial({ color: SHIRT })
  const pantsMaterial = new THREE.MeshLambertMaterial({ color: PANTS })
  const shoeMaterial = new THREE.MeshLambertMaterial({ color: SHOE })

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(PLAYER_RADIUS, 0.5, 4, 8), shirtMaterial)
  torso.position.y = 0.95
  pivot.add(torso)

  // headGroup отвечает за масштаб «огромной головы», чтобы не спорить
  // с гримасами и покачиванием.
  const headGroup = new THREE.Group()
  headGroup.position.y = 1.52
  pivot.add(headGroup)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), skinMaterial)
  headGroup.add(head)

  // Лицо смотрит НА КАМЕРУ, то есть в +z — камера стоит позади персонажа.
  // Анатомически это затылок, но смысл игры в том, чтобы ребёнок видел
  // своё лицо во время бега; сзади оно было бы не видно вообще.
  //
  // Сегментов 8×8 не для красоты: по этим вершинам лицо и корчит рожи.
  const faceGeometry = new THREE.PlaneGeometry(0.58, 0.58, 8, 8)
  const facePosition = faceGeometry.attributes.position as THREE.BufferAttribute
  const faceBase = Float32Array.from(facePosition.array as Float32Array)
  const faceMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
  })
  const face = new THREE.Mesh(faceGeometry, faceMaterial)
  face.position.set(0, 0.01, 0.3)
  face.visible = false
  headGroup.add(face)

  const armGeometry = new THREE.CapsuleGeometry(0.1, 0.42, 3, 6)
  const leftArm = new THREE.Mesh(armGeometry, skinMaterial)
  const rightArm = new THREE.Mesh(armGeometry, skinMaterial)
  leftArm.position.set(-0.42, 1.02, 0)
  rightArm.position.set(0.42, 1.02, 0)
  pivot.add(leftArm)
  pivot.add(rightArm)

  const legGeometry = new THREE.CapsuleGeometry(0.13, 0.44, 3, 6)
  const leftLeg = new THREE.Mesh(legGeometry, pantsMaterial)
  const rightLeg = new THREE.Mesh(legGeometry, pantsMaterial)
  leftLeg.position.set(-0.17, 0.4, 0)
  rightLeg.position.set(0.17, 0.4, 0)
  pivot.add(leftLeg)
  pivot.add(rightLeg)

  // Мягкая тень-пятно под ногами. Без неё персонаж «плавает» над дорогой,
  // и в прыжке невозможно понять, где он приземлится. Живёт в корневой
  // группе, но каждый кадр опускается обратно на землю.
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), shadowMaterial)
  shadow.rotation.x = -Math.PI / 2
  group.add(shadow)

  // Колобок: герой сворачивается в шар, на котором остаётся только лицо.
  // Тело в этот момент прячется целиком — «мы становимся круглым».
  const kolobok = new THREE.Mesh(
    new THREE.SphereGeometry(KOLOBOK_RADIUS, 16, 12),
    skinMaterial,
  )
  kolobok.position.y = KOLOBOK_RADIUS
  kolobok.visible = false
  pivot.add(kolobok)

  const shoeGeometry = new THREE.BoxGeometry(0.22, 0.12, 0.34)
  const leftShoe = new THREE.Mesh(shoeGeometry, shoeMaterial)
  const rightShoe = new THREE.Mesh(shoeGeometry, shoeMaterial)
  pivot.add(leftShoe)
  pivot.add(rightShoe)

  // ---- Состояние ----

  let lane = 1
  let laneTo = 1
  let laneT = 1
  let laneStartX = LANE_X[1]
  let laneDuration = LANE_CHANGE_TIME
  let laneDir = 1
  let blockedTilt = 0

  let y = 0
  let vy = 0
  let onGround = true

  let sliding = false
  let slideTimer = 0

  let dead = false
  let deathTime = 0
  let deathVariant = HIT_BOUNCE
  let tumble = 0
  let spin = 0

  let runPhase = 0
  let squash = 1
  let coyote = 0
  let bufferedJump = 0
  let bufferedSlide = 0

  let grimaceTimer = GRIMACE_GAP_MIN
  let grimaceLeft = 0
  let grimaceKind = GRIMACE_PUFF

  let modifier = MOD_NONE
  let intro = false
  let introTime = 0
  let roll = 0
  let headScale = 1
  let bodyScale = 1
  let jelly = 0
  let jellyPhase = 0

  const textureLoader = new THREE.TextureLoader()

  function setFace(dataUrl: string | null): void {
    if (!dataUrl) {
      face.visible = false
      return
    }
    textureLoader.load(dataUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      faceMaterial.map = texture
      faceMaterial.needsUpdate = true
      face.visible = true
    })
  }

  /**
   * Деформация лица по вершинам плоскости.
   *
   * Это настоящая деформация, а не масштаб: середина выпучивается вперёд,
   * края расходятся. 81 вершина — на кадре не заметно, зато лицо ребёнка
   * действительно надувается, а не просто растягивается прямоугольником.
   */
  function applyGrimace(kind: number, amount: number): void {
    const array = facePosition.array as Float32Array

    for (let i = 0; i < array.length; i += 3) {
      const bx = faceBase[i]
      const by = faceBase[i + 1]
      // Нормированное расстояние от центра лица (радиус плоскости 0.29).
      const r = Math.min(Math.hypot(bx, by) / 0.29, 1)

      if (kind === GRIMACE_PUFF) {
        const bulge = (1 - r * r) * amount
        array[i] = bx * (1 + amount * 0.2)
        array[i + 1] = by * (1 + amount * 0.12)
        array[i + 2] = bulge * GRIMACE_STRENGTH
      } else if (kind === GRIMACE_STRETCH) {
        array[i] = bx * (1 - amount * 0.28)
        array[i + 1] = by * (1 + amount * 0.45)
        array[i + 2] = 0
      } else {
        array[i] = bx + Math.sin(by * 16) * amount * 0.05
        array[i + 1] = by + Math.sin(bx * 16) * amount * 0.045
        array[i + 2] = Math.sin((bx + by) * 12) * amount * 0.05
      }
    }

    facePosition.needsUpdate = true
  }

  function currentHeight(): number {
    return (sliding ? PLAYER_SLIDE_HEIGHT : PLAYER_HEIGHT) * bodyScale
  }

  function gravityScale(): number {
    return modifier === MOD_JET_BOOTS ? JET_GRAVITY_SCALE : 1
  }

  function startJump(): void {
    vy = JUMP_VELOCITY * (modifier === MOD_JET_BOOTS ? JET_JUMP_BOOST : 1)
    onGround = false
    coyote = 0
    sliding = false
    slideTimer = 0
    squash = STRETCH_JUMP
    handlers.onJump()
  }

  function startSlide(): void {
    sliding = true
    slideTimer = SLIDE_DURATION
    handlers.onSlide()
  }

  function leaveGround(): void {
    if (!onGround || dead) return
    onGround = false
    coyote = COYOTE_TIME
  }

  function requestJump(): void {
    if (dead) return
    bufferedJump = INPUT_BUFFER_TIME
  }

  function requestSlide(): void {
    if (dead) return

    if (!onGround) {
      // В воздухе свайп вниз — это дайв: персонаж камнем идёт вниз и
      // приземляется уже в подкате.
      vy = Math.min(vy, -AIR_DIVE_VELOCITY)
      bufferedSlide = AIR_DIVE_BUFFER
      return
    }

    bufferedSlide = INPUT_BUFFER_TIME
  }

  function requestLane(direction: -1 | 1): void {
    if (dead) return

    const next = Math.min(Math.max(laneTo + direction, 0), LANE_COUNT - 1)
    if (next === laneTo) {
      blockedTilt = direction * LANE_BLOCKED_TILT
      handlers.onLaneBlocked()
      return
    }

    laneStartX = group.position.x
    laneTo = next
    laneDir = direction
    laneT = 0
    laneDuration =
      LANE_CHANGE_TIME * Math.max(0.35, Math.abs(LANE_X[next] - laneStartX) / LANE_WIDTH)
    handlers.onLaneChange()
  }

  function celebrate(): void {
    if (dead) return
    squash = COIN_SQUASH
  }

  function setModifier(next: number): void {
    modifier = next
  }

  /**
   * Поза вступления: герой разворачивается к камере и делает жест «6-7» —
   * обе ладони вверх и попеременно качаются. Именно это и выводит Черемшу.
   */
  function setIntro(active: boolean, time: number): void {
    intro = active
    introTime = time
  }

  function die(variant: number): void {
    if (dead) return
    dead = true
    deathTime = 0
    deathVariant = variant
    sliding = false

    // Каждый тип препятствия роняет по-своему — проигрыш должен быть
    // шуткой, а шутка не должна повторяться одинаково.
    if (variant === DEATH_SLIP) {
      // Поскользнулся на банане: подлетают ноги, крутит вокруг своей оси.
      vy = DEATH_LAUNCH_VELOCITY * 0.75
      tumble = DEATH_TUMBLE_SPEED * 0.5
      spin = 16
    } else if (variant === HIT_BOUNCE) {
      // Отскочил от коровы как мячик: высоко вверх и назад.
      vy = DEATH_LAUNCH_VELOCITY * 1.3
      tumble = DEATH_TUMBLE_SPEED * 0.7
      spin = 3
    } else if (variant === DEATH_FLIP) {
      // Верёвка с носками: кувырок назад через голову.
      vy = DEATH_LAUNCH_VELOCITY * 0.9
      tumble = DEATH_TUMBLE_SPEED * 1.6
      spin = 0
    } else {
      // Влип лицом в бутерброд: почти не подлетает, сползает.
      vy = DEATH_LAUNCH_VELOCITY * 0.35
      tumble = DEATH_TUMBLE_SPEED * 0.25
      spin = 0
    }
  }

  function updateDeath(dt: number): void {
    deathTime += dt
    vy -= GRAVITY_DOWN * dt
    y += vy * dt

    if (y <= 0) {
      y = 0
      // Комичный отскок вместо мёртвого шлепка. От коровы отскакивает сильнее.
      const bounce = deathVariant === HIT_BOUNCE ? DEATH_BOUNCE * 1.7 : DEATH_BOUNCE
      if (vy < -2) vy = -vy * bounce
      else vy = 0
    }

    tumble *= Math.exp(-DEATH_TUMBLE_DAMP * dt)
    spin *= Math.exp(-DEATH_TUMBLE_DAMP * 0.8 * dt)

    pivot.rotation.x -= tumble * dt
    pivot.rotation.y += spin * dt
    pivot.rotation.z += tumble * 0.35 * dt

    // Влип лицом — заваливается вперёд и плющится, а не кувыркается.
    if (deathVariant === DEATH_SPLAT) {
      pivot.rotation.x = Math.max(pivot.rotation.x, -1.35)
      const flat = Math.min(deathTime * 3, 1)
      pivot.scale.set(1 + flat * 0.35, 1 - flat * 0.4, 1 + flat * 0.2)
    }

    group.position.z += DEATH_BACK_VELOCITY * dt

    // Голова «удивляется» — резко раздувается и качается.
    const wobble = 1 + Math.sin(deathTime * 22) * 0.16
    headGroup.scale.set(wobble * headScale, (1 + (wobble - 1) * 1.6) * headScale, wobble * headScale)
    applyGrimace(GRIMACE_PUFF, Math.min(deathTime * 4, 1))

    group.position.y = y
  }

  function updateIntro(): void {
    // Разворот к камере: лицо ребёнка должно быть видно целиком.
    pivot.rotation.y = Math.PI
    pivot.rotation.x = 0
    pivot.rotation.z = 0
    pivot.scale.set(1, 1, 1)

    // Жест «6-7»: ладони вверх, качаются вразнобой.
    const wave = introTime * 7
    leftArm.rotation.x = -1.35
    rightArm.rotation.x = -1.35
    leftArm.rotation.z = 0.5
    rightArm.rotation.z = -0.5
    leftArm.position.set(-0.52, 1.06 + Math.sin(wave) * 0.16, 0.26)
    rightArm.position.set(0.52, 1.06 - Math.sin(wave) * 0.16, 0.26)

    // Ноги стоят, лёгкое пружинистое покачивание всем телом.
    leftLeg.rotation.x = 0
    rightLeg.rotation.x = 0
    leftShoe.position.set(-0.17, 0.16, 0.1)
    rightShoe.position.set(0.17, 0.16, 0.1)
    headGroup.position.y = 1.52 + Math.sin(wave * 0.5) * 0.05
    headGroup.rotation.z = Math.sin(wave * 0.5) * 0.12

    group.position.y = Math.abs(Math.sin(wave * 0.5)) * 0.06
    shadow.position.y = -group.position.y + 0.03
  }

  function update(dt: number, speed: number): void {
    if (dead) {
      updateDeath(dt)
      return
    }

    if (intro) {
      updateIntro()
      return
    }

    // ---- Буферы ввода ----
    if (bufferedJump > 0) bufferedJump -= dt
    if (bufferedSlide > 0) bufferedSlide -= dt

    // ---- Вертикаль ----
    if (!onGround) {
      vy -= (vy > 0 ? GRAVITY_UP : GRAVITY_DOWN) * gravityScale() * dt
      y += vy * dt

      if (y <= 0) {
        y = 0
        vy = 0
        onGround = true
        squash = SQUASH_LAND
        handlers.onLand()
      }
    } else if (coyote > 0) {
      coyote -= dt
    }

    if (bufferedJump > 0 && (onGround || coyote > 0)) {
      bufferedJump = 0
      startJump()
    }

    if (bufferedSlide > 0 && onGround && !sliding) {
      bufferedSlide = 0
      startSlide()
    }

    if (sliding) {
      slideTimer -= dt
      if (slideTimer <= 0) sliding = false
    }

    // ---- Перестроение ----
    if (laneT < 1) {
      laneT = Math.min(laneT + dt / laneDuration, 1)
      const t = 1 - Math.pow(1 - laneT, 3)
      group.position.x = laneStartX + (LANE_X[laneTo] - laneStartX) * t
      if (laneT >= 1) lane = laneTo
    }

    const tiltTarget =
      laneT < 1 ? -laneDir * LANE_TILT * Math.sin(Math.PI * laneT) : blockedTilt
    pivot.rotation.z += (tiltTarget - pivot.rotation.z) * Math.min(1, dt * 16)
    blockedTilt *= Math.exp(-9 * dt)

    // ---- Гримасы ----
    if (grimaceLeft > 0) {
      grimaceLeft -= dt
      // Плавно наружу и обратно — рожа должна «надуться» и сдуться.
      const t = 1 - grimaceLeft / GRIMACE_DURATION
      applyGrimace(grimaceKind, Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)))
      if (grimaceLeft <= 0) applyGrimace(grimaceKind, 0)
    } else {
      grimaceTimer -= dt
      if (grimaceTimer <= 0) {
        grimaceKind = Math.floor(Math.random() * GRIMACE_KINDS)
        grimaceLeft = GRIMACE_DURATION
        grimaceTimer = GRIMACE_GAP_MIN + Math.random() * (GRIMACE_GAP_MAX - GRIMACE_GAP_MIN)
        handlers.onGrimace(grimaceKind)
      }
    }

    // ---- Модификаторы ----
    const headTarget = modifier === MOD_GIANT_HEAD ? GIANT_HEAD_SCALE : 1
    const bodyTarget = modifier === MOD_TINY_BODY ? TINY_BODY_SCALE : 1
    const jellyTarget = modifier === MOD_JELLY ? 1 : 0
    const morph = Math.min(1, dt * MODIFIER_MORPH_SPEED)

    headScale += (headTarget - headScale) * morph
    bodyScale += (bodyTarget - bodyScale) * morph
    jelly += (jellyTarget - jelly) * morph
    jellyPhase += dt * JELLY_FREQUENCY

    // ---- Анимация бега ----
    runPhase += dt * (RUN_CYCLE_BASE + speed * RUN_CYCLE_SPEED_GAIN)

    const grounded = onGround && !sliding
    const swing = grounded ? 0.95 : 0.35

    leftLeg.rotation.x = Math.sin(runPhase) * swing
    rightLeg.rotation.x = -Math.sin(runPhase) * swing
    leftArm.rotation.x = -Math.sin(runPhase) * swing * 0.8
    rightArm.rotation.x = Math.sin(runPhase) * swing * 0.8

    leftShoe.position.set(-0.17, 0.16 + Math.sin(runPhase) * 0.1, Math.sin(runPhase) * 0.4)
    rightShoe.position.set(0.17, 0.16 - Math.sin(runPhase) * 0.1, -Math.sin(runPhase) * 0.4)

    headGroup.position.y = 1.52 + (grounded ? Math.abs(Math.sin(runPhase)) * HEAD_BOB : 0)

    // «Желе»: части тела колышутся вразнобой. Фазы разные, иначе персонаж
    // просто пульсирует целиком и это читается как дыхание, а не как желе.
    const wobbleBody = 1 + Math.sin(jellyPhase) * JELLY_AMPLITUDE * jelly
    const wobbleHead = 1 + Math.sin(jellyPhase + 1.9) * JELLY_AMPLITUDE * jelly
    const wobbleLimbs = 1 + Math.sin(jellyPhase + 3.4) * JELLY_AMPLITUDE * jelly

    torso.scale.set(2 - wobbleBody, wobbleBody, 2 - wobbleBody)
    headGroup.scale.set(headScale * wobbleHead, headScale * (2 - wobbleHead), headScale * wobbleHead)
    leftArm.scale.setScalar(wobbleLimbs)
    rightArm.scale.setScalar(wobbleLimbs)
    leftLeg.scale.setScalar(2 - wobbleLimbs)
    rightLeg.scale.setScalar(2 - wobbleLimbs)

    // ---- Squash & stretch ----
    squash += (1 - squash) * Math.min(1, dt * SQUASH_RECOVER)

    const airStretch = onGround ? 1 : Math.min(Math.max(1 + vy * 0.016, 0.86), 1.22)
    const slideSquash = sliding ? PLAYER_SLIDE_HEIGHT / PLAYER_HEIGHT : 1
    const scaleY = squash * airStretch * slideSquash
    const scaleXZ = 1 / Math.sqrt(scaleY)

    // ---- Колобок ----
    const rolling = modifier === MOD_KOLOBOK
    kolobok.visible = rolling
    torso.visible = !rolling
    leftArm.visible = !rolling
    rightArm.visible = !rolling
    leftLeg.visible = !rolling
    rightLeg.visible = !rolling
    leftShoe.visible = !rolling
    rightShoe.visible = !rolling
    head.visible = !rolling

    if (rolling) {
      roll -= dt * KOLOBOK_SPIN
      kolobok.rotation.x = roll
      // Лицо переезжает на шар и катится вместе с ним.
      headGroup.position.y = KOLOBOK_RADIUS
      face.position.set(0, 0, KOLOBOK_RADIUS * 0.92)
      face.scale.setScalar(1.9)
      face.rotation.x = 0
    } else {
      face.position.set(0, 0.01, 0.3)
      face.scale.setScalar(1)
    }

    pivot.scale.set(scaleXZ * bodyScale, scaleY * bodyScale, scaleXZ * bodyScale)
    pivot.rotation.x = sliding && !rolling ? -0.5 : 0
    pivot.rotation.y = 0

    group.position.y = y

    // Тень остаётся на земле: чем выше прыжок, тем она меньше и бледнее.
    const height = Math.min(y / 2.2, 1)
    const shadowScale = (1 - height * 0.45) * bodyScale
    shadow.position.y = -y + 0.03
    shadow.scale.set(shadowScale, shadowScale, 1)
    shadowMaterial.opacity = 0.34 * (1 - height * 0.6)
  }

  function reset(): void {
    lane = 1
    laneTo = 1
    laneT = 1
    laneStartX = LANE_X[1]
    laneDuration = LANE_CHANGE_TIME
    laneDir = 1
    blockedTilt = 0
    y = 0
    vy = 0
    onGround = true
    sliding = false
    slideTimer = 0
    dead = false
    deathTime = 0
    tumble = 0
    spin = 0
    runPhase = 0
    squash = 1
    coyote = 0
    bufferedJump = 0
    bufferedSlide = 0
    grimaceTimer = GRIMACE_GAP_MIN
    grimaceLeft = 0
    modifier = MOD_NONE
    intro = false
    introTime = 0
    roll = 0
    headScale = 1
    bodyScale = 1
    jelly = 0
    jellyPhase = 0

    group.position.set(LANE_X[1], 0, 0)
    pivot.rotation.set(0, 0, 0)
    pivot.scale.set(1, 1, 1)
    headGroup.scale.set(1, 1, 1)
    headGroup.rotation.set(0, 0, 0)
    torso.scale.set(1, 1, 1)
    kolobok.visible = false
    face.position.set(0, 0.01, 0.3)
    face.scale.setScalar(1)
    applyGrimace(GRIMACE_PUFF, 0)
  }

  reset()

  return {
    group,
    get x() {
      return group.position.x
    },
    get halfWidth() {
      return LANE_WIDTH * HITBOX_WIDTH * 0.5 * bodyScale
    },
    get minY() {
      return y
    },
    get maxY() {
      return y + currentHeight() * HITBOX_SCALE
    },
    get lane() {
      return lane
    },
    get isDead() {
      return dead
    },
    setFace,
    leaveGround,
    requestJump,
    requestSlide,
    requestLane,
    celebrate,
    setModifier,
    setIntro,
    update,
    die,
    reset,
  }
}
