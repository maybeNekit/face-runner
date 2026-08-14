// Аварийный экран.
//
// Если что-то упало насмерть, ребёнок не должен увидеть белый экран: для него
// это «игра сломалась навсегда». Показываем добрую заглушку с одной большой
// кнопкой, которая перезапускает приложение.
//
// Никакой технической информации на экране нет — она бесполезна ребёнку
// и пугает. Подробности уходят в консоль, где их увидит взрослый.

let shown = false

function render(): void {
  if (shown) return
  shown = true

  const screen = document.createElement('div')
  screen.className = 'crash-screen'
  screen.innerHTML = `
    <div class="crash-screen__emoji">🙃</div>
    <h1 class="crash-screen__title">Ой, игра споткнулась</h1>
    <p class="crash-screen__note">Ничего страшного, сейчас поднимемся!</p>
    <button class="button button--huge button--primary" type="button">
      <span>НАЧАТЬ ЗАНОВО</span>
    </button>
  `

  screen.querySelector('button')!.addEventListener('click', () => {
    window.location.reload()
  })

  document.body.appendChild(screen)
}

/** Вешает перехватчики один раз при старте приложения. */
export function installCrashScreen(): void {
  window.addEventListener('error', (event) => {
    console.error('Необработанная ошибка:', event.error ?? event.message)
    render()
  })

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Необработанный отказ промиса:', event.reason)
    render()
  })
}
