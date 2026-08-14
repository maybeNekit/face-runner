import * as THREE from 'three'

// Небо-градиент вместо плоской заливки.
//
// Плоский цвет фона — главное, что выдавало «сделано на коленке»: небо
// выглядело картонкой. Купол с вертикальным градиентом стоит один draw call
// и сразу даёт глубину.
//
// Градиент рисуется в канвас и перекрашивается при смене биома, а не
// умножается материалом: так у зенита и горизонта независимые цвета.

const SIZE = 8

export interface Sky {
  readonly mesh: THREE.Mesh
  setColors(horizon: THREE.Color, zenith: THREE.Color): void
}

export function createSky(): Sky {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = 128

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  // BackSide: смотрим на купол изнутри. depthWrite выключен и renderOrder
  // минимальный — небо рисуется первым и не мешает глубине сцены.
  // fog: false, иначе туман сожрал бы сам градиент.
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(240, 16, 12), material)
  mesh.renderOrder = -1
  mesh.frustumCulled = false

  const painted = { horizon: -1, zenith: -1 }

  function setColors(horizon: THREE.Color, zenith: THREE.Color): void {
    const h = horizon.getHex()
    const z = zenith.getHex()
    if (h === painted.horizon && z === painted.zenith) return
    painted.horizon = h
    painted.zenith = z

    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createLinearGradient(0, 0, 0, 128)
    gradient.addColorStop(0, `#${zenith.getHexString()}`)
    gradient.addColorStop(0.55, `#${horizon.clone().lerp(zenith, 0.35).getHexString()}`)
    gradient.addColorStop(1, `#${horizon.getHexString()}`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, SIZE, 128)

    texture.needsUpdate = true
  }

  return { mesh, setColors }
}
