// Отклик на действия игрока: звук + вибрация.
// Звук синтезируется WebAudio, звуковых файлов в проекте нет (правило №1).
// Каждое нажатие обязано отвечать — тишина читается ребёнком как «сломалось».

let ctx: AudioContext | undefined
let audioBroken = false
let master: GainNode | undefined
let muted = false

/**
 * Общий на всё приложение AudioContext.
 *
 * Игровые звуки берут именно его: браузеры ограничивают число живых
 * AudioContext на страницу, и второй может просто не открыться.
 */
export function getAudioContext(): AudioContext | undefined {
  return getContext()
}

/**
 * Общий регулятор громкости.
 *
 * ВСЁ звучащее в игре подключается сюда, а не напрямую к destination:
 * иначе выключить звук можно было бы только расставив проверки по каждому
 * вызову, и непрерывный шум бега всё равно остался бы играть.
 */
export function getMasterGain(): GainNode | undefined {
  const audio = getContext()
  if (!audio) return undefined

  if (!master) {
    master = audio.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(audio.destination)
  }
  return master
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  const gain = getMasterGain()
  if (!gain || !ctx) return
  // Не рубим мгновенно: резкий обрыв даёт щелчок в динамике.
  gain.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.02)
}

function getContext(): AudioContext | undefined {
  if (audioBroken) return undefined

  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      // Звук — не повод ронять экран. Молча продолжаем без него.
      audioBroken = true
      return undefined
    }
  }

  // Браузеры запускают контекст только после жеста пользователя.
  if (ctx.state === 'suspended') void ctx.resume()

  return ctx
}

function tone(
  freq: number,
  duration: number,
  delay = 0,
  type: OscillatorType = 'triangle',
  volume = 0.14,
): void {
  const audio = getContext()
  if (!audio) return

  const start = audio.currentTime + delay
  const osc = audio.createOscillator()
  const gain = audio.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, start)

  // Мгновенная атака и экспоненциальный спад — щелчки на старте/стопе не слышны.
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(gain)
  gain.connect(getMasterGain() ?? audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

function vibrate(pattern: number | number[]): void {
  navigator.vibrate?.(pattern)
}

/** Обычное нажатие кнопки. */
export function tapFeedback(): void {
  tone(620, 0.09)
  vibrate(12)
}

/** Затвор фотоаппарата — короткий двойной щелчок. */
export function shutterFeedback(): void {
  tone(1400, 0.04, 0, 'square', 0.1)
  tone(900, 0.06, 0.05, 'square', 0.1)
  vibrate([12, 40, 18])
}

/** Успех: «поехали!» — восходящее трезвучие, звучит как похвала. */
export function successFeedback(): void {
  tone(523, 0.12, 0)
  tone(659, 0.12, 0.09)
  tone(784, 0.22, 0.18)
  vibrate([18, 30, 28])
}

/** Мягкая неудача: без резких и пугающих звуков (правило №4). */
export function gentleFailFeedback(): void {
  tone(392, 0.14, 0, 'sine')
  tone(294, 0.2, 0.1, 'sine')
  vibrate(25)
}
