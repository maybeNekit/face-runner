import { iconFace, iconGo, iconNo, iconSoundOff, iconSoundOn, iconYes } from '../ui/icons'
import { isMuted, tapFeedback } from '../ui/feedback'
import { saveMuted } from '../ui/sound-settings'

export interface MenuOptions {
  faceDataUrl: string
  onPlay: () => void
  onNewFace: () => void
  onDeleteFace: () => void
}

export function renderMenuScreen(root: HTMLElement, options: MenuOptions): () => void {
  root.innerHTML = `
    <div class="screen screen--menu">
      <!-- Выключатель звука в углу: нужен родителю в тихом месте,
           но не должен спорить за внимание с кнопкой «ИГРАТЬ». -->
      <button class="icon-button" type="button" data-action="sound"
              data-role="sound" aria-label="Звук"></button>

      <div class="menu__face">
        <div class="menu__face-ring"></div>
        <img class="menu__face-image" src="${options.faceDataUrl}" alt="Твой герой">
      </div>

      <div class="menu__controls">
        <h1 class="screen__title screen__title--small">Твой герой готов!</h1>

        <!-- Главное действие экрана — самая крупная кнопка -->
        <button class="button button--huge button--primary" type="button" data-action="play">
          ${iconGo}
          <span>ИГРАТЬ</span>
        </button>

        <button class="button button--secondary" type="button" data-action="new-face">
          ${iconFace}
          <span>Новое лицо</span>
        </button>

        <div class="menu__danger" data-role="danger">
          <button class="link-button" type="button" data-action="ask-delete">Удалить фото</button>
        </div>
      </div>
    </div>
  `

  const danger = root.querySelector<HTMLDivElement>('[data-role="danger"]')!
  const soundButton = root.querySelector<HTMLButtonElement>('[data-role="sound"]')!

  function renderSoundButton(): void {
    const muted = isMuted()
    soundButton.innerHTML = muted ? iconSoundOff : iconSoundOn
    soundButton.classList.toggle('icon-button--off', muted)
    soundButton.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук')
  }

  renderSoundButton()

  function showDeleteConfirm(): void {
    // Подтверждение прямо на месте, без модалки: ребёнку понятнее,
    // и отсюда всегда виден выход «Оставить».
    //
    // Безопасный ответ идёт первым и крупнее, у обеих кнопок есть иконка:
    // ребёнок, который читает по слогам, не должен выбирать «да/нет»
    // наугад, когда цена ошибки — стёртое фото.
    danger.innerHTML = `
      <span class="menu__confirm-text">Точно убрать этого героя?</span>
      <div class="menu__confirm-buttons">
        <button class="button button--primary" type="button" data-action="cancel-delete">
          ${iconYes}
          <span>Оставить</span>
        </button>
        <button class="button button--small button--danger" type="button" data-action="confirm-delete">
          ${iconNo}
          <span>Убрать</span>
        </button>
      </div>
    `
  }

  function showDeleteLink(): void {
    danger.innerHTML = `
      <button class="link-button" type="button" data-action="ask-delete">Удалить фото</button>
    `
  }

  function onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!target) return

    const action = target.dataset.action

    if (action === 'sound') {
      // Звук переключаем ДО отклика: включая звук, ребёнок должен сразу
      // услышать подтверждение, а выключая — не услышать ничего.
      void saveMuted(!isMuted())
      renderSoundButton()
      tapFeedback()
      return
    }

    tapFeedback()

    if (action === 'play') options.onPlay()
    if (action === 'new-face') options.onNewFace()
    if (action === 'ask-delete') showDeleteConfirm()
    if (action === 'cancel-delete') showDeleteLink()
    if (action === 'confirm-delete') options.onDeleteFace()
  }

  root.addEventListener('click', onClick)

  return () => {
    root.removeEventListener('click', onClick)
  }
}
