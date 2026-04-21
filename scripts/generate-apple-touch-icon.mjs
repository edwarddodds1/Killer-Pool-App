import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = join(root, 'public', 'favicon.svg')
const outPath = join(root, 'public', 'apple-touch-icon.png')

const svg = readFileSync(svgPath)

await sharp(svg)
  .resize(180, 180, { fit: 'contain', background: '#ffffff' })
  .flatten({ background: '#ffffff' })
  .png()
  .toFile(outPath)

console.log('Wrote', outPath)
