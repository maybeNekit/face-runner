import { Preferences } from '@capacitor/preferences'

// Рекорд хранится локально, рядом с лицом. Наружу, как и всё в этой игре,
// ничего не уходит.

const BEST_KEY = 'face-runner.best-distance.v1'

export async function loadBestDistance(): Promise<number> {
  try {
    const { value } = await Preferences.get({ key: BEST_KEY })
    const parsed = value ? Number.parseInt(value, 10) : 0
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

export async function saveBestDistance(meters: number): Promise<void> {
  try {
    await Preferences.set({ key: BEST_KEY, value: String(Math.floor(meters)) })
  } catch {
    // Не сохранилось — забег всё равно состоялся, ронять игру не за что.
  }
}
