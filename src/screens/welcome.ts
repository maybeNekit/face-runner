import { capturePhoto, choosePhotoFromGallery } from '../face/photo-source'
import type { PhotoOutcome } from '../face/photo-source'
import { iconCamera, iconGallery } from '../ui/icons'
import { gentleFailFeedback, shutterFeedback, tapFeedback } from '../ui/feedback'

export interface WelcomeOptions {
  onPhoto: (photoDataUrl: string) => void
  /** Задаётся только когда есть куда возвращаться — на первом запуске меню ещё нет. */
  onBack?: () => void
}

export function renderWelcomeScreen(root: HTMLElement, options: WelcomeOptions): () => void {
  root.innerHTML = `
    <div class="screen screen--welcome">
      ${options.onBack ? `<button class="back-button" type="button" data-action="back" aria-label="Назад">←</button>` : ''}

      <h1 class="screen__title">Сфотографируй себя!</h1>

      <button class="button button--huge" type="button" data-action="camera">
        ${iconCamera}
        <span>Сфоткать себя</span>
      </button>

      <!-- «Галерея» — взрослое слово, ребёнок 6 лет его не знает -->
      <button class="button button--secondary" type="button" data-action="gallery">
        ${iconGallery}
        <span>Мои фотки</span>
      </button>

      <p class="screen__note" data-role="note"></p>
    </div>
  `

  const note = root.querySelector<HTMLParagraphElement>('[data-role="note"]')!
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))

  let busy = false

  function setBusy(value: boolean): void {
    busy = value
    // Пока открыта камера — блокируем повторные нажатия, иначе на медленном
    // телефоне ребёнок откроет два диалога подряд.
    for (const button of buttons) button.disabled = value
  }

  function showNote(text: string): void {
    note.textContent = text
  }

  async function run(source: () => Promise<PhotoOutcome>): Promise<void> {
    if (busy) return
    setBusy(true)
    showNote('')

    try {
      const outcome = await source()

      if (outcome.status === 'ok') {
        shutterFeedback()
        options.onPhoto(outcome.dataUrl)
        return
      }

      if (outcome.status === 'unavailable') {
        gentleFailFeedback()
        showNote('Не получилось. Попробуй ещё раз 🙂')
      }
      // 'cancelled' — ребёнок передумал, это нормально и молчит.
    } finally {
      setBusy(false)
    }
  }

  function onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!target) return

    const action = target.dataset.action

    if (action === 'back') {
      tapFeedback()
      options.onBack?.()
      return
    }

    tapFeedback()
    if (action === 'camera') void run(capturePhoto)
    if (action === 'gallery') void run(choosePhotoFromGallery)
  }

  root.addEventListener('click', onClick)

  return () => {
    root.removeEventListener('click', onClick)
  }
}
