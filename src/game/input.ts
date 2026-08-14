// Управление: свайпы, тапы и клавиши.
//
// Тап по половине экрана — равноправная альтернатива свайпу: у ребёнка
// свайп получается не всегда, а ткнуть в сторону он умеет точно.

export type GameAction = 'left' | 'right' | 'jump' | 'slide'

/**
 * Минимальный сдвиг, который считается свайпом.
 *
 * 34, а не 26: свайп срабатывает прямо в движении, и при близком пороге
 * дрожь пальца во время тапа выстреливала бы свайпом.
 */
const SWIPE_MIN_DISTANCE = 34
/** Сдвиг, ниже которого жест считается тапом. */
const TAP_MAX_DISTANCE = 16
/** Дольше — это уже не жест, а «подумал и передумал». */
const GESTURE_MAX_TIME = 700

export function createInput(
  target: HTMLElement,
  onAction: (action: GameAction) => void,
): () => void {
  let startX = 0
  let startY = 0
  let startTime = 0
  let tracking = false
  /** Свайп уже выстрелил — pointerup не должен продублировать его тапом. */
  let fired = false

  function onPointerDown(event: PointerEvent): void {
    tracking = true
    fired = false
    startX = event.clientX
    startY = event.clientY
    startTime = performance.now()
  }

  /**
   * Свайп срабатывает в момент пересечения порога, а не по отпусканию пальца.
   *
   * Иначе вся длительность жеста уходила в задержку, а свайп у ребёнка
   * занимает 150–300 мс — это 8–18 потерянных кадров на каждом действии.
   */
  function onPointerMove(event: PointerEvent): void {
    if (!tracking || fired) return

    const dx = event.clientX - startX
    const dy = event.clientY - startY
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    if (Math.max(absX, absY) < SWIPE_MIN_DISTANCE) return
    if (performance.now() - startTime > GESTURE_MAX_TIME) return

    fired = true

    // Направление определяет доминирующая ось — по диагонали ребёнок
    // свайпает постоянно, и жест не должен из-за этого теряться.
    if (absX > absY) {
      onAction(dx > 0 ? 'right' : 'left')
    } else {
      onAction(dy > 0 ? 'slide' : 'jump')
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (!tracking) return
    tracking = false
    if (fired) return

    const dx = event.clientX - startX
    const dy = event.clientY - startY
    const elapsed = performance.now() - startTime
    if (elapsed > GESTURE_MAX_TIME) return

    // Тап остаётся на отпускании: перенести его на pointerdown нельзя —
    // тогда каждый свайп вверх сначала давал бы ложное перестроение.
    if (Math.max(Math.abs(dx), Math.abs(dy)) < TAP_MAX_DISTANCE) {
      const rect = target.getBoundingClientRect()
      onAction(event.clientX - rect.left < rect.width / 2 ? 'left' : 'right')
    }
  }

  function onPointerCancel(): void {
    tracking = false
    fired = false
  }

  function onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        onAction('left')
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        onAction('right')
        break
      case 'ArrowUp':
      case 'w':
      case 'W':
      case ' ':
        event.preventDefault()
        onAction('jump')
        break
      case 'ArrowDown':
      case 's':
      case 'S':
        event.preventDefault()
        onAction('slide')
        break
      default:
        break
    }
  }

  target.addEventListener('pointerdown', onPointerDown)
  target.addEventListener('pointermove', onPointerMove)
  target.addEventListener('pointerup', onPointerUp)
  target.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('keydown', onKeyDown)

  return () => {
    target.removeEventListener('pointerdown', onPointerDown)
    target.removeEventListener('pointermove', onPointerMove)
    target.removeEventListener('pointerup', onPointerUp)
    target.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('keydown', onKeyDown)
  }
}
