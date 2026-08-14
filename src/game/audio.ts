import { getAudioContext, getMasterGain } from '../ui/feedback'
import { COMBO_PITCH_STEPS } from './config'

// Игровые звуки. Всё синтезируется осцилляторами — звуковых файлов
// в проекте нет (правило №1).
//
// Про «в игровом цикле ничего не создаётся»: WebAudio физически требует
// нового узла на каждое проигрывание, переиспользовать их нельзя. Но узлы
// рождаются на события (прыжок, монетка), а не каждый кадр, так что
// на GC это не давит. В самом render-цикле аллокаций по-прежнему нет.

/** Шум для «бонка» — буфер готовится один раз, а не на каждый удар. */
let noiseBuffer: AudioBuffer | undefined

function getNoise(audio: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const length = Math.floor(audio.sampleRate * 0.3)
    noiseBuffer = audio.createBuffer(1, length, audio.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1
    }
  }
  return noiseBuffer
}

interface ToneOptions {
  from: number
  to?: number
  duration: number
  delay?: number
  type?: OscillatorType
  volume?: number
}

function tone(options: ToneOptions): void {
  const audio = getAudioContext()
  if (!audio) return

  const start = audio.currentTime + (options.delay ?? 0)
  const osc = audio.createOscillator()
  const gain = audio.createGain()

  osc.type = options.type ?? 'triangle'
  osc.frequency.setValueAtTime(options.from, start)
  if (options.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(options.to, start + options.duration)
  }

  const volume = options.volume ?? 0.13
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)

  osc.connect(gain)
  gain.connect(getMasterGain() ?? audio.destination)
  osc.start(start)
  osc.stop(start + options.duration + 0.02)
}

/** Прыжок — «бойнг»: тон резко вверх и мягко вниз. */
export function soundJump(): void {
  tone({ from: 260, to: 720, duration: 0.09, type: 'triangle', volume: 0.15 })
  tone({ from: 700, to: 380, duration: 0.13, delay: 0.08, type: 'sine', volume: 0.11 })
}

/** Приземление — короткий глухой «туп». */
export function soundLand(): void {
  tone({ from: 180, to: 90, duration: 0.1, type: 'sine', volume: 0.12 })
}

/** Подкат — шуршание вниз. */
export function soundSlide(): void {
  tone({ from: 420, to: 150, duration: 0.18, type: 'sawtooth', volume: 0.07 })
}

/** Смена дорожки — короткий «вжух». */
export function soundLane(): void {
  tone({ from: 520, to: 820, duration: 0.07, type: 'sine', volume: 0.07 })
}

/**
 * Монетка — «динь». Тон растёт с комбо, поэтому длинная серия звучит
 * как поднимающаяся мелодия и сама себя награждает.
 */
export function soundCoin(combo: number): void {
  // Лесенка упирается в потолок: без него комбо 8 давало 1976 Гц, а
  // гармоника ×1.5 — почти 3 кГц, что на динамике телефона визжит.
  // Счёт продолжает расти, а звук остаётся добрым.
  const step = Math.min(combo, COMBO_PITCH_STEPS) - 1
  // Полутоновая лесенка: каждый шаг комбо на два полутона выше.
  const base = 880 * Math.pow(2, (step * 2) / 12)
  tone({ from: base, duration: 0.09, type: 'triangle', volume: 0.12 })
  tone({ from: base * 1.5, duration: 0.13, delay: 0.03, type: 'sine', volume: 0.07 })
}

/** Столкновение — «бонк». Глухо и комично, без резкого удара по ушам. */
export function soundCrash(): void {
  const audio = getAudioContext()
  if (!audio) return

  tone({ from: 200, to: 70, duration: 0.28, type: 'square', volume: 0.14 })

  const source = audio.createBufferSource()
  const gain = audio.createGain()
  const filter = audio.createBiquadFilter()

  source.buffer = getNoise(audio)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(900, audio.currentTime)

  gain.gain.setValueAtTime(0.16, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.22)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(getMasterGain() ?? audio.destination)
  source.start(audio.currentTime)
  source.stop(audio.currentTime + 0.25)
}

