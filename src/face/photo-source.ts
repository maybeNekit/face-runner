import { Capacitor } from '@capacitor/core'
import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera'

// Получение фото ребёнка.
//
// ПРИВАТНОСТЬ (правило проекта №3): фото существует только как dataURL в памяти
// и в локальном хранилище. Здесь нет и не должно появиться ни fetch, ни
// XMLHttpRequest, ни FormData, ни отправки в какой-либо сервис.

/** Ребёнок закрыл камеру/галерею — это не ошибка, экран просто остаётся на месте. */
export type PhotoOutcome =
  | { status: 'ok'; dataUrl: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' }

const QUALITY = 90

function isCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /cancel|no image|нет изображени/i.test(message)
}

/**
 * Браузерный путь: обычный file input. Плагин Camera на вебе тянет
 * @ionic/pwa-elements — лишняя зависимость ради экрана, который на телефоне
 * всё равно идёт через нативный код. capture="user" подсказывает мобильному
 * браузеру открыть фронтальную камеру.
 */
function pickWithFileInput(preferCamera: boolean): Promise<PhotoOutcome> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (preferCamera) input.capture = 'user'
    input.style.display = 'none'

    let settled = false
    const finish = (outcome: PhotoOutcome) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(outcome)
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        finish({ status: 'cancelled' })
        return
      }

      // FileReader читает файл локально — байты не покидают страницу.
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        finish(
          typeof result === 'string'
            ? { status: 'ok', dataUrl: result }
            : { status: 'unavailable' },
        )
      }
      reader.onerror = () => finish({ status: 'unavailable' })
      reader.readAsDataURL(file)
    })

    // Не во всех браузерах есть, поэтому это дополнение к change, а не замена.
    input.addEventListener('cancel', () => finish({ status: 'cancelled' }))

    document.body.appendChild(input)
    input.click()
  })
}

async function pickFromGallery(): Promise<PhotoOutcome> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      quality: QUALITY,
      correctOrientation: true,
    })
    return photo.dataUrl ? { status: 'ok', dataUrl: photo.dataUrl } : { status: 'unavailable' }
  } catch (error) {
    return isCancellation(error) ? { status: 'cancelled' } : { status: 'unavailable' }
  }
}

/**
 * Снять себя на камеру. Если камеры нет, разрешение не дали или что-то пошло
 * не так — молча уходим в галерею: ребёнок не должен упереться в тупик.
 */
export async function capturePhoto(): Promise<PhotoOutcome> {
  if (!Capacitor.isNativePlatform()) {
    return pickWithFileInput(true)
  }

  try {
    const status = await Camera.checkPermissions()

    if (status.camera !== 'granted') {
      const granted = await Camera.requestPermissions({ permissions: ['camera'] })
      if (granted.camera !== 'granted') {
        // Отказ в доступе к камере — не конец: предлагаем галерею.
        return pickFromGallery()
      }
    }

    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      direction: CameraDirection.Front,
      resultType: CameraResultType.DataUrl,
      quality: QUALITY,
      correctOrientation: true,
      // Системный редактор кадрирования не нужен — свой экран обрезки понятнее.
      allowEditing: false,
    })

    return photo.dataUrl ? { status: 'ok', dataUrl: photo.dataUrl } : { status: 'unavailable' }
  } catch (error) {
    if (isCancellation(error)) return { status: 'cancelled' }
    return pickFromGallery()
  }
}

/** Явный выбор из галереи — кнопкой, а не только как аварийный путь. */
export async function choosePhotoFromGallery(): Promise<PhotoOutcome> {
  if (!Capacitor.isNativePlatform()) {
    return pickWithFileInput(false)
  }
  return pickFromGallery()
}
