const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const size = 128
const font = {
  i: ['00100', '00000', '01110', '00100', '00100', '00100', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  n: ['00000', '00000', '01110', '10001', '10001', '10001', '10001'],
}

function crc32(buffer) {
  let crc = ~0
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const pixels = Buffer.alloc(size * size * 4)
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const dx = Math.abs(x - size / 2 + 0.5)
    const dy = Math.abs(y - size / 2 + 0.5)
    const outside = dx > 56 || dy > 56
    const corner = Math.max(dx - 40, 0) ** 2 + Math.max(dy - 40, 0) ** 2 > 16 ** 2
    const index = (y * size + x) * 4
    if (outside || corner) continue
    pixels[index] = 15
    pixels[index + 1] = 118
    pixels[index + 2] = 110
    pixels[index + 3] = 255
  }
}

const scale = 6
const gap = 4
const text = 'i18n'
const textWidth = text.length * 5 * scale + (text.length - 1) * gap
const textHeight = 7 * scale
let cursorX = Math.floor((size - textWidth) / 2)
const originY = Math.floor((size - textHeight) / 2)

for (const char of text) {
  font[char].forEach((row, rowIndex) => {
    ;[...row].forEach((cell, columnIndex) => {
      if (cell !== '1') return
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const pixelX = cursorX + columnIndex * scale + x
          const pixelY = originY + rowIndex * scale + y
          const index = (pixelY * size + pixelX) * 4
          pixels[index] = 255
          pixels[index + 1] = 255
          pixels[index + 2] = 255
          pixels[index + 3] = 255
        }
      }
    })
  })
  cursorX += 5 * scale + gap
}

const raw = Buffer.alloc(size * (size * 4 + 1))
for (let y = 0; y < size; y += 1) {
  raw[y * (size * 4 + 1)] = 0
  pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(size, 0)
ihdr.writeUInt32BE(size, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const output = path.join(__dirname, '..', 'media', 'icon.png')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, png)
