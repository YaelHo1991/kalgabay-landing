import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a 24-bit BMP file from raw RGB data
function createBMP(rgbData, width, height) {
  // BMP row padding - rows must be aligned to 4 bytes
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const padding = rowSize - (width * 3);
  const imageSize = rowSize * height;
  const fileSize = 54 + imageSize; // 54 bytes header + image data

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  // BMP File Header (14 bytes)
  buffer.write('BM', offset); offset += 2;           // Signature
  buffer.writeUInt32LE(fileSize, offset); offset += 4;  // File size
  buffer.writeUInt16LE(0, offset); offset += 2;      // Reserved
  buffer.writeUInt16LE(0, offset); offset += 2;      // Reserved
  buffer.writeUInt32LE(54, offset); offset += 4;     // Offset to pixel data

  // DIB Header (BITMAPINFOHEADER - 40 bytes)
  buffer.writeUInt32LE(40, offset); offset += 4;     // Header size
  buffer.writeInt32LE(width, offset); offset += 4;   // Width
  buffer.writeInt32LE(height, offset); offset += 4;  // Height (positive = bottom-up)
  buffer.writeUInt16LE(1, offset); offset += 2;      // Color planes
  buffer.writeUInt16LE(24, offset); offset += 2;     // Bits per pixel
  buffer.writeUInt32LE(0, offset); offset += 4;      // Compression (none)
  buffer.writeUInt32LE(imageSize, offset); offset += 4;  // Image size
  buffer.writeInt32LE(2835, offset); offset += 4;    // Horizontal resolution (72 DPI)
  buffer.writeInt32LE(2835, offset); offset += 4;    // Vertical resolution (72 DPI)
  buffer.writeUInt32LE(0, offset); offset += 4;      // Colors in palette
  buffer.writeUInt32LE(0, offset); offset += 4;      // Important colors

  // Pixel data (bottom-up, BGR format)
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      // RGB to BGR
      buffer[offset++] = rgbData[srcIdx + 2]; // B
      buffer[offset++] = rgbData[srcIdx + 1]; // G
      buffer[offset++] = rgbData[srcIdx];     // R
    }
    // Add padding
    for (let p = 0; p < padding; p++) {
      buffer[offset++] = 0;
    }
  }

  return buffer;
}

const iconsDir = __dirname;
const tauriIconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');

// Ensure output directory exists
if (!fs.existsSync(tauriIconsDir)) {
  fs.mkdirSync(tauriIconsDir, { recursive: true });
}

// Icon file names expected in the icons folder
const ICON_FILES = {
  exe: 'exe-icon',      // For Windows EXE (will use tauri icon command)
  apk: 'apk-icon',      // For Android APK
  header: 'installer-header',   // For NSIS installer header (150x57)
  sidebar: 'installer-sidebar'  // For NSIS installer sidebar (164x314)
};

// Supported image extensions
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'ico'];

function findIcon(baseName) {
  for (const ext of IMAGE_EXTENSIONS) {
    const filePath = path.join(iconsDir, `${baseName}.${ext}`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

async function generateIcons() {
  console.log('Generating icons for Tauri...\n');
  console.log('Looking for icons in:', iconsDir);
  console.log('Output directory:', tauriIconsDir);
  console.log('');

  let foundCount = 0;

  // 1. Process EXE icon
  const exeIcon = findIcon(ICON_FILES.exe);
  if (exeIcon) {
    console.log(`✓ Found EXE icon: ${exeIcon}`);
    try {
      // Use Tauri CLI to generate all required icon formats
      execSync(`npx @tauri-apps/cli icon "${exeIcon}"`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });
      console.log('  → EXE icons generated successfully\n');
      foundCount++;
    } catch (error) {
      console.error('  ✗ Failed to generate EXE icons:', error.message);
    }
  } else {
    console.log(`⚠ EXE icon not found (expected: ${ICON_FILES.exe}.png)`);
  }

  // 2. Process APK icon (just copy to a known location for now)
  const apkIcon = findIcon(ICON_FILES.apk);
  if (apkIcon) {
    console.log(`✓ Found APK icon: ${apkIcon}`);
    // APK icons are handled by the build tool when building for Android
    foundCount++;
    console.log('  → APK icon will be processed during Android build\n');
  } else {
    console.log(`⚠ APK icon not found (expected: ${ICON_FILES.apk}.png)`);
  }

  // 3. Process installer header (150x57 BMP)
  const headerIcon = findIcon(ICON_FILES.header);
  if (headerIcon) {
    console.log(`✓ Found installer header: ${headerIcon}`);
    try {
      const destPath = path.join(tauriIconsDir, 'installer-header.bmp');
      // Sharp doesn't support BMP output, so we'll create a raw bitmap manually
      const resized = await sharp(headerIcon)
        .resize(150, 57, { fit: 'cover', position: 'center' })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Create BMP file manually
      const bmpBuffer = createBMP(resized.data, resized.info.width, resized.info.height);
      fs.writeFileSync(destPath, bmpBuffer);
      console.log(`  → Converted to: ${destPath}\n`);
      foundCount++;
    } catch (error) {
      console.error('  ✗ Failed to convert header:', error.message);
    }
  } else {
    console.log(`⚠ Installer header not found (expected: ${ICON_FILES.header}.png, 150x57)`);
  }

  // 4. Process installer sidebar (164x314 BMP)
  const sidebarIcon = findIcon(ICON_FILES.sidebar);
  if (sidebarIcon) {
    console.log(`✓ Found installer sidebar: ${sidebarIcon}`);
    try {
      const destPath = path.join(tauriIconsDir, 'installer-sidebar.bmp');
      // Sharp doesn't support BMP output, so we'll create a raw bitmap manually
      const resized = await sharp(sidebarIcon)
        .resize(164, 314, { fit: 'cover', position: 'center' })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Create BMP file manually
      const bmpBuffer = createBMP(resized.data, resized.info.width, resized.info.height);
      fs.writeFileSync(destPath, bmpBuffer);
      console.log(`  → Converted to: ${destPath}\n`);
      foundCount++;
    } catch (error) {
      console.error('  ✗ Failed to convert sidebar:', error.message);
    }
  } else {
    console.log(`⚠ Installer sidebar not found (expected: ${ICON_FILES.sidebar}.png, 164x314)`);
  }

  console.log('');
  console.log(`Icons processed: ${foundCount}/4`);

  if (foundCount === 0) {
    console.log('\nExpected icon files in the icons folder:');
    console.log('  - exe-icon.png     (for Windows EXE, recommended 1024x1024)');
    console.log('  - apk-icon.png     (for Android APK, recommended 512x512)');
    console.log('  - installer-header.png  (for NSIS installer, will be resized to 150x57)');
    console.log('  - installer-sidebar.png (for NSIS installer, will be resized to 164x314)');
  }
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
