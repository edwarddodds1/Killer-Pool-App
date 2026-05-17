import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/**
 * Renders the master brand SVGs into every raster the project ships:
 *
 * Web (killer-pool-app/public):
 *   - apple-touch-icon.png   180x180  opaque   from public/favicon.svg
 *   - favicon-32.png         32x32    alpha    from public/favicon.svg
 *
 * Expo web (killer-pool-mobile/assets):
 *   - favicon.png            96x96    alpha    from public/favicon.svg
 *
 * Native iOS / Android / splash (killer-pool-mobile/assets):
 *   - icon.png               1024x1024 OPAQUE  from assets/brand/app-icon.svg
 *                              (Apple App Store icon: must be opaque, square)
 *   - adaptive-icon.png      1024x1024 alpha   from assets/brand/adaptive-icon.svg
 *                              (Android adaptive foreground inside safe zone)
 *   - splash-icon.png        1024x1024 alpha   from assets/brand/splash-icon.svg
 */

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')
const repoRoot = resolve(webRoot, '..')
const mobileAssets = join(repoRoot, 'killer-pool-mobile', 'assets')
const brandSvgs = join(mobileAssets, 'brand')

const faviconSvg = readFileSync(join(webRoot, 'public', 'favicon.svg'))
const appIconSvg = readFileSync(join(brandSvgs, 'app-icon.svg'))
const adaptiveIconSvg = readFileSync(join(brandSvgs, 'adaptive-icon.svg'))
const splashIconSvg = readFileSync(join(brandSvgs, 'splash-icon.svg'))

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const targets = [
  {
    svg: faviconSvg,
    out: join(webRoot, 'public', 'apple-touch-icon.png'),
    size: 180,
    background: '#ffffff',
    flatten: true,
    label: 'web apple-touch-icon (180px, opaque)',
  },
  {
    svg: faviconSvg,
    out: join(webRoot, 'public', 'favicon-32.png'),
    size: 32,
    background: TRANSPARENT,
    flatten: false,
    label: 'web favicon-32 (transparent)',
  },
  {
    svg: faviconSvg,
    out: join(mobileAssets, 'favicon.png'),
    size: 96,
    background: TRANSPARENT,
    flatten: false,
    label: 'expo web favicon.png (96px, transparent)',
  },
  {
    svg: appIconSvg,
    out: join(mobileAssets, 'icon.png'),
    size: 1024,
    background: '#000000',
    flatten: true,
    label: 'iOS app icon (1024px, OPAQUE)',
  },
  {
    svg: adaptiveIconSvg,
    out: join(mobileAssets, 'adaptive-icon.png'),
    size: 1024,
    background: TRANSPARENT,
    flatten: false,
    label: 'Android adaptive foreground (1024px, transparent)',
  },
  {
    svg: splashIconSvg,
    out: join(mobileAssets, 'splash-icon.png'),
    size: 1024,
    background: TRANSPARENT,
    flatten: false,
    label: 'splash icon (1024px, transparent)',
  },
]

for (const target of targets) {
  // Crank density up so SVG -> PNG stays crisp, but cap it: sharp interprets the
  // SVG viewBox at this dpi, so absurd values blow past sharp's pixel limit.
  const density = Math.min(2400, Math.max(384, target.size * 2))
  let pipeline = sharp(target.svg, { density, limitInputPixels: false }).resize(target.size, target.size, {
    fit: 'contain',
    background: target.background,
  })
  if (target.flatten) pipeline = pipeline.flatten({ background: target.background })
  await pipeline.png({ compressionLevel: 9 }).toFile(target.out)
  if (existsSync(target.out)) {
    console.log(`Wrote ${target.label} -> ${target.out}`)
  } else {
    console.warn(`Failed to write ${target.label}`)
  }
}
