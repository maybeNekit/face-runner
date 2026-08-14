// Генератор иконки и splash-экрана.
//
// Картинки НЕ рисуются руками и не скачиваются: здесь описан SVG, а sharp
// растеризует его в PNG нужных размеров. Дальше @capacitor/assets режет их
// по всем плотностям экрана.
//
// Это единственное место в проекте, где на диск ложатся файлы-изображения:
// иконка лаунчера — требование Android, без неё приложение не соберётся.
// Игрового контента здесь нет, правило «только код» не нарушено — сама
// картинка описана кодом ниже.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = resolve(root, 'assets')

const YELLOW = '#ffd93d'
const ORANGE = '#ff9f45'
const PINK = '#ff5d8f'
const TEAL = '#4ecdc4'
const SKIN = '#ffd9a8'
const DARK = '#1a202c'
const NIGHT = '#171a2e'

/**
 * Рожица героя. Выносим отдельно, потому что она нужна и в иконке,
 * и на splash — в одном стиле, но разного размера.
 */
function face(cx, cy, r) {
  const eye = r * 0.17
  const eyeY = cy - r * 0.18
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${SKIN}"/>
    <circle cx="${cx - r * 0.36}" cy="${eyeY}" r="${eye}" fill="${DARK}"/>
    <circle cx="${cx + r * 0.36}" cy="${eyeY}" r="${eye}" fill="${DARK}"/>
    <circle cx="${cx - r * 0.62}" cy="${cy + r * 0.14}" r="${r * 0.15}" fill="${PINK}" opacity="0.75"/>
    <circle cx="${cx + r * 0.62}" cy="${cy + r * 0.14}" r="${r * 0.15}" fill="${PINK}" opacity="0.75"/>
    <path d="M ${cx - r * 0.42} ${cy + r * 0.24}
             Q ${cx} ${cy + r * 0.74} ${cx + r * 0.42} ${cy + r * 0.24}"
          stroke="${DARK}" stroke-width="${r * 0.13}" stroke-linecap="round" fill="none"/>
  `
}

/** Полосы скорости — читаются как «бег» даже на мелкой иконке. */
function speedLines(x, y, w, h, color, opacity) {
  let out = ''
  for (let i = 0; i < 3; i += 1) {
    const oy = y + i * h * 1.9
    out += `<rect x="${x - i * w * 0.22}" y="${oy}" width="${w - i * w * 0.2}" height="${h}"
             rx="${h / 2}" fill="${color}" opacity="${opacity}"/>`
  }
  return out
}

/** Иконка целиком, с фоном. Используется как icon-only. */
function iconSvg(size, withBackground = true) {
  const s = size
  const bg = withBackground
    ? `<rect width="${s}" height="${s}" rx="${s * 0.22}" fill="url(#g)"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${YELLOW}"/>
        <stop offset="1" stop-color="${ORANGE}"/>
      </linearGradient>
    </defs>
    ${bg}
    ${speedLines(s * 0.06, s * 0.34, s * 0.2, s * 0.055, '#ffffff', 0.55)}
    ${face(s * 0.55, s * 0.44, s * 0.26)}
    <rect x="${s * 0.42}" y="${s * 0.7}" width="${s * 0.26}" height="${s * 0.13}"
          rx="${s * 0.055}" fill="${TEAL}"/>
    <rect x="${s * 0.38}" y="${s * 0.79}" width="${s * 0.15}" height="${s * 0.08}"
          rx="${s * 0.035}" fill="${PINK}"/>
    <rect x="${s * 0.58}" y="${s * 0.79}" width="${s * 0.15}" height="${s * 0.08}"
          rx="${s * 0.035}" fill="${PINK}"/>
  </svg>`
}

/**
 * Adaptive-иконка Android: передний план должен жить в центральных 66%,
 * потому что лаунчер обрезает края под свою форму.
 */
function foregroundSvg(size) {
  const s = size
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    ${speedLines(s * 0.2, s * 0.4, s * 0.14, s * 0.042, '#ffffff', 0.6)}
    ${face(s * 0.54, s * 0.47, s * 0.19)}
    <rect x="${s * 0.44}" y="${s * 0.66}" width="${s * 0.2}" height="${s * 0.1}"
          rx="${s * 0.042}" fill="${TEAL}"/>
  </svg>`
}

function backgroundSvg(size) {
  const s = size
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${YELLOW}"/>
        <stop offset="1" stop-color="${ORANGE}"/>
      </linearGradient>
    </defs>
    <rect width="${s}" height="${s}" fill="url(#g)"/>
  </svg>`
}

/** Splash: та же рожица по центру, фон сплошной под цвет игры. */
function splashSvg(size, dark) {
  const s = size
  const bg = dark ? NIGHT : YELLOW
  const r = s * 0.11

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <rect width="${s}" height="${s}" fill="${bg}"/>
    ${speedLines(s * 0.3, s * 0.47, s * 0.09, s * 0.024, dark ? '#ffffff' : '#ffffff', 0.45)}
    ${face(s * 0.5, s * 0.5, r)}
  </svg>`
}

async function render(svg, file, size) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
  await writeFile(resolve(assetsDir, file), png)
  console.log(`  ${file}  ${size}×${size}`)
}

await mkdir(assetsDir, { recursive: true })
console.log('Генерирую исходники иконки и splash:')

await render(iconSvg(1024), 'icon-only.png', 1024)
await render(foregroundSvg(1024), 'icon-foreground.png', 1024)
await render(backgroundSvg(1024), 'icon-background.png', 1024)
await render(splashSvg(2732, false), 'splash.png', 2732)
await render(splashSvg(2732, true), 'splash-dark.png', 2732)

console.log('Готово. Дальше: npx capacitor-assets generate --android')
