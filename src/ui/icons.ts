// Иконки рисуются примитивами прямо в коде — в репозитории нет ни одного
// файла-картинки (правило проекта №1). Всё крупное и узнаваемое без подписи:
// ребёнок 6 лет должен понять кнопку, не читая её.
//
// Все иконки нарисованы ТОЛЬКО через currentColor: жёстко заданный белый
// внутри сливался бы с самой иконкой на светлых кнопках и превращал её
// в пятно. Толстая обводка держит их читаемыми на любом фоне.

const STROKE = 6

function svg(body: string): string {
  return `<svg class="icon" viewBox="0 0 64 64" fill="none" stroke="currentColor"
    stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${body}</svg>`
}

/** Фотоаппарат: корпус, видоискатель, объектив, вспышка. */
export const iconCamera = svg(`
  <rect x="5" y="19" width="54" height="37" rx="9"/>
  <path d="M22 19 L26 11 H38 L42 19 Z" fill="currentColor"/>
  <circle cx="32" cy="37" r="11"/>
  <circle cx="32" cy="37" r="3" fill="currentColor" stroke="none"/>
  <circle cx="50" cy="28" r="2.5" fill="currentColor" stroke="none"/>
`)

/** Галерея: рамка с горкой и солнцем — привычный значок «картинки». */
export const iconGallery = svg(`
  <rect x="5" y="13" width="54" height="38" rx="8"/>
  <circle cx="21" cy="26" r="4" fill="currentColor" stroke="none"/>
  <path d="M12 45 L26 31 L34 39 L44 30 L52 45 Z" fill="currentColor"/>
`)

/** Круговая стрелка — «ещё раз». */
export const iconAgain = svg(`
  <path d="M52 32 A20 20 0 1 1 32 12"/>
  <path d="M33 3 L33 22 L16 12 Z" fill="currentColor"/>
`)

/**
 * Галочка «готово». Треугольник «играть» тут был бы обманом: он обещает
 * запуск игры, а ведёт в меню — ребёнку это обиднее, чем отсутствие обещания.
 */
export const iconGo = svg(`
  <path d="M13 33 L27 47 L51 17"/>
`)

/** Крупная галочка для безопасного ответа в подтверждении. */
export const iconYes = svg(`
  <path d="M13 33 L27 47 L51 17"/>
`)

/** Крестик для разрушительного ответа. */
export const iconNo = svg(`
  <path d="M18 18 L46 46 M46 18 L18 46"/>
`)

/** Улыбающееся лицо — «новое лицо». Улыбка, а не нейтральный овал: тон добрый. */
export const iconFace = svg(`
  <circle cx="32" cy="32" r="25"/>
  <circle cx="23" cy="27" r="3.5" fill="currentColor" stroke="none"/>
  <circle cx="41" cy="27" r="3.5" fill="currentColor" stroke="none"/>
  <path d="M21 38 Q32 49 43 38"/>
`)
