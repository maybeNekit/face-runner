import * as THREE from 'three'
import {
  ANNOUNCE_EVERY_METERS,
  BIOME_LENGTH,
  BIOME_TRANSITION,
  CAMERA_DISTANCE,
  CAMERA_FOLLOW,
  CAMERA_HEIGHT,
  CAMERA_LAG,
  CAMERA_LOOK_AHEAD,
  CAMERA_LOOK_FOLLOW,
  COIN_START_TIME,
  COIN_VALUE,
  COMBO_MAX,
  COMBO_WINDOW,
  DEATH_ANIM_DURATION,
  DEATH_WORLD_STOP,
  DESPAWN_Z,
  DUST_INTERVAL_METERS,
  EASY_DURATION,
  FOG_FAR,
  FOG_NEAR,
  FOV_BASE,
  FOV_CRASH_KICK,
  FOV_SPEED_GAIN,
  CHASER_SCALE,
  INTRO_CAMERA_DISTANCE,
  INTRO_CAMERA_HEIGHT,
  INTRO_DURATION,
  INTRO_NOTICE_AT,
  OBSTACLE_START_TIME,
  POWERUP_DURATION,
  REACTION_RAMP_TAU,
  REACTION_TIME_MIN,
  REACTION_TIME_START,
  ROAD_WIDTH,
  SHAKE_CRASH,
  SHAKE_JUMP,
  SHAKE_LAND,
  SPAWN_Z,
  SPEED_MAX,
  SPEED_RAMP_TAU,
  SPEED_START,
} from './config'
import { createEffects, speedProgress } from './effects'
import { createObstacles } from './obstacles'
import { createPickups } from './pickups'
import { createPowerups } from './powerups'
import { createPlayer } from './player'
import { createRoad } from './road'
import { createChaser } from './chaser'
import { createEasterEgg } from './easter-egg'
import { createPenalty } from './penalty'
import { createSky } from './sky'
import { BIOMES, biomeAt } from './biomes'
import { MOD_KOLOBOK, MOD_NONE, MOD_RONALDO } from './modifiers'
import type { GameAction } from './input'
import {
  setRunNoise,
  soundBlocked,
  soundCoin,
  soundCrash,
  soundGrimace,
  soundJump,
  soundLand,
  soundLane,
  soundMilestone,
  soundPowerup,
  soundPowerupEnd,
  soundQuack,
  soundRecord,
  soundSlide,
  startRunNoise,
} from './audio'
import {
  hapticBlocked,
  hapticCombo,
  hapticCrash,
  hapticJump,
  hapticLand,
  hapticLane,
  hapticRecord,
  hapticSlide,
} from './haptics'

const SKY = 0x8fd3ff
const STEP = 1 / 60
const MAX_STEPS = 3

export interface GameCallbacks {
  onTick(distance: number, coins: number, combo: number): void
  onDeath(distance: number, coins: number, isRecord: boolean): void
  onRecord(): void
  /** Круглая отметка дистанции — повод похвалить. */
  onMilestone(meters: number): void
  /** Бонус подобран (modifier >= 0) или закончился (MOD_NONE). */
  onModifier(modifier: number): void
  /** Сменился биом — можно показать его название. */
  onBiome(name: string): void
  /** Пасхалка на 500 метрах. */
  onEasterEgg(): void
  /** Черемша заметила жест — момент завязки погони. */
  onIntroNotice(): void
  /** Вступление кончилось, побежали. */
  onIntroDone(): void
  /** Начался пенальти. */
  onPenaltyStart(): void
  /** Пенальти закончился: забил или нет. */
  onPenalty(scored: boolean): void
}

