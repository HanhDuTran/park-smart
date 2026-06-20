const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const BACKGROUND = "#080c14";
const PRIMARY = "#00b4ff";

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Dark navy background, slightly rounded corners (matches the app's icon style)
  const radius = size * 0.22;
  ctx.fillStyle = BACKGROUND;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(size, 0, size, size, radius);
  ctx.arcTo(size, size, 0, size, radius);
  ctx.arcTo(0, size, 0, 0, radius);
  ctx.arcTo(0, 0, size, 0, radius);
  ctx.closePath();
  ctx.fill();

  // Electric-blue rounded square behind the "P", matching the in-app logo badge
  const badgeSize = size * 0.62;
  const badgeOffset = (size - badgeSize) / 2;
  const badgeRadius = badgeSize * 0.28;
  ctx.fillStyle = PRIMARY;
  ctx.beginPath();
  ctx.moveTo(badgeOffset + badgeRadius, badgeOffset);
  ctx.arcTo(badgeOffset + badgeSize, badgeOffset, badgeOffset + badgeSize, badgeOffset + badgeSize, badgeRadius);
  ctx.arcTo(badgeOffset + badgeSize, badgeOffset + badgeSize, badgeOffset, badgeOffset + badgeSize, badgeRadius);
  ctx.arcTo(badgeOffset, badgeOffset + badgeSize, badgeOffset, badgeOffset, badgeRadius);
  ctx.arcTo(badgeOffset, badgeOffset, badgeOffset + badgeSize, badgeOffset, badgeRadius);
  ctx.closePath();
  ctx.fill();

  // White "P" centered in the badge
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${size * 0.38}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", size / 2, size / 2 + size * 0.02);

  return canvas;
}

const outDir = path.join(__dirname, "public");
for (const size of [192, 512]) {
  const canvas = drawIcon(size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
}
