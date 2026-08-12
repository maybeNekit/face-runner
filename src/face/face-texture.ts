// Превращение выбранного куска фото в готовую текстуру лица.

/** Сторона текстуры. Степень двойки — Three.js не будет её пересэмплировать. */
export const FACE_TEXTURE_SIZE = 256

/**
 * Вырезает квадратный участок фото и возвращает PNG-dataURL 256×256
 * с круглой альфа-маской: углы полностью прозрачны.
 *
 * Источник — только dataURL, поэтому canvas не «портится» (tainted)
 * и toDataURL работает. Изображение с http(s)-адреса сломало бы экспорт.
 */
export function cropToCircularFace(
  image: HTMLImageElement,
  sourceX: number,
  sourceY: number,
  sourceSize: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = FACE_TEXTURE_SIZE
  canvas.height = FACE_TEXTURE_SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D-контекст недоступен')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    FACE_TEXTURE_SIZE,
    FACE_TEXTURE_SIZE,
  )

  // destination-in оставляет пиксели только под кругом — получается
  // круглая альфа-маска без ручного перебора пикселей.
  const radius = FACE_TEXTURE_SIZE / 2
  ctx.globalCompositeOperation = 'destination-in'
  ctx.beginPath()
  ctx.arc(radius, radius, radius, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'

  // PNG, а не JPEG: JPEG не умеет альфу и вернул бы чёрные углы.
  return canvas.toDataURL('image/png')
}
