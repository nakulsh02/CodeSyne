import fs from 'fs';
import path from 'path';

// Let's create a script that generates a crisp Oneko 32x32 pixel-art sprite sheet PNG
// Each sprite is 32x32 pixels. Grid is 8 columns (256px) x 4 rows (128px).

function createPNG() {
  const width = 256;
  const height = 128;
  const canvas = new Uint8Array(width * height * 4); // RGBA

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    canvas[idx] = r;
    canvas[idx + 1] = g;
    canvas[idx + 2] = b;
    canvas[idx + 3] = a;
  }

  // Draw pixel helper relative to sprite box (sx, sy) where each frame is 32x32 at col (0..7), row (0..3)
  function drawPixel(col, row, px, py, color) {
    const startX = col * 32;
    const startY = row * 32;
    let r = 255, g = 255, b = 255, a = 255;
    if (color === 'B') { r = 0; g = 0; b = 0; } // Black outline
    else if (color === 'W') { r = 255; g = 255; b = 255; } // White fur
    else if (color === 'P') { r = 255; g = 182; b = 193; } // Pink ears/nose
    else if (color === 'E') { r = 20; g = 20; b = 20; } // Eyes
    else if (color === 'T') { a = 0; } // Transparent
    else return;

    setPixel(startX + px, startY + py, r, g, b, a);
  }

  // Helper to draw a sprite frame from a ascii pixel map array of strings
  function drawSprite(col, row, artMap) {
    for (let y = 0; y < artMap.length; y++) {
      const line = artMap[y];
      for (let x = 0; x < line.length; x++) {
        const char = line[x];
        if (char !== ' ') {
          drawPixel(col, row, x, y, char);
        }
      }
    }
  }

  // Frame definitions (32x32 pixel art ascii maps for cute Oneko pixel cat)
  // 'B' = Black outline, 'W' = White body, 'P' = Pink, 'E' = Eye, ' ' = Transparent

  // Base Cat facing Down (South) - Sitting / Idle
  const frameIdle = [
    "                                ",
    "                                ",
    "            B      B            ",
    "           BWB    BWB           ",
    "          BWPB   BWPB           ",
    "          BWWBBBBBWWB           ",
    "         BWWWWWWWWWWWB          ",
    "         BWWWWWWWWWWWB          ",
    "        BWWWWWWWWWWWWWB         ",
    "        BWEWWWWWWWEWWWB         ",
    "        BWEWWWWWWWEWWWB         ",
    "        BWWWWBWBWWWWWWB         ",
    "        BWWWWBPBWWWWWWB         ",
    "         BWWWWWWWWWWWB          ",
    "          BBWWWWWWWBB           ",
    "         BWWBBBBBBBWWBB         ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "         BBBB     BBBBB         ",
    "                                ",
    "                                "
  ];

  // Base Cat facing Down - Alert / Eyes Wide
  const frameAlert = [
    "            B      B            ",
    "           BWB    BWB           ",
    "          BWPB   BWPB           ",
    "          BWWBBBBBWWB           ",
    "         BWWWWWWWWWWWB          ",
    "         BWWWWWWWWWWWB          ",
    "        BWWWWWWWWWWWWWB         ",
    "        BWEWWWWWWWEWWWB         ",
    "        BWEWWWWWWWEWWWB         ",
    "        BWEWWWWWWWEWWWB         ",
    "        BWWWWBWBWWWWWWB         ",
    "        BWWWWBPBWWWWWWB         ",
    "         BWWWWWWWWWWWB          ",
    "          BBWWWWWWWBB           ",
    "         BWWBBBBBBBWWBB         ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "        BWWWB     BWWWWB        ",
    "         BBBB     BBBBB         "
  ];

  // Draw frames across sprite sheet grid
  // Col 0, Row 0: Idle
  drawSprite(0, 0, frameIdle);
  // Col 1, Row 0: Alert
  drawSprite(1, 0, frameAlert);

  return { width, height, canvas };
}

console.log("Sprite helper script initialized.");