export interface Game {
  readonly canvas: HTMLCanvasElement
  /** Переустановка колбэков при новом монтировании экрана. */
  setCallbacks(next: GameCallbacks): void
  setFace(dataUrl: string | null): void
  setBest(meters: number): void
  handleAction(action: GameAction): void
  startRun(): void
  /** Пауза не выкидывает из забега: физика стоит, кадр продолжает рисоваться. */
  setPaused(value: boolean): void
  readonly isPaused: boolean
  readonly isRunning: boolean
  stopLoop(): void
  resize(): void
  /**
   * Прогон симуляции на заданное число секунд без requestAnimationFrame.
   *
   * Нужен для детерминированной проверки физики, коллизий и счёта: rAF
   * не тикает в фоновой вкладке, да и проверять поведение по скриншотам
   * менее надёжно, чем по числам.
   */
  advance(seconds: number): void
  readonly debugCalls: number
  readonly debugFps: number
}

/** Скорость растёт по насыщающейся кривой: разгон чувствуется, но потолок есть. */
function speedAt(elapsed: number): number {
  if (elapsed <= EASY_DURATION) return SPEED_START
  const t = elapsed - EASY_DURATION
  return SPEED_START + (SPEED_MAX - SPEED_START) * (1 - Math.exp(-t / SPEED_RAMP_TAU))
}

/** Время на реакцию сокращается медленнее, чем растёт скорость. */
function reactionAt(elapsed: number): number {
  const t = Math.max(0, elapsed - EASY_DURATION)
  return (
    REACTION_TIME_MIN + (REACTION_TIME_START - REACTION_TIME_MIN) * Math.exp(-t / REACTION_RAMP_TAU)
  )
}

function createRecordBanner(): THREE.Group {
  const group = new THREE.Group()

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ff5d8f'
  ctx.fillRect(0, 0, 512, 128)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 74px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Надпись рисуется в канвас системным шрифтом — файлов шрифтов не нужно.
  ctx.fillText('ТВОЙ РЕКОРД', 256, 68)

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH / 4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide }),
  )
  banner.position.y = 3
  group.add(banner)

  const post = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_WIDTH + 0.6, 0.22, 0.22),
    new THREE.MeshLambertMaterial({ color: 0xffd93d }),
  )
  post.position.y = 0.04
  group.add(post)

  group.visible = false
  return group
}

