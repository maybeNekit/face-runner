// Бонусы-модификаторы. Действуют POWERUP_DURATION секунд и все они —
// подарок, а не наказание: ни один не делает игру труднее настолько,
// чтобы ребёнок из-за него проиграл.
//
// Исключение — Роналду: он уводит на пенальти, где можно и промахнуться.
// Это осознанный выбор владельца игры, см. комментарий в penalty.ts.

export const MOD_NONE = -1
export const MOD_GIANT_HEAD = 0
export const MOD_TINY_BODY = 1
export const MOD_JELLY = 2
export const MOD_JET_BOOTS = 3
export const MOD_KOLOBOK = 4
export const MOD_RONALDO = 5

export const MOD_COUNT = 6

/** Подписи для HUD. Короткие — читать на бегу некогда. */
export const MOD_LABEL = [
  'ОГРОМНАЯ ГОЛОВА',
  'КРОШКА',
  'ЖЕЛЕ',
  'РЕАКТИВНЫЕ БОТЫ',
  'КОЛОБОК',
  'РОНАЛДУ',
]

/** Иконка — системная эмодзи, никаких файлов шрифтов и картинок. */
export const MOD_ICON = ['🗿', '🐣', '🍮', '🚀', '🟠', '⚽']

/** Цвет плашки бонуса в HUD. */
export const MOD_COLOR = ['#ff9f45', '#7bd389', '#ff5d8f', '#4ecdc4', '#ffb347', '#4ecdc4']

/** Колобок катится и сносит всё на пути. */
export function isKolobok(modifier: number): boolean {
  return modifier === MOD_KOLOBOK
}
