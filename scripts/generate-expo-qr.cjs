const fs = require("node:fs");
const path = require("node:path");
const QRCode = require("qrcode-terminal/vendor/QRCode");
const QRErrorCorrectLevel = require("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel");

const [url, outputPath] = process.argv.slice(2);

if (!url || !outputPath) {
  console.error("Usage: node generate-expo-qr.cjs <expo-url> <output.svg>");
  process.exit(1);
}

const qr = new QRCode(-1, QRErrorCorrectLevel.L);
qr.addData(url);
qr.make();

const cell = 10;
const margin = 4;
const labelHeight = 48;
const moduleCount = qr.getModuleCount();
const qrSize = (moduleCount + margin * 2) * cell;
const height = qrSize + labelHeight;
const rectangles = [];

for (let row = 0; row < moduleCount; row += 1) {
  for (let column = 0; column < moduleCount; column += 1) {
    if (qr.isDark(row, column)) {
      rectangles.push(`<rect x="${(column + margin) * cell}" y="${(row + margin) * cell}" width="${cell}" height="${cell}"/>`);
    }
  }
}

const escapedUrl = url.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${qrSize}" height="${height}" viewBox="0 0 ${qrSize} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g fill="#111827">${rectangles.join("")}</g>
  <text x="${qrSize / 2}" y="${qrSize + 30}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#111827">${escapedUrl}</text>
</svg>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, svg, "utf8");
console.log(outputPath);
