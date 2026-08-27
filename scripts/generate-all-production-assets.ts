import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execSync } from 'child_process';

async function generateAllAssets() {
  const rootDir = process.cwd();
  const svgSource = path.join(rootDir, 'public', 'icon.svg');
  if (!fs.existsSync(svgSource)) {
    throw new Error('Source icon.svg not found at ' + svgSource);
  }
  const svgBuffer = fs.readFileSync(svgSource);

  // 1. Target directories
  const dirs = [
    path.join(rootDir, 'public'),
    path.join(rootDir, 'frontend', 'public'),
    path.join(rootDir, 'src-tauri', 'icons'),
    path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi'),
    path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-hdpi'),
    path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xhdpi'),
    path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxhdpi'),
    path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi'),
    path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'drawable'),
  ];

  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  // 2. Generate standard 1024 master PNG
  const master1024 = path.join(rootDir, 'temp-master-1024.png');
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(master1024);

  // 3. Generate ImageMagick compliant multi-size Windows ICO
  const tauriIco = path.join(rootDir, 'src-tauri', 'icons', 'icon.ico');
  const publicIco = path.join(rootDir, 'public', 'favicon.ico');
  const frontendIco = path.join(rootDir, 'frontend', 'public', 'favicon.ico');

  execSync(`convert "${master1024}" -background transparent -define icon:auto-resize=256,128,64,48,32,16 "${tauriIco}"`);
  fs.copyFileSync(tauriIco, publicIco);
  fs.copyFileSync(tauriIco, frontendIco);
  console.log('Generated Windows RC.EXE-compliant icon.ico and favicon.ico');

  // Clean up master 1024 temp
  fs.unlinkSync(master1024);

  // 4. Generate all Tauri icons
  const tauriIconsDir = path.join(rootDir, 'src-tauri', 'icons');
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

  // 5. Generate Android icons
  const androidResDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');
  const mipmapDensities = [
    { name: 'mipmap-mdpi', size: 48 },
    { name: 'mipmap-hdpi', size: 72 },
    { name: 'mipmap-xhdpi', size: 96 },
    { name: 'mipmap-xxhdpi', size: 144 },
    { name: 'mipmap-xxxhdpi', size: 192 },
  ];

  for (const { name, size } of mipmapDensities) {
    const dirPath = path.join(androidResDir, name);
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(dirPath, 'ic_launcher.png'));
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(dirPath, 'ic_launcher_round.png'));
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(dirPath, 'ic_launcher_foreground.png'));
  }

  const drawableDir = path.join(androidResDir, 'drawable');
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(drawableDir, 'ic_launcher_background.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(drawableDir, 'splash.png'));

  // 6. Generate Web & PWA PNG icons in public & frontend/public
  const webSizes = [16, 32, 48, 64, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512, 1024];
  const targetPublicDirs = [
    path.join(rootDir, 'public'),
    path.join(rootDir, 'frontend', 'public'),
  ];

  for (const pDir of targetPublicDirs) {
    fs.copyFileSync(svgSource, path.join(pDir, 'icon.svg'));
    fs.copyFileSync(svgSource, path.join(pDir, 'favicon.svg'));
    fs.copyFileSync(svgSource, path.join(pDir, 'icon-maskable.svg'));
    fs.copyFileSync(svgSource, path.join(pDir, 'icon-transparent.svg'));
    fs.copyFileSync(svgSource, path.join(pDir, 'icon-192.svg'));
    fs.copyFileSync(svgSource, path.join(pDir, 'icon-512.svg'));

    for (const size of webSizes) {
      await sharp(svgBuffer).resize(size, size).png().toFile(path.join(pDir, `icon-${size}.png`));
    }
    await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(pDir, 'icon-maskable-192.png'));
    await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(pDir, 'icon-maskable-512.png'));
    await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(pDir, 'apple-touch-icon.png'));
    await sharp(svgBuffer).resize(16, 16).png().toFile(path.join(pDir, 'favicon-16x16.png'));
    await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(pDir, 'favicon-32x32.png'));
  }

  console.log('All icons generated in both PNG, SVG, ICO formats across all targets!');
}

generateAllAssets().catch((err) => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
