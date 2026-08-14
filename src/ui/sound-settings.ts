import { Preferences } from '@capacitor/preferences'
import { setMuted } from './feedback'

// Выбор «со звуком / без звука» переживает перезапуск: включать звук заново
// каждый раз, когда ребёнок открыл игру в тихом месте, — это раздражает
// в первую очередь родителя.

const MUTE_KEY = 'face-runner.muted.v1'

export async function loadMuted(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: MUTE_KEY })
    const muted = value === '1'
    setMuted(muted)
    return muted
  } catch {
    return false
  }
}

export async function saveMuted(muted: boolean): Promise<void> {
  setMuted(muted)
  try {
    await Preferences.set({ key: MUTE_KEY, value: muted ? '1' : '0' })
  } catch {
    // Не сохранилось — в этой сессии всё равно работает.
  }
}
