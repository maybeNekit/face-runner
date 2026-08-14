// Бонусы-модификаторы. Действуют POWERUP_DURATION секунд и все они —
// подарок, а не наказание: ни один не делает игру труднее настолько,
// чтобы ребёнок из-за него проиграл.

export const MOD_NONE = -1
export const MOD_GIANT_HEAD = 0
export const MOD_TINY_BODY = 1
export const MOD_JELLY = 2
export const MOD_JET_BOOTS = 3
export const MOD_MIRROR = 4

export const MOD_COUNT = 5

/** Подписи для HUD. Короткие — читать на бегу некогда. */
export const MOD_LABEL = [
  'ОГРОМНАЯ ГОЛОВА',
  'КРОШКА',
  'ЖЕЛЕ',
  'РЕАКТИВНЫЕ БОТЫ',
  'ЗЕРКАЛО',
]

/** Иконка — системная эмодзи, никаких файлов шрифтов и картинок. */
export const MOD_ICON = ['🗿', '🐣', '🍮', '🚀', '🪞']

/** Цвет плашки бонуса в HUD. */
export const MOD_COLOR = ['#ff9f45', '#7bd389', '#ff5d8f', '#4ecdc4', '#a06cd5']

/**
 * «Зеркало» вместо «вверх ногами».
 *
 * Настоящий переворот камеры на 8 секунд у ребёнка 6 лет — это риск укачать
 * и гарантированное столкновение из-за инвертированного управления.
 * Зеркало даёт ту же путаницу и тот же смех, но картинка остаётся на месте.
 */
export function isMirrored(modifier: number): boolean {
  return modifier === MOD_MIRROR
}