export function createGame(initialCallbacks: GameCallbacks): Game {
  // Игра живёт синглтоном на всю сессию, а экран пересоздаётся при каждом
  // заходе. Если бы колбэки захватывались навсегда, со второго захода они
  // писали бы в уже оторванные от документа элементы: счётчик замирал бы,
  // а экран результата не появлялся вовсе.
  let callbacks = initialCallbacks

  // ---- Рендер ----
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  // Тени выключены намеренно: на среднем Android они съедают весь бюджет кадра.
  renderer.shadowMap.enabled = false
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new THREE.Scene()
  const fog = new THREE.Fog(SKY, FOG_NEAR, FOG_FAR)
  scene.fog = fog

  // Купол с градиентом вместо плоской заливки фона.
  const sky = createSky()
  scene.add(sky.mesh)

  const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, 260)

  // Только два источника и никаких теней — материалы Lambert, не PBR.
  // Небесный и земной цвета полусферы задаёт биом.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x5a7a4a, 1.15)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffffff, 1.1)
  sun.position.set(6, 12, 4)
  scene.add(sun)

  // Контровой свет сзади-сверху: отделяет героя и Черемшу от фона, из-за
  // чего силуэты читаются, а картинка перестаёт быть плоской. Один
  // источник без теней — на кадр не влияет.
  const rim = new THREE.DirectionalLight(0xfff2d0, 0.55)
  rim.position.set(-5, 7, -9)
  scene.add(rim)

  // ---- Мир ----
  const road = createRoad()
  const obstacles = createObstacles()
  const pickups = createPickups()
  const powerups = createPowerups()
  const effects = createEffects()
  const easterEgg = createEasterEgg()
  const chaser = createChaser()
  chaser.group.scale.setScalar(CHASER_SCALE)
  const penalty = createPenalty()
  const recordBanner = createRecordBanner()

  scene.add(road.group)
  scene.add(obstacles.group)
  scene.add(pickups.group)
  scene.add(powerups.group)
  scene.add(effects.group)
  scene.add(easterEgg.group)
  scene.add(chaser.group)
  scene.add(penalty.group)
  scene.add(recordBanner)

  // ---- Биомы ----
  // Цвета переливаются каждый кадр, поэтому держим по объекту Color на роль
  // и не создаём их в цикле.
  const skyColor = new THREE.Color()
  const groundColor = new THREE.Color()
  const roadColor = new THREE.Color()
  const curbColor = new THREE.Color()
  const skyTopColor = new THREE.Color()
  const targetSky = new THREE.Color()
  const targetSkyTop = new THREE.Color()
  const targetGround = new THREE.Color()
  const targetRoad = new THREE.Color()
  const targetCurb = new THREE.Color()
  const targetHemiSky = new THREE.Color()
  const targetHemiGround = new THREE.Color()

  const player = createPlayer({
    onJump() {
      soundJump()
      hapticJump()
      effects.addShake(SHAKE_JUMP)
      effects.emitDust(player.x, 0.1, 0, 6)
    },
    onLand() {
      soundLand()
      hapticLand()
      effects.addShake(SHAKE_LAND)
      effects.emitDust(player.x, 0.1, 0, 8)
    },
    onSlide() {
      soundSlide()
      hapticSlide()
      effects.emitDust(player.x, 0.1, 0, 7)
    },
    onLaneChange() {
      soundLane()
      hapticLane()
    },
    onLaneBlocked() {
      // Молчание тут читается ребёнком как «игра меня не услышала».
      soundBlocked()
      hapticBlocked()
    },
    onGrimace(kind) {
      soundGrimace(kind)
    },
  })
  scene.add(player.group)

  // ---- Состояние забега ----
  let running = false
  let elapsed = 0
  let distance = 0
  let coins = 0
  let combo = 0
  let comboTimer = 0
  let best = 0
  let recordPassed = false
  let dying = false
  let paused = false
  /** Вступление: герой кривляется, Черемша закипает. */
  let introLeft = 0
  let noticed = false
  /** Идёт мини-игра пенальти — мир стоит, управление уходит туда. */
  let inPenalty = false
  let deathTimer = 0
  let worldScale = 1

  let rafId = 0
  let lastTime = 0
  let accumulator = 0
  let dustMeters = 0
  let crashKick = 0

  let modifier = MOD_NONE
  let modifierLeft = 0
  let milestone = 0
  let biomeIndex = -1
  let biomeBlend = 1

  let fps = 60
  let fpsAccum = 0
  let fpsFrames = 0

  const lookTarget = new THREE.Vector3()

  function resize(): void {
    const parent = canvas.parentElement
    const width = parent ? parent.clientWidth : window.innerWidth
    const height = parent ? parent.clientHeight : window.innerHeight

    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(height, 1)
    camera.updateProjectionMatrix()
  }

  /** Применяет цвета биома. Плавно, за BIOME_TRANSITION секунд. */
  function applyBiome(index: number, instant: boolean): void {
    const biome = BIOMES[index]
    targetSky.setHex(biome.sky)
    targetSkyTop.setHex(biome.skyTop)
    targetGround.setHex(biome.ground)
    targetRoad.setHex(biome.road)
    targetCurb.setHex(biome.curb)
    targetHemiSky.setHex(biome.hemiSky)
    targetHemiGround.setHex(biome.hemiGround)

    road.setScenery(biome.buildTall(), biome.buildLow())

    if (instant) {
      skyColor.copy(targetSky)
      skyTopColor.copy(targetSkyTop)
      groundColor.copy(targetGround)
      roadColor.copy(targetRoad)
      curbColor.copy(targetCurb)
      hemi.color.copy(targetHemiSky)
      hemi.groundColor.copy(targetHemiGround)
      biomeBlend = 1
    } else {
      biomeBlend = 0
    }
  }

  function crash(variant: number): void {
    if (dying) return
    dying = true
    deathTimer = 0
    combo = 0

    // Бонус на смерти снимаем: гигантская голова в кувырке выглядит
    // смешно, но «зеркало» и реактивные боты уже ни на что не влияют.
    if (modifier !== MOD_NONE) {
      modifier = MOD_NONE
      modifierLeft = 0
      player.setModifier(MOD_NONE)
      callbacks.onModifier(MOD_NONE)
    }

    player.die(variant)
    soundCrash()
    hapticCrash()
    effects.addShake(SHAKE_CRASH)
    effects.emitCrash(player.x, 0.9, 0, 26)
    // FOV схлопывается, пока мир встаёт — читается как «дух вышибло».
    crashKick = FOV_CRASH_KICK
  }

  function step(dt: number): void {
    // ---- Вступление ----
    if (introLeft > 0) {
      introLeft -= dt
      const t = INTRO_DURATION - introLeft
      player.setIntro(true, t)

      // Черемша замечает жест и вскипает.
      if (!noticed && t >= INTRO_NOTICE_AT) {
        noticed = true
        soundBlocked()
        effects.addShake(0.3)
        callbacks.onIntroNotice()
      }

      chaser.updateIntro(dt, t, noticed)
      if (introLeft <= 0) {
        player.setIntro(false, 0)
        callbacks.onIntroDone()
      }
      callbacks.onTick(0, 0, 0)
      return
    }

    // ---- Пенальти ----
    if (inPenalty) {
      // Герой отбегает к точке удара. Не телепортируем: видно, как он
      // сходит с трассы, и ребёнок понимает, что происходит.
      const toX = penalty.playerX
      player.group.position.x += (toX - player.group.position.x) * Math.min(1, dt * 3.5)
      player.group.position.z += (penalty.playerZ - player.group.position.z) * Math.min(1, dt * 3.5)

      if (penalty.update(dt)) {
        inPenalty = false
        if (penalty.scored) {
          coins += 200
          soundRecord()
          callbacks.onPenalty(true)
        } else {
          // Промах заканчивает забег — так просил владелец игры.
          callbacks.onPenalty(false)
          crash(0)
        }
        modifier = MOD_NONE
        modifierLeft = 0
        player.setModifier(MOD_NONE)
        callbacks.onModifier(MOD_NONE)
        // Возвращаем героя на трассу.
        player.group.position.z = 0
      }
      player.update(dt, 6)
      callbacks.onTick(Math.floor(distance), coins, combo)
      return
    }

    elapsed += dt

    const speed = dying ? SPEED_START * worldScale : speedAt(elapsed)
    // Мир едет на игрока: delta — это на сколько всё сдвинулось к камере.
    const delta = speed * dt

    if (!dying) {
      distance += delta
    } else {
      // После столкновения мир быстро, но не мгновенно останавливается —
      // резкий стоп-кадр читается как зависание.
      worldScale = Math.max(worldScale - dt * DEATH_WORLD_STOP, 0)
    }

    const progress = speedProgress(speed)

    road.update(delta)
    // Временны́х ворот у спавна больше нет: свободный старт целиком задаётся
    // параметром safeDistance в prefill. Два механизма конфликтовали —
    // счётчик metersToSpawn стоял внутри ворот и «просыпался» неактуальным,
    // из-за чего в каждом забеге была дыра в потоке препятствий на 8.4 с.
    // Пока управление перевёрнуто, не перекрываем две дорожки сразу:
    // ошибиться стороной и упереться в стену — слишком дорого.
    obstacles.update(delta, speed, reactionAt(elapsed), elapsed, !dying, false)
    pickups.update(delta, dt, speed, !dying)
    powerups.update(delta, dt, !dying)
    player.update(dt, speed)
    chaser.update(dt, player.x, speed, dying)
    effects.update(dt, delta, progress)
    setRunNoise(progress, !dying)

    if (easterEgg.update(distance, dt) && !dying) {
      soundQuack()
      callbacks.onEasterEgg()
    }

    // ---- Биом ----
    const nextBiome = biomeAt(distance, BIOME_LENGTH)
    if (nextBiome !== biomeIndex) {
      biomeIndex = nextBiome
      applyBiome(biomeIndex, false)
      callbacks.onBiome(BIOMES[biomeIndex].name)
    }
    if (biomeBlend < 1) {
      biomeBlend = Math.min(biomeBlend + dt / BIOME_TRANSITION, 1)
      const t = biomeBlend
      skyColor.lerp(targetSky, t * 0.12)
      skyTopColor.lerp(targetSkyTop, t * 0.12)
      groundColor.lerp(targetGround, t * 0.12)
      roadColor.lerp(targetRoad, t * 0.12)
      curbColor.lerp(targetCurb, t * 0.12)
      hemi.color.lerp(targetHemiSky, t * 0.12)
      hemi.groundColor.lerp(targetHemiGround, t * 0.12)

      fog.color.copy(skyColor)
      sky.setColors(skyColor, skyTopColor)
      road.setColors(groundColor, roadColor, curbColor)
    }

    // ---- Таймер бонуса ----
    if (modifierLeft > 0) {
      modifierLeft -= dt
      if (modifierLeft <= 0) {
        modifier = MOD_NONE
        player.setModifier(MOD_NONE)
        soundPowerupEnd()
        callbacks.onModifier(MOD_NONE)
      }
    }

    if (!dying) {
      // ---- Монетки ----
      const collected = pickups.collect(player.x, player.minY, player.maxY)
      if (collected > 0) {
        combo = Math.min(combo + 1, COMBO_MAX)
        comboTimer = COMBO_WINDOW
        coins += collected * COIN_VALUE * combo
        soundCoin(combo)
        // Радостный подскок вместо новой сущности — ноль draw calls.
        player.celebrate()
        effects.emitSparkle(player.x, player.minY + 0.8, 0, 6 + combo * 2)
        // Вибрация только на заметных ступенях: на максимальной скорости
        // монетки идут по 8 штук в секунду, и отклик на каждой превратился
        // бы в непрерывный зуд.
        if (combo === 3 || combo === 5 || combo === 8) hapticCombo()
      } else if (comboTimer > 0) {
        comboTimer -= dt
        if (comboTimer <= 0) combo = 0
      }

      // ---- Бонус ----
      const gained = powerups.collect(player.x, player.minY, player.maxY)
      if (gained >= 0) {
        if (gained === MOD_RONALDO) {
          // Роналду не длится по таймеру: он сразу уводит на пенальти.
          inPenalty = true
          penalty.start()
          player.setModifier(MOD_NONE)
          soundPowerup()
          callbacks.onModifier(MOD_RONALDO)
          callbacks.onPenaltyStart()
          return
        }

        modifier = gained
        modifierLeft = POWERUP_DURATION
        player.setModifier(gained)
        soundPowerup()
        hapticCombo()
        effects.emitSparkle(player.x, player.minY + 1.1, 0, 18)
        callbacks.onModifier(gained)
      }

      // ---- Столкновение ----
      const hit = obstacles.hits(player.x, player.halfWidth, player.minY, player.maxY)
      if (hit >= 0) {
        if (modifier === MOD_KOLOBOK) {
          // Колобок катится сквозь всё: препятствие разлетается, а не бьёт.
          obstacles.smash(player.x, player.halfWidth)
          soundCrash()
          effects.addShake(0.22)
          effects.emitCrash(player.x, 0.7, 0, 14)
        } else {
          crash(hit)
        }
      }

      // ---- Каждые сто метров — похвала ----
      const reached = Math.floor(distance / ANNOUNCE_EVERY_METERS)
      if (reached > milestone) {
        milestone = reached
        soundMilestone()
        callbacks.onMilestone(reached * ANNOUNCE_EVERY_METERS)
      }

      // ---- Пыль из-под ног ----
      // Привязка к дистанции, а не к кадрам: при фиксированном интервале
      // в шагах плотность пыли падала ровно тогда, когда должна расти.
      dustMeters += delta
      if (dustMeters >= DUST_INTERVAL_METERS && player.minY <= 0.01) {
        dustMeters = 0
        effects.emitDust(player.x, 0.08, 0, 2)
      }

      // ---- Отметка рекорда ----
      if (best > 0) {
        const remaining = best - distance
        if (remaining <= -SPAWN_Z && remaining > DESPAWN_Z * -1 - 8) {
          recordBanner.visible = true
          recordBanner.position.z = -remaining
        } else {
          recordBanner.visible = false
        }
        if (remaining <= 0 && !recordPassed) {
          recordPassed = true
          soundRecord()
          hapticRecord()
          callbacks.onRecord()
        }
      }
    } else {
      deathTimer += dt
      if (deathTimer >= DEATH_ANIM_DURATION) {
        running = false
        const meters = Math.floor(distance)
        callbacks.onDeath(meters, coins, best > 0 ? meters > best : true)
      }
    }

    callbacks.onTick(Math.floor(distance), coins, combo)
  }

  function updateCamera(dt: number): void {
    // Во время смерти FOV должен идти от РЕАЛЬНОЙ скорости мира: иначе
    // камера продолжала расширяться, пока всё уже остановилось.
    const speed = dying ? SPEED_START * worldScale : speedAt(elapsed)
    const progress = speedProgress(speed)

    // Камера тянется за игроком с отставанием — жёсткая привязка убивает
    // ощущение манёвра при смене дорожки.
    // Во вступлении камера подъезжает вплотную: лицо должно быть крупно.
    // На пенальти — уезжает к воротам вместе с героем.
    const introT = introLeft > 0 ? Math.min(introLeft / INTRO_DURATION, 1) : 0
    const height = CAMERA_HEIGHT + (INTRO_CAMERA_HEIGHT - CAMERA_HEIGHT) * introT
    const distance2 = CAMERA_DISTANCE + (INTRO_CAMERA_DISTANCE - CAMERA_DISTANCE) * introT
    const focusX = inPenalty ? penalty.playerX : player.x

    const targetX = focusX * CAMERA_FOLLOW
    camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * CAMERA_LAG)
    camera.position.y = height
    camera.position.z = distance2

    lookTarget.set(focusX * CAMERA_LOOK_FOLLOW, 1.05, -CAMERA_LOOK_AHEAD)
    camera.lookAt(lookTarget)

    // Тряска — доворот ПОСЛЕ lookAt. Сдвигом её делать нельзя: lookAt каждый
    // кадр целится в ту же точку и почти полностью компенсирует смещение.
    // Плюс сдвиг писался в ту же переменную, что и состояние лерпа камеры,
    // и подмешивал шум в сглаживание.
    camera.rotation.z += effects.shakeRoll
    camera.rotation.x += effects.shakePitch

    if (crashKick < 0) crashKick = Math.min(crashKick + dt * 9, 0)

    const targetFov = FOV_BASE + FOV_SPEED_GAIN * progress + crashKick
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8)
      camera.updateProjectionMatrix()
    }
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame)

    const raw = (now - lastTime) / 1000
    lastTime = now
    const dt = Math.min(Number.isFinite(raw) ? raw : STEP, 0.1)

    fpsAccum += dt
    fpsFrames += 1
    if (fpsAccum >= 0.5) {
      fps = fpsFrames / fpsAccum
      fpsAccum = 0
      fpsFrames = 0
    }

    if (running && !paused) {
      accumulator += dt
      let steps = 0
      // Фиксированный шаг: на экране 120 Гц прыжок обязан ощущаться так же,
      // как на 60 Гц.
      while (accumulator >= STEP && steps < MAX_STEPS) {
        step(STEP)
        accumulator -= STEP
        steps += 1
      }
      // Не копим долг после лага — иначе игра «догоняет» рывком.
      if (steps === MAX_STEPS) accumulator = 0
    }

    updateCamera(dt)
    renderer.render(scene, camera)
  }

  function startRun(): void {
    elapsed = 0
    distance = 0
    coins = 0
    combo = 0
    comboTimer = 0
    recordPassed = false
    dying = false
    deathTimer = 0
    worldScale = 1
    accumulator = 0
    dustMeters = 0
    crashKick = 0

    modifier = MOD_NONE
    modifierLeft = 0
    milestone = 0

    road.reset()
    obstacles.reset()
    pickups.reset()
    powerups.reset()
    effects.reset()
    player.reset()
    chaser.reset()
    penalty.reset()
    easterEgg.reset()
    introLeft = INTRO_DURATION
    noticed = false
    inPenalty = false
    player.setIntro(true, 0)
    recordBanner.visible = false

    // Забег всегда начинается с первого биома, без переливания.
    biomeIndex = 0
    applyBiome(0, true)
    fog.color.copy(skyColor)
    sky.setColors(skyColor, skyTopColor)
    road.setColors(groundColor, roadColor, curbColor)
    callbacks.onModifier(MOD_NONE)
    // Название стартового биома тоже показываем: ребёнку интересно, куда он
    // попал, а смена миров — половина обещания игры.
    callbacks.onBiome(BIOMES[0].name)

    // Трасса заполняется заранее: иначе первые секунды забега объекты только
    // выезжают от горизонта, и ребёнок бежит по пустой дороге.
    // Свободный участок в начале — то, что игрок пробежит за первые секунды.
    obstacles.prefill(SPEED_START, REACTION_TIME_START, SPEED_START * OBSTACLE_START_TIME)
    pickups.prefill(SPEED_START, SPEED_START * COIN_START_TIME)
    powerups.prefill()

    camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE)
    camera.fov = FOV_BASE
    camera.updateProjectionMatrix()

    running = true
    paused = false
    lastTime = performance.now()

    // Одна нода на всю сессию; повторные вызовы игнорируются внутри.
    startRunNoise()

    if (!rafId) rafId = requestAnimationFrame(frame)
  }

  /**
   * Пауза: физика замирает, но rAF продолжает крутиться, чтобы сцена
   * оставалась отрисованной под наложенным поверх экраном паузы.
   */
  function setPaused(value: boolean): void {
    paused = value
    setRunNoise(0, !value)
    if (!value) {
      // Сбрасываем накопитель: за время паузы натикали бы секунды,
      // и игра рванула бы вперёд рывком.
      accumulator = 0
      lastTime = performance.now()
    }
  }

  function stopLoop(): void {
    running = false
    setRunNoise(0, false)
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  function advance(seconds: number): void {
    const steps = Math.round(seconds / STEP)
    // Пауза уважается и здесь, иначе детерминированный прогон вёл бы себя
    // не так, как настоящий цикл, и проверять им паузу было бы нельзя.
    for (let i = 0; i < steps && running && !paused; i += 1) {
      step(STEP)
    }
    updateCamera(STEP)
    renderer.render(scene, camera)
  }

  function handleAction(action: GameAction): void {
    if (!running || dying) return

    // Во время пенальти те же жесты означают направление удара.
    if (inPenalty) {
      if (action === 'left') penalty.shoot(-1)
      else if (action === 'right') penalty.shoot(1)
      else penalty.shoot(0)
      return
    }

    if (introLeft > 0) return

    if (action === 'left') player.requestLane(-1)
    else if (action === 'right') player.requestLane(1)
    else if (action === 'jump') player.requestJump()
    else if (action === 'slide') player.requestSlide()
  }

  return {
    canvas,
    setCallbacks(next: GameCallbacks) {
      callbacks = next
    },
    setFace: player.setFace,
    setBest(meters: number) {
      best = meters
    },
    handleAction,
    startRun,
    setPaused,
    get isPaused() {
      return paused
    },
    get isRunning() {
      return running
    },
    stopLoop,
    resize,
    advance,
    get debugCalls() {
      return renderer.info.render.calls
    },
    get debugFps() {
      return fps
    },
  }
}
