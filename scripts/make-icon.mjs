// One-off: build/icon.ico + build/icon.png from build/icon-source.webp.
// Not part of the app itself — just a packaging asset generator.
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(__dirname, '..', 'build')
const source = path.join(buildDir, 'icon-source.webp')

const sizes = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(source)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  )

  const icoBuffer = await pngToIco(pngBuffers)
  writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer)

  // Also keep a standalone 512px PNG for general use (tray icon, README, etc).
  await sharp(source)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(buildDir, 'icon.png'))

  console.log('Wrote build/icon.ico and build/icon.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
