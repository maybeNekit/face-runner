import { Preferences } from '@capacitor/preferences'

// Хранилище лица.
//
// ПРИВАТНОСТЬ (правило проекта №3): Preferences — это локальное хранилище
// (SharedPreferences на Android, localStorage в браузере). Наружу ничего
// не уходит, синхронизации с облаком нет.

const FACE_KEY = 'face-runner.face-texture.v1'

export async function saveFace(dataUrl: string): Promise<void> {
  await Preferences.set({ key: FACE_KEY, value: dataUrl })
}

export async function loadFace(): Promise<string | null> {
  const { value } = await Preferences.get({ key: FACE_KEY })
  return value
}

/** Удаление лица с устройства — доступно ребёнку кнопкой «Новое лицо». */
export async function clearFace(): Promise<void> {
  await Preferences.remove({ key: FACE_KEY })
}
