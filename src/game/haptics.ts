import { Haptics, ImpactStyle } from '@capacitor/haptics'

// Тактильный отклик. На вебе плагин сам падает в navigator.vibrate,
// поэтому отдельная ветка для браузера не нужна.
//
// Все вызовы «выстрелил и забыл»: если устройство не умеет вибрировать,
// промис отклоняется, и это не повод ронять кадр.

/**
 * Минимальный интервал между любыми вибрациями.
 *
 * Перестроение и сбор монеток можно заспамить: на максимальной скорости
 * монетки идут по 8.5 штук в секунду. Без ограничителя телефон превратится
 * в непрерывно гудящий кирпич и посадит батарею.
 */
const MIN_INTERVAL_MS = 60

let lastAt = 0

function allow(): boolean {
  const now = performance.now()
  if (now - lastAt < MIN_INTERVAL_MS) return false
  lastAt = now
  return true
}

function impact(style: ImpactStyle): void {
  if (!allow()) return
  void Haptics.impact({ style }).catch(() => {})
}

function buzz(pattern: number | number[]): void {
  if (!allow()) return
  navigator.vibrate?.(pattern)
}

/** Прыжок и приземление — короткий лёгкий толчок. */
export function hapticJump(): void {
  impact(ImpactStyle.Light)
}

export function hapticLand(): void {
  impact(ImpactStyle.Light)
}

/** Подкат — чуть длиннее прыжка, чтобы отличался на ощупь. */
export function hapticSlide(): void {
  buzz(18)
}

/** Перестроение — самый короткий импульс из всех. */
export function hapticLane(): void {
  buzz(10)
}

/** Свайп в стену: «нет-нет». */
export function hapticBlocked(): void {
  buzz(8)
}

/** Комбо — только на заметных ступенях, а не на каждой монетке. */
export function hapticCombo(): void {
  buzz(12)
}

/** Новый рекорд — единственный длинный узор во всей игре. */
export function hapticRecord(): void {
  buzz([20, 40, 20, 40, 35])
}

/** Столкновение — заметный удар, единственное место с тяжёлой вибрацией. */
export function hapticCrash(): void {
  impact(ImpactStyle.Heavy)
}
