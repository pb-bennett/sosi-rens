import fs from 'node:fs/promises';
import path from 'node:path';
import { optimize } from 'svgo';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const SRC = path.resolve('public', 'sosi-rens-logo.svg');
const OUT_SVG = path.resolve('public', 'sosi-rens-logo.min.svg');
const OUT_DIR = path.resolve('public');

async function build() {
  const svg = await fs.readFile(SRC, 'utf8');
  const optimized = optimize(svg, {
    multipass: true,
    plugins: [
      'preset-default',
      { name: 'removeXMLNS', active: false },
      { name: 'removeTitle', active: false },
    ],
  });

  await fs.writeFile(OUT_SVG, optimized.data, 'utf8');
  console.log('Wrote', OUT_SVG);

  const sizes = [16, 32, 180, 192, 512];
  const pngPaths = [];

  for (const size of sizes) {
    const out = path.join(OUT_DIR, `sosi-rens-${size}.png`);
    await sharp(Buffer.from(optimized.data))
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(out);
    pngPaths.push(out);
    console.log('Wrote', out);
  }

  // Create favicon.ico from 16 & 32 px PNGs
  const icoBuffer = await pngToIco([
    path.join(OUT_DIR, 'sosi-rens-16.png'),
    path.join(OUT_DIR, 'sosi-rens-32.png'),
  ]);
  await fs.writeFile(path.join(OUT_DIR, 'favicon.ico'), icoBuffer);
  console.log('Wrote favicon.ico');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
