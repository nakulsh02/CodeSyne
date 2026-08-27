import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generateAllAppIcons() {
  const svgSource = path.join(process.cwd(), 'public', 'icon.svg');
  const svgBuffer = fs.readFileSync(svgSource);

  // 1. Windows Tauri Icons & 3.00 ICO
  const tauriDir = path.join(process.cwd(), 'src-tauri', 'icons');
  if (!fs.existsSync(tauriDir)) {
    fs.mkdirSync(tauriDir, { recursive: true });
  }

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const imagesData: Array<{ width: number; height: number; dibBuffer: Buffer }> = [];

  for (const size of icoSizes) {
    const rawBuffer = await sharp(svgBuffer)
      .resize(size, size)
      .ensureAlpha()
      .raw()
      .toBuffer();

    const xorSize = size * size * 4;
    const xorBuffer = Buffer.alloc(xorSize);

    for (let y = 0; y < size; y++) {
      const srcY = size - 1 - y;
      for (let x = 0; x < size; x++) {
        const srcOffset = (srcY * size + x) * 4;
        const dstOffset = (y * size + x) * 4;
        xorBuffer[dstOffset] = rawBuffer[srcOffset + 2]; // B
        xorBuffer[dstOffset + 1] = rawBuffer[srcOffset + 1]; // G
        xorBuffer[dstOffset + 2] = rawBuffer[srcOffset]; // R
        xorBuffer[dstOffset + 3] = rawBuffer[srcOffset + 3]; // A
      }
    }

    const andRowBytes = Math.ceil(size / 32) * 4;
    const andSize = andRowBytes * size;
    const andBuffer = Buffer.alloc(andSize, 0);

    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8);
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    header.writeUInt32LE(0, 16);
    header.writeUInt32LE(xorSize + andSize, 20);
    header.writeInt32LE(0, 24);
    header.writeInt32LE(0, 28);
    header.writeUInt32LE(0, 32);
    header.writeUInt32LE(0, 36);

    const dibBuffer = Buffer.concat([header, xorBuffer, andBuffer]);
    imagesData.push({ width: size, height: size, dibBuffer });
  }

  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(imagesData.length, 4);

  let currentOffset = 6 + imagesData.length * 16;
  const dirEntries: Buffer[] = [];

  for (const img of imagesData) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.dibBuffer.length, 8);
    entry.writeUInt32LE(currentOffset, 12);

    dirEntries.push(entry);
    currentOffset += img.dibBuffer.length;
  }

  const finalIcoBuffer = Buffer.concat([
    icoHeader,
    ...dirEntries,
    ...imagesData.map((img) => img.dibBuffer),
  ]);

  fs.writeFileSync(path.join(tauriDir, 'icon.ico'), finalIcoBuffer);
  fs.writeFileSync(path.join(process.cwd(), 'public', 'favicon.ico'), finalIcoBuffer);

  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(tauriDir, '32x32.png'));
  await sharp(svgBuffer).resize(128, 128).png().toFile(path.join(tauriDir, '128x128.png'));
  await sharp(svgBuffer).resize(256, 256).png().toFile(path.join(tauriDir, '128x128@2x.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(tauriDir, 'icon.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(tauriDir, 'icon.icns'));
  await sharp(svgBuffer).resize(30, 30).png().toFile(path.join(tauriDir, 'Square30x30Logo.png'));
  await sharp(svgBuffer).resize(44, 44).png().toFile(path.join(tauriDir, 'Square44x44Logo.png'));
  await sharp(svgBuffer).resize(71, 71).png().toFile(path.join(tauriDir, 'Square71x71Logo.png'));
  await sharp(svgBuffer).resize(89, 89).png().toFile(path.join(tauriDir, 'Square89x89Logo.png'));
  await sharp(svgBuffer).resize(107, 107).png().toFile(path.join(tauriDir, 'Square107x107Logo.png'));
  await sharp(svgBuffer).resize(142, 142).png().toFile(path.join(tauriDir, 'Square142x142Logo.png'));
  await sharp(svgBuffer).resize(150, 150).png().toFile(path.join(tauriDir, 'Square150x150Logo.png'));
  await sharp(svgBuffer).resize(284, 284).png().toFile(path.join(tauriDir, 'Square284x284Logo.png'));
  await sharp(svgBuffer).resize(310, 310).png().toFile(path.join(tauriDir, 'Square310x310Logo.png'));
  await sharp(svgBuffer).resize(50, 50).png().toFile(path.join(tauriDir, 'StoreLogo.png'));

  // 2. Android Mipmap Icons
  const androidResDir = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res');
  const mipmapDensities = [
    { name: 'mipmap-mdpi', size: 48 },
    { name: 'mipmap-hdpi', size: 72 },
    { name: 'mipmap-xhdpi', size: 96 },
    { name: 'mipmap-xxhdpi', size: 144 },
    { name: 'mipmap-xxxhdpi', size: 192 },
  ];

  for (const { name, size } of mipmapDensities) {
    const dirPath = path.join(androidResDir, name);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(dirPath, 'ic_launcher.png'));
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(dirPath, 'ic_launcher_round.png'));
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(dirPath, 'ic_launcher_foreground.png'));
  }

  // Android Drawable
  const drawableDir = path.join(androidResDir, 'drawable');
  if (!fs.existsSync(drawableDir)) {
    fs.mkdirSync(drawableDir, { recursive: true });
  }
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(drawableDir, 'ic_launcher_background.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(drawableDir, 'splash.png'));

  console.log('Successfully generated Windows 3.00 ICO and Android mipmap icon assets!');
}

generateAllAppIcons().catch(console.error);
