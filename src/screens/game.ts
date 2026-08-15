import { App } from '@capacitor/app'
import { createGame } from '../game/game'
import type { Game, GameCallbacks } from '../game/game'
import { createInput } from '../game/input'
import { loadBestDistance, saveBestDistance } from '../game/score-store'
import { MOD_COLOR, MOD_ICON, MOD_LABEL, MOD_NONE } from '../game/modifiers'
import { iconAgain, iconFace, iconGo } from '../ui/icons'
import { successFeedback, tapFeedback } from '../ui/feedback'

/** Реплики комментатора. Только похвала, никакого подгона и упрёков. */
const CHEERS = [
  'ОГО!',
  'ТЫ РАКЕТА!',
  'НЕ ОСТАНОВИТЬ!',
  'ВОТ ЭТО ДА!',
  'КРУТО!',
  'ВАУ!',
  'СУПЕР!',
  'ЛЕТИШЬ!',
]

// Экран игры: канвас + HUD поверх него + экран результата.
//
// Игра создаётся один раз на всю сессию и живёт здесь синглтоном.
// Пересоздавать её на каждом «ЕЩЁ РАЗ» нельзя: браузер ограничивает число
// живых WebGL-контекстов, и через десяток забегов был бы «context lost».

let game: Game | null = null
let best = 0
let bestLoaded = false

export interface GameScreenOptions {
  faceDataUrl: string | null
  onExit: () => void
  /**
   * Экран отдаёт наружу свой обработчик системной «назад».
   *
   * Роутер не может решить это сам: «назад» во время забега должна ставить
   * паузу, а на экране паузы — уводить в меню.
   */
  bindBack(handler: () => void): void
}

