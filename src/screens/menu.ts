import { iconFace, iconNo, iconYes } from '../ui/icons'
import { tapFeedback } from '../ui/feedback'

export interface MenuOptions {
  faceDataUrl: string
  onNewFace: () => void
  onDeleteFace: () => void
}

export function renderMenuScreen(root: HTMLElement, options: MenuOptions): () => void {
  root.innerHTML = `
    <div class="screen screen--menu">
      <div class="menu__face">
        <div class="menu__face-ring"></div>
        <img class="menu__face-image" src="${options.faceDataUrl}" alt="Твой герой">
      </div>

      <div class="menu__controls">
        <h1 class="screen__title screen__title--small">Твой герой готов!</h1>

        <button class="button button--primary" type="button" data-action="new-face">
          ${iconFace}
          <span>Новое лицо</span>
        </button>

        <div class="menu__danger" data-role="danger">
          <button class="link-button" type="button" data-action="ask-delete">Удалить фото</button>
        </div>

        <p class="screen__note">Игра скоро появится 🚀</p>
      </div>
    </div>
  `

  const danger = root.querySelector<HTMLDivElement>('[data-role="danger"]')!

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
    tapFeedback()

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
