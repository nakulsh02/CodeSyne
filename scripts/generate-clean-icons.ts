import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

async function generateAllCleanIcons() {
  const svgSource = path.join(process.cwd(), 'public', 'icon.svg');
  const svgBuffer = fs.readFileSync(svgSource);

  // 1. Prepare temp directory for standard PNG resolutions
  const tempDir = path.join(process.cwd(), '.temp-icons');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const standardSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngPaths: string[] = [];

  for (const size of standardSizes) {
    const pngPath = path.join(tempDir, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(pngPath);
    pngPaths.push(pngPath);
  }

  // 2. Generate standard Windows ICO via png-to-ico
  const icoBuffer = await pngToIco(pngPaths);

  const tauriIconsDir = path.join(process.cwd(), 'src-tauri', 'icons');
  if (!fs.existsSync(tauriIconsDir)) {
    fs.mkdirSync(tauriIconsDir, { recursive: true });
  }

  fs.writeFileSync(path.join(tauriIconsDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(process.cwd(), 'public', 'favicon.ico'), icoBuffer);
  console.log(`Generated standard Windows ICO (${icoBuffer.length} bytes) at src-tauri/icons/icon.ico and public/favicon.ico`);

  // 3. Clean up temp directory
  fs.rmSync(tempDir, { recursive: true, force: true });

  // 4. Generate Tauri PNGs & ICNS
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(tauriIconsDir, '32x32.png'));
  await sharp(svgBuffer).resize(128, 128).png().toFile(path.join(tauriIconsDir, '128x128.png'));
  await sharp(svgBuffer).resize(256, 256).png().toFile(path.join(tauriIconsDir, '128x128@2x.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(tauriIconsDir, 'icon.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(tauriIconsDir, 'icon.icns'));
  await sharp(svgBuffer).resize(30, 30).png().toFile(path.join(tauriIconsDir, 'Square30x30Logo.png'));
  await sharp(svgBuffer).resize(44, 44).png().toFile(path.join(tauriIconsDir, 'Square44x44Logo.png'));
  await sharp(svgBuffer).resize(71, 71).png().toFile(path.join(tauriIconsDir, 'Square71x71Logo.png'));
  await sharp(svgBuffer).resize(89, 89).png().toFile(path.join(tauriIconsDir, 'Square89x89Logo.png'));
  await sharp(svgBuffer).resize(107, 107).png().toFile(path.join(tauriIconsDir, 'Square107x107Logo.png'));
  await sharp(svgBuffer).resize(142, 142).png().toFile(path.join(tauriIconsDir, 'Square142x142Logo.png'));
  await sharp(svgBuffer).resize(150, 150).png().toFile(path.join(tauriIconsDir, 'Square150x150Logo.png'));
  await sharp(svgBuffer).resize(284, 284).png().toFile(path.join(tauriIconsDir, 'Square284x284Logo.png'));
  await sharp(svgBuffer).resize(310, 310).png().toFile(path.join(tauriIconsDir, 'Square310x310Logo.png'));
  await sharp(svgBuffer).resize(50, 50).png().toFile(path.join(tauriIconsDir, 'StoreLogo.png'));

  // 5. Android Mipmap Icons
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

  // 6. Android Drawable
  const drawableDir = path.join(androidResDir, 'drawable');
  if (!fs.existsSync(drawableDir)) {
    fs.mkdirSync(drawableDir, { recursive: true });
  }
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(drawableDir, 'ic_launcher_background.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(drawableDir, 'splash.png'));

  // 7. Public Web Icons
  const publicDir = path.join(process.cwd(), 'public');
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));

  console.log('All application icons created and verified successfully!');
}

generateAllCleanIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