export function renderGameScreen(root: HTMLElement, options: GameScreenOptions): () => void {
  root.innerHTML = `
    <div class="screen screen--game">
      <div class="hud">
        <div class="hud__distance"><span data-role="distance">0</span><span class="hud__unit">м</span></div>
        <div class="hud__stats">
          <span class="hud__coins">★ <span data-role="coins">0</span></span>
          <span class="hud__combo" data-role="combo"></span>
        </div>
        <div class="hud__best" data-role="best"></div>
      </div>

      <div class="record-flash" data-role="flash">РЕКОРД!</div>
      <div class="announcer" data-role="announcer"></div>
      <div class="biome-tag" data-role="biome"></div>

      <div class="modifier" data-role="modifier" hidden>
        <span class="modifier__icon" data-role="mod-icon"></span>
        <span class="modifier__label" data-role="mod-label"></span>
        <span class="modifier__bar" data-role="mod-bar"></span>
      </div>

      <!-- Пауза: «назад» на Android не должен выкидывать ребёнка
           из забега, тем более на рекорде. -->
      <div class="game-over game-over--pause" data-role="pause" hidden>
        <p class="game-over__label">Пауза</p>
        <div class="game-over__buttons">
          <button class="button button--huge button--primary" type="button" data-action="resume">
            ${iconGo}
            <span>ИГРАТЬ ДАЛЬШЕ</span>
          </button>
          <button class="button button--secondary" type="button" data-action="home">
            ${iconFace}
            <span>В меню</span>
          </button>
        </div>
      </div>

      <div class="game-over" data-role="gameover" hidden>
        <p class="game-over__label">Ты пробежал</p>
        <p class="game-over__distance"><span data-role="final">0</span> м</p>
        <p class="game-over__coins">★ <span data-role="final-coins">0</span></p>
        <p class="game-over__badge" data-role="badge" hidden>Это новый рекорд! 🎉</p>
        <div class="game-over__buttons">
          <button class="button button--huge button--primary" type="button" data-action="again">
            ${iconAgain}
            <span>ЕЩЁ РАЗ</span>
          </button>
          <button class="button button--secondary" type="button" data-action="home">
            ${iconFace}
            <span>В меню</span>
          </button>
        </div>
      </div>
    </div>
  `

  const screen = root.querySelector<HTMLDivElement>('.screen--game')!
  const hudEl = root.querySelector<HTMLDivElement>('.hud')!
  const finalCoinsEl = root.querySelector<HTMLSpanElement>('[data-role="final-coins"]')!
  const distanceEl = root.querySelector<HTMLSpanElement>('[data-role="distance"]')!
  const coinsEl = root.querySelector<HTMLSpanElement>('[data-role="coins"]')!
  const comboEl = root.querySelector<HTMLSpanElement>('[data-role="combo"]')!
  const bestEl = root.querySelector<HTMLDivElement>('[data-role="best"]')!
  const flashEl = root.querySelector<HTMLDivElement>('[data-role="flash"]')!
  const announcerEl = root.querySelector<HTMLDivElement>('[data-role="announcer"]')!
  const biomeEl = root.querySelector<HTMLDivElement>('[data-role="biome"]')!
  const modifierEl = root.querySelector<HTMLDivElement>('[data-role="modifier"]')!
  const modIconEl = root.querySelector<HTMLSpanElement>('[data-role="mod-icon"]')!
  const modLabelEl = root.querySelector<HTMLSpanElement>('[data-role="mod-label"]')!
  const modBarEl = root.querySelector<HTMLSpanElement>('[data-role="mod-bar"]')!
  const overEl = root.querySelector<HTMLDivElement>('[data-role="gameover"]')!
  const pauseEl = root.querySelector<HTMLDivElement>('[data-role="pause"]')!
  const finalEl = root.querySelector<HTMLSpanElement>('[data-role="final"]')!
  const badgeEl = root.querySelector<HTMLParagraphElement>('[data-role="badge"]')!

  let devEl: HTMLDivElement | null = null
  if (import.meta.env.DEV) {
    devEl = document.createElement('div')
    devEl.className = 'hud__dev'
    screen.appendChild(devEl)
  }

  let cheerIndex = 0
  let lastCheer = -1

  /** Восторги не должны повторяться подряд — иначе похвала обесценивается. */
  function pickCheer(): string {
    let index = Math.floor(Math.random() * CHEERS.length)
    if (index === lastCheer) index = (index + 1) % CHEERS.length
    lastCheer = index
    return CHEERS[index]
  }

  function announce(text: string): void {
    announcerEl.textContent = text
    announcerEl.classList.remove('announcer--on')
    // Форсируем reflow, иначе анимация не перезапустится на втором подряд
    // срабатывании.
    void announcerEl.offsetWidth
    announcerEl.classList.add('announcer--on')
  }

  // Кэш последних значений: трогать DOM каждый кадр незачем, а лишний
  // reflow на телефоне стоит кадров.
  let shownDistance = -1
  let shownCoins = -1
  let shownCombo = -1
  let devTick = 0

  // Колбэки собираются заново при каждом монтировании и переустанавливаются
  // в игре: они держат ссылки на элементы ИМЕННО этого экрана, а экран
  // пересоздаётся на каждом заходе.
  const callbacks: GameCallbacks = {
    onTick(distance, coins, combo) {
      if (distance !== shownDistance) {
        shownDistance = distance
        distanceEl.textContent = String(distance)
      }
      if (coins !== shownCoins) {
        shownCoins = coins
        coinsEl.textContent = String(coins)
      }
      if (combo !== shownCombo) {
        shownCombo = combo
        comboEl.textContent = combo > 1 ? `×${combo}` : ''
      }

      if (devEl) {
        devTick += 1
        if (devTick % 15 === 0) {
          devEl.textContent = `${Math.round(current.debugFps)} fps · ${current.debugCalls} draw calls`
        }
      }
    },

    onRecord() {
      flashEl.classList.add('record-flash--on')
      window.setTimeout(() => flashEl.classList.remove('record-flash--on'), 1600)
    },

    onMilestone(meters) {
      // Через раз называем дистанцию, через раз просто хвалим: ребёнок
      // и цифру видит, и не устаёт от одинаковой реплики.
      cheerIndex += 1
      announce(cheerIndex % 2 === 0 ? `${meters} МЕТРОВ!` : pickCheer())
    },

    onModifier(modifier) {
      if (modifier === MOD_NONE) {
        modifierEl.hidden = true
        return
      }
      modIconEl.textContent = MOD_ICON[modifier]
      modLabelEl.textContent = MOD_LABEL[modifier]
      modifierEl.style.setProperty('--mod-color', MOD_COLOR[modifier])
      modifierEl.hidden = false
      // Перезапуск анимации полоски: без сброса она не стартует заново.
      modBarEl.style.animation = 'none'
      void modBarEl.offsetWidth
      modBarEl.style.animation = ''
      announce(MOD_LABEL[modifier])
    },

    onBiome(name) {
      biomeEl.textContent = name
      biomeEl.classList.remove('biome-tag--on')
      void biomeEl.offsetWidth
      biomeEl.classList.add('biome-tag--on')
    },

    onEasterEgg() {
      announce('УТЁНОК! КРЯ! 🦆')
    },

    onIntroNotice() {
      announce('ЧЕРЕМША УВИДЕЛА!')
    },

    onIntroDone() {
      announce('БЕЖИМ!')
    },

    onPenaltyStart() {
      announce('ПЕНАЛЬТИ! БЕЙ!')
    },

    onPenalty(scored) {
      announce(scored ? 'ГОООЛ! ⚽' : 'ВРАТАРЬ ВЗЯЛ 😬')
    },

    onDeath(distance, coins, isRecord) {
      finalEl.textContent = String(distance)
      finalCoinsEl.textContent = String(coins)
      badgeEl.hidden = !isRecord
      overEl.hidden = false
      // Живой HUD прячем: он светится сквозь затемнение и дублирует
      // тот же результат вторым, более мелким числом.
      hudEl.hidden = true

      if (isRecord) {
        best = distance
        bestEl.textContent = `Рекорд: ${best} м`
        void saveBestDistance(distance)
        successFeedback()
      }
    },
  }

  if (!game) {
    game = createGame(callbacks)
  } else {
    game.setCallbacks(callbacks)
  }

  const current = game
  if (import.meta.env.DEV) {
    Object.assign(window, { __game: current })
  }
  screen.insertBefore(current.canvas, screen.firstChild)
  current.canvas.className = 'game-canvas'

  const disposeInput = createInput(current.canvas, (action) => {
    current.handleAction(action)
  })

  function onResize(): void {
    current.resize()
  }
  window.addEventListener('resize', onResize)

  // «Назад» во время забега ставит паузу, на паузе — уводит в меню.
  options.bindBack(() => {
    if (!overEl.hidden) {
      options.onExit()
    } else if (current.isPaused) {
      options.onExit()
    } else {
      setPaused(true)
    }
  })

  // Свернули приложение или пришёл звонок — тоже пауза, иначе ребёнок
  // вернётся к уже проигранному забегу.
  const backgroundListener = App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) setPaused(true)
  })

  function beginRun(): void {
    overEl.hidden = true
    pauseEl.hidden = true
    badgeEl.hidden = true
    hudEl.hidden = false
    shownDistance = -1
    shownCoins = -1
    shownCombo = -1
    current.setBest(best)
    current.startRun()
  }

  function onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!target) return

    tapFeedback()
    const action = target.dataset.action
    if (action === 'again') beginRun()
    if (action === 'resume') setPaused(false)
    if (action === 'home') options.onExit()
  }

  function setPaused(value: boolean): void {
    // Пауза имеет смысл только во время живого забега: на экране
    // результата ставить нечего.
    if (!current.isRunning || !overEl.hidden) return
    current.setPaused(value)
    pauseEl.hidden = !value
    hudEl.hidden = value
  }
  root.addEventListener('click', onClick)

  current.setFace(options.faceDataUrl)
  current.resize()

  // Рекорд читается один раз за сессию, дальше живёт в модуле.
  if (bestLoaded) {
    bestEl.textContent = best > 0 ? `Рекорд: ${best} м` : ''
    beginRun()
  } else {
    void loadBestDistance().then((value) => {
      best = value
      bestLoaded = true
      bestEl.textContent = best > 0 ? `Рекорд: ${best} м` : ''
      beginRun()
    })
  }

  return () => {
    current.stopLoop()
    current.setPaused(false)
    disposeInput()
    void backgroundListener.then((listener) => listener.remove())
    window.removeEventListener('resize', onResize)
    root.removeEventListener('click', onClick)
    // Канвас переживает размонтирование: контекст переиспользуется.
    current.canvas.remove()
  }
}
