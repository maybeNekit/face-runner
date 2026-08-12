import './style.css'
import { App } from '@capacitor/app'
import { clearFace, loadFace, saveFace } from './face/face-store'
import { renderCropScreen } from './screens/crop'
import { renderMenuScreen } from './screens/menu'
import { renderWelcomeScreen } from './screens/welcome'

// Роутер экранов создания персонажа.
//
// ПРИВАТНОСТЬ (правило проекта №3): фото ребёнка живёт только в памяти
// вкладки и в локальном хранилище. Во всём приложении нет ни одного
// сетевого вызова — ни fetch, ни XHR, ни аналитики.

const root = document.querySelector<HTMLDivElement>('#app')!

/** Снятие слушателей текущего экрана перед показом следующего. */
let disposeCurrent: (() => void) | null = null

/** Сохранённое лицо, если оно уже есть на устройстве. */
let savedFace: string | null = null

/**
 * Куда ведёт системная кнопка «назад» с текущего экрана.
 *
 * Без этого Capacitor закрывает приложение на первом же «назад»: у SPA нет
 * истории, и Activity просто завершается. С экрана обрезки это означало бы
 * потерю несохранённого фото, а для ребёнка — «игра сама выключилась».
 */
let handleBack: () => void = () => {
  void App.exitApp()
}

function mount(render: (host: HTMLElement) => () => void): void {
  disposeCurrent?.()
  disposeCurrent = render(root)
}

function showWelcome(): void {
  // С экрана фото «назад» уводит в меню, если лицо уже есть.
  // Если лица нет, это самый первый экран — выход из приложения ожидаем.
  handleBack = () => {
    if (savedFace) showMenu(savedFace)
    else void App.exitApp()
  }

  mount((host) =>
    renderWelcomeScreen(host, {
      onPhoto: showCrop,
      // Кнопка «назад» появляется, только когда есть куда вернуться.
      // На первом запуске меню ещё не существует.
      onBack: savedFace ? () => showMenu(savedFace as string) : undefined,
    }),
  )
}

function showCrop(photoDataUrl: string): void {
  // «Назад» с обрезки — то же самое, что «Ещё раз»: возврат к съёмке,
  // а не выход из приложения с потерей кадра.
  handleBack = showWelcome

  mount((host) =>
    renderCropScreen(host, {
      photoDataUrl,
      onRetake: showWelcome,
      onConfirm: (faceDataUrl) => void persistFace(faceDataUrl),
    }),
  )
}

function showMenu(faceDataUrl: string): void {
  handleBack = () => void App.exitApp()

  mount((host) =>
    renderMenuScreen(host, {
      faceDataUrl,
      onNewFace: showWelcome,
      onDeleteFace: () => void removeFace(),
    }),
  )
}

async function persistFace(faceDataUrl: string): Promise<void> {
  savedFace = faceDataUrl
  try {
    await saveFace(faceDataUrl)
  } catch {
    // Не сохранилось — лицо всё равно показываем, чтобы ребёнок не упёрся
    // в непонятную ошибку. Потеряется только между запусками.
  }
  showMenu(faceDataUrl)
}

async function removeFace(): Promise<void> {
  savedFace = null
  try {
    await clearFace()
  } catch {
    // Хранилище недоступно — из интерфейса лицо всё равно убираем.
  }
  showWelcome()
}

async function start(): Promise<void> {
  // На вебе слушатель просто никогда не сработает — плагин это допускает.
  void App.addListener('backButton', () => {
    handleBack()
  })

  try {
    savedFace = await loadFace()
  } catch {
    savedFace = null
  }

  if (savedFace) {
    showMenu(savedFace)
  } else {
    showWelcome()
  }
}

void start()

// Отладочная ручка для проверки экранов в браузере без выбора файла руками.
// import.meta.env.DEV ложно в продакшене, и весь блок вырезается из бандла —
// в APK этого кода нет.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __faceRunnerDev: {
      welcome: showWelcome,
      crop: showCrop,
      menu: showMenu,
    },
  })
}