/** Новый рекорд — восходящая фанфара, читается как похвала. */
export function soundRecord(): void {
  tone({ from: 523, duration: 0.14, volume: 0.13 })
  tone({ from: 659, duration: 0.14, delay: 0.11, volume: 0.13 })
  tone({ from: 784, duration: 0.16, delay: 0.22, volume: 0.13 })
  tone({ from: 1047, duration: 0.3, delay: 0.33, volume: 0.14 })
}

/** Отказ ввода — «нет-нет». Тихо и невесело, но не обидно. */
export function soundBlocked(): void {
  tone({ from: 180, to: 150, duration: 0.05, type: 'square', volume: 0.06 })
}

// ---------- Непрерывный шум бега ----------
//
// Раннер без постоянного звука ощущается мёртвым между событиями.
// Источник создаётся ОДИН раз за сессию и просто живёт: в кадре не
// появляется ни одной новой ноды.

let runNoise: AudioBufferSourceNode | undefined
let runFilter: BiquadFilterNode | undefined
let runGain: GainNode | undefined

export function startRunNoise(): void {
  const audio = getAudioContext()
  if (!audio || runNoise) return

  runNoise = audio.createBufferSource()
  runFilter = audio.createBiquadFilter()
  runGain = audio.createGain()

  runNoise.buffer = getNoise(audio)
  runNoise.loop = true
  runFilter.type = 'lowpass'
  runFilter.frequency.setValueAtTime(300, audio.currentTime)
  runGain.gain.setValueAtTime(0, audio.currentTime)

  runNoise.connect(runFilter)
  runFilter.connect(runGain)
  runGain.connect(getMasterGain() ?? audio.destination)
  runNoise.start()
}

/** Частота среза и громкость ползут со скоростью — ещё один канал разгона. */
export function setRunNoise(progress: number, active: boolean): void {
  const audio = getAudioContext()
  if (!audio || !runFilter || !runGain) return

  const target = active ? 0.03 + progress * 0.07 : 0
  // setTargetAtTime сглаживает сам, поэтому вызывать можно хоть каждый кадр.
  runGain.gain.setTargetAtTime(target, audio.currentTime, 0.08)
  runFilter.frequency.setTargetAtTime(300 + progress * 1100, audio.currentTime, 0.12)
}

// ---------- Смешные звуки ----------

/** Нелепый звук под гримасу. Три вида, чтобы не приедалось. */
export function soundGrimace(kind: number): void {
  if (kind === 0) {
    // «Бульк» — надул щёки
    tone({ from: 520, to: 130, duration: 0.16, type: 'sine', volume: 0.1 })
  } else if (kind === 1) {
    // «Уиии» — растянулся
    tone({ from: 300, to: 900, duration: 0.18, type: 'triangle', volume: 0.08 })
  } else {
    // «Пщ-пщ» — скорчился
    tone({ from: 700, to: 620, duration: 0.05, type: 'square', volume: 0.06 })
    tone({ from: 560, to: 480, duration: 0.05, delay: 0.07, type: 'square', volume: 0.06 })
  }
}

/** Подобрал бонус — восходящий переливчатый аккорд. */
export function soundPowerup(): void {
  tone({ from: 660, duration: 0.1, volume: 0.12 })
  tone({ from: 880, duration: 0.1, delay: 0.07, volume: 0.12 })
  tone({ from: 1170, duration: 0.18, delay: 0.14, volume: 0.12 })
}

/** Бонус закончился — мягкое «сдулся», без огорчения. */
export function soundPowerupEnd(): void {
  tone({ from: 700, to: 380, duration: 0.2, type: 'sine', volume: 0.07 })
}

/** Каждые сто метров — короткая радостная фанфара. */
export function soundMilestone(): void {
  tone({ from: 784, duration: 0.1, volume: 0.12 })
  tone({ from: 988, duration: 0.1, delay: 0.08, volume: 0.12 })
  tone({ from: 1319, duration: 0.22, delay: 0.16, volume: 0.13 })
}

/** «КРЯ» гигантского утёнка. */
export function soundQuack(): void {
  tone({ from: 420, to: 260, duration: 0.16, type: 'sawtooth', volume: 0.14 })
  tone({ from: 380, to: 220, duration: 0.2, delay: 0.18, type: 'sawtooth', volume: 0.13 })
}
