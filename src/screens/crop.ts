import { cropToCircularFace } from '../face/face-texture'
import { iconAgain, iconGo } from '../ui/icons'
import { gentleFailFeedback, successFeedback, tapFeedback } from '../ui/feedback'

export interface CropOptions {
  photoDataUrl: string
  onRetake: () => void
  onConfirm: (faceDataUrl: string) => void
}

/** Цвета бусин весёлой рамки вокруг круга. */
const FRAME_COLORS = ['#ff5d8f', '#ffd93d', '#4ecdc4', '#a06cd5', '#7bd389', '#ff9f45']

/** Насколько сильно можно приблизить относительно минимального масштаба. */
const MAX_ZOOM_FACTOR = 6

/** Запас вокруг круга под бусины рамки. */
const FRAME_MARGIN = 26

export function renderCropScreen(root: HTMLElement, options: CropOptions): () => void {
  root.innerHTML = `
    <div class="screen screen--crop">
      <canvas class="crop__canvas"></canvas>

      <div class="crop__bottom">
        <div class="crop__zoom">
          <button class="round-button" type="button" data-action="zoom-out" aria-label="Отдалить">−</button>
          <p class="crop__hint" data-role="hint">Помести лицо в кружок!</p>
          <button class="round-button" type="button" data-action="zoom-in" aria-label="Приблизить">+</button>
        </div>

        <div class="crop__buttons">
          <button class="button button--secondary" type="button" data-action="retake">
            ${iconAgain}
            <span>Ещё раз</span>
          </button>
          <button class="button button--primary" type="button" data-action="confirm">
            ${iconGo}
            <span>Поехали!</span>
          </button>
        </div>
      </div>
    </div>
  `

  const canvas = root.querySelector<HTMLCanvasElement>('.crop__canvas')!
  const bottom = root.querySelector<HTMLDivElement>('.crop__bottom')!
  const hint = root.querySelector<HTMLParagraphElement>('[data-role="hint"]')!
  const actionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
  const ctx = canvas.getContext('2d')!

  /** Пока фото декодируется, нажимать нечего — иначе кнопка молчит в ответ. */
  function setReady(ready: boolean): void {
    for (const button of actionButtons) button.disabled = !ready
  }

  setReady(false)
  hint.textContent = 'Секундочку…'

  let image: HTMLImageElement | null = null

  // Трансформация: где на экране находится центр фото и во сколько раз оно
  // увеличено. Всё остальное считается от этих трёх чисел.
  let scale = 1
  let offsetX = 0
  let offsetY = 0

  // Геометрия круглого окна обрезки в экранных координатах.
  let centerX = 0
  let centerY = 0
  let radius = 0
  let viewWidth = 0
  let viewHeight = 0

  const pointers = new Map<number, { x: number; y: number }>()
  let lastDistance = 0
  let lastMidX = 0
  let lastMidY = 0

  function layout(): void {
    // Ограничиваем dpr двойкой: на телефонах с dpr 3 холст во весь экран
    // стоит втрое дороже, а разницы на глаз нет.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    viewWidth = root.clientWidth
    viewHeight = root.clientHeight

    canvas.width = Math.round(viewWidth * dpr)
    canvas.height = Math.round(viewHeight * dpr)
    canvas.style.width = `${viewWidth}px`
    canvas.style.height = `${viewHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Низ экрана занят подсказкой и кнопками — круг центрируем в остатке,
    // иначе в ландшафте он уезжает под кнопки. Высоту меряем, а не задаём
    // константой: на узком экране кнопки переносятся на две строки,
    // и при жёстком числе нижняя кнопка уезжала за край.
    const reserved = bottom.offsetHeight + 22
    const available = Math.max(viewHeight - reserved, 140)

    centerX = viewWidth / 2
    radius = Math.min((available - FRAME_MARGIN * 2) / 2, viewWidth * 0.42, 190)

    // Бусины рамки торчат наружу, поэтому круг нельзя просто отцентрировать:
    // в ландшафте верхний ряд бусин упирался в край экрана и срезался.
    centerY = Math.max(available / 2, radius + frameOverhang() + 10)
  }

  function beadRadius(): number {
    return Math.max(7, radius * 0.085)
  }

  /** Насколько рамка выступает за круг: смещение бусины плюс её радиус. */
  function frameOverhang(): number {
    return beadRadius() * 1.85 + 4
  }

  function minScale(): number {
    if (!image) return 1
    // Круг обязан быть полностью закрыт фото — иначе в текстуру попадёт пустота.
    return (radius * 2) / Math.min(image.width, image.height)
  }

  function clampScale(): void {
    const min = minScale()
    scale = Math.min(Math.max(scale, min), min * MAX_ZOOM_FACTOR)
  }

  function clampOffset(): void {
    if (!image) return
    const halfWidth = (image.width * scale) / 2
    const halfHeight = (image.height * scale) / 2

    offsetX = Math.min(Math.max(offsetX, centerX + radius - halfWidth), centerX - radius + halfWidth)
    offsetY = Math.min(Math.max(offsetY, centerY + radius - halfHeight), centerY - radius + halfHeight)
  }

  function resetTransform(): void {
    scale = minScale()
    offsetX = centerX
    offsetY = centerY
  }

  function drawFunFrame(): void {
    ctx.save()

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()

    const beadCount = 14
    const bead = beadRadius()

    for (let i = 0; i < beadCount; i += 1) {
      const angle = (i / beadCount) * Math.PI * 2 - Math.PI / 2
      const beadX = centerX + Math.cos(angle) * (radius + bead * 0.85)
      const beadY = centerY + Math.sin(angle) * (radius + bead * 0.85)

      ctx.beginPath()
      ctx.fillStyle = FRAME_COLORS[i % FRAME_COLORS.length]
      ctx.arc(beadX, beadY, bead, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  function draw(): void {
    ctx.fillStyle = '#10121a'
    ctx.fillRect(0, 0, viewWidth, viewHeight)

    if (image) {
      ctx.save()
      ctx.translate(offsetX, offsetY)
      ctx.scale(scale, scale)
      ctx.drawImage(image, -image.width / 2, -image.height / 2)
      ctx.restore()

      // Затемнение всего, кроме круга: прямоугольник и круг в одном пути,
      // evenodd делает из круга дырку. Не глуше 0.5 — иначе ребёнок
      // не видит собственное лицо снаружи и не знает, куда его тащить.
      ctx.save()
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.beginPath()
      ctx.rect(0, 0, viewWidth, viewHeight)
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fill('evenodd')
      ctx.restore()
    } else {
      // Пока фото грузится, экран не должен быть пустым и чёрным:
      // рамка на месте, видно, что приложение живо.
      ctx.fillStyle = '#232a44'
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    drawFunFrame()
  }

  function pointFromEvent(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /** Пересчёт опорных значений жеста. Без этого палец, убранный с экрана
   *  вторым, даёт скачок изображения. */
  function syncGesture(): void {
    const points = Array.from(pointers.values())

    if (points.length >= 2) {
      lastDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      lastMidX = (points[0].x + points[1].x) / 2
      lastMidY = (points[0].y + points[1].y) / 2
    } else if (points.length === 1) {
      lastDistance = 0
      lastMidX = points[0].x
      lastMidY = points[0].y
    }
  }

  function onPointerDown(event: PointerEvent): void {
    canvas.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, pointFromEvent(event))
    syncGesture()
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId) || !image) return

    pointers.set(event.pointerId, pointFromEvent(event))
    const points = Array.from(pointers.values())

    if (points.length === 1) {
      offsetX += points[0].x - lastMidX
      offsetY += points[0].y - lastMidY
    } else if (points.length >= 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      const midX = (points[0].x + points[1].x) / 2
      const midY = (points[0].y + points[1].y) / 2

      if (lastDistance > 0) {
        const before = scale
        scale *= distance / lastDistance
        clampScale()

        // Масштабируем вокруг середины между пальцами и одновременно тащим
        // картинку за этой серединой — тогда точка под пальцами не убегает.
        const applied = scale / before
        offsetX = midX + (offsetX - lastMidX) * applied
        offsetY = midY + (offsetY - lastMidY) * applied
      }
    }

    syncGesture()
    clampOffset()
    draw()
  }

  function onPointerUp(event: PointerEvent): void {
    pointers.delete(event.pointerId)
    syncGesture()
  }

  /** Колесо мыши — чтобы экран можно было проверять в браузере на десктопе. */
  function onWheel(event: WheelEvent): void {
    if (!image) return
    event.preventDefault()

    const rect = canvas.getBoundingClientRect()
    const pivotX = event.clientX - rect.left
    const pivotY = event.clientY - rect.top

    const before = scale
    scale *= Math.exp(-event.deltaY * 0.0015)
    clampScale()

    const applied = scale / before
    offsetX = pivotX + (offsetX - pivotX) * applied
    offsetY = pivotY + (offsetY - pivotY) * applied

    clampOffset()
    draw()
  }

  /** Приближение кнопкой: щипок двумя пальцами ребёнку 6 лет даётся плохо. */
  function zoomBy(factor: number): void {
    if (!image) return

    const before = scale
    scale *= factor
    clampScale()

    // Масштабируем вокруг центра круга — именно туда смотрит ребёнок.
    const applied = scale / before
    offsetX = centerX + (offsetX - centerX) * applied
    offsetY = centerY + (offsetY - centerY) * applied

    clampOffset()
    draw()
  }

  function confirm(): void {
    if (!image) return

    // Обратное преобразование: какой квадрат в пикселях фото виден в круге.
    const sourceSize = (radius * 2) / scale
    const centerInImageX = (centerX - offsetX) / scale + image.width / 2
    const centerInImageY = (centerY - offsetY) / scale + image.height / 2

    try {
      const faceDataUrl = cropToCircularFace(
        image,
        centerInImageX - sourceSize / 2,
        centerInImageY - sourceSize / 2,
        sourceSize,
      )
      successFeedback()
      options.onConfirm(faceDataUrl)
    } catch {
      // Молчаливый провал — тупик: ребёнок жмёт и не понимает, что случилось.
      gentleFailFeedback()
      hint.textContent = 'Ой, не получилось. Давай ещё разок 🙂'
    }
  }

  function onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!target) return

    const action = target.dataset.action

    if (action === 'retake') {
      tapFeedback()
      options.onRetake()
      return
    }

    if (action === 'zoom-in') {
      tapFeedback()
      zoomBy(1.3)
      return
    }

    if (action === 'zoom-out') {
      tapFeedback()
      zoomBy(1 / 1.3)
      return
    }

    if (action === 'confirm') {
      confirm()
    }
  }

  function onResize(): void {
    layout()
    clampScale()
    clampOffset()
    draw()
  }

  const loaded = new Image()
  loaded.onload = () => {
    image = loaded
    layout()
    resetTransform()
    clampOffset()
    draw()
    hint.textContent = 'Помести лицо в кружок!'
    setReady(true)
  }
  loaded.onerror = () => {
    // Не выбрасываем молча на стартовый экран — сначала объясняем, что
    // произошло, и оставляем ребёнку кнопку «Ещё раз».
    gentleFailFeedback()
    hint.textContent = 'Фото не открылось. Давай снимем заново 🙂'
    const retake = root.querySelector<HTMLButtonElement>('[data-action="retake"]')
    if (retake) retake.disabled = false
  }
  loaded.src = options.photoDataUrl

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  root.addEventListener('click', onClick)
  window.addEventListener('resize', onResize)

  layout()

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('wheel', onWheel)
    root.removeEventListener('click', onClick)
    window.removeEventListener('resize', onResize)
    loaded.onload = null
    loaded.onerror = null
  }
}
