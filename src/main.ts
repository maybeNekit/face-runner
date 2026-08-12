import './style.css'

// Проверка сквозного пайплайна: код → GitHub → APK на телефоне.
// Игры здесь пока нет — только доказательство, что сборка доезжает до устройства.

const COLORS = [
  '#000000',
  '#1b3a5c',
  '#0f5132',
  '#5c1b3a',
  '#5c4a1b',
  '#3a1b5c',
] as const

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <h1 class="title">Работает!</h1>
  <button class="button" type="button" id="colorButton">Цвет</button>
`

const button = app.querySelector<HTMLButtonElement>('#colorButton')!

let index = 0

button.addEventListener('click', () => {
  index = (index + 1) % COLORS.length
  app.style.backgroundColor = COLORS[index]

  // Тактильный отклик — часть правила «juice».
  // На desktop-браузерах vibrate отсутствует, поэтому проверяем наличие.
  navigator.vibrate?.(15)
})

app.style.backgroundColor = COLORS[0]
