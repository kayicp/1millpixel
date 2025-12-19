// color.js
// 256 colors total:
// - 8 shades of black
// - 8 shades of white
// - 30 rainbow hues * 8 shades each = 240
// 8 + 8 + 240 = 256

const toHex2 = (n) => n.toString(16).padStart(2, "0");

const rgbToHex = (r, g, b) =>
  `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();

// HSL (0-360, 0-100, 0-100) -> HEX
function hslToHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;

  let r1 = 0,
    g1 = 0,
    b1 = 0;

  if (hh < 60) [r1, g1, b1] = [c, x, 0];
  else if (hh < 120) [r1, g1, b1] = [x, c, 0];
  else if (hh < 180) [r1, g1, b1] = [0, c, x];
  else if (hh < 240) [r1, g1, b1] = [0, x, c];
  else if (hh < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  return rgbToHex(r, g, b);
}

const blackSteps = [0, 17, 34, 51, 68, 85, 102, 119];
const whiteSteps = [255, 238, 221, 204, 187, 170, 153, 136];

const rainbowNames = [
  "red",
  "red-orange",
  "orange",
  "amber",
  "yellow-orange",
  "yellow",
  "lime",
  "yellow-green",
  "chartreuse",
  "green",
  "jade",
  "spring-green",
  "aquamarine",
  "turquoise",
  "teal",
  "cyan",
  "sky-blue",
  "azure",
  "blue",
  "sapphire",
  "indigo",
  "violet",
  "purple",
  "magenta",
  "fuchsia",
  "hot-pink",
  "rose",
  "raspberry",
  "crimson",
  "scarlet",
];

// 8 shades per rainbow hue (dark -> light)
const shadeLightness = [15, 25, 35, 45, 55, 65, 75, 85];
const shadeSaturation = 90;

function buildColors() {
  const colors = [];

  // 8 shades of black
  blackSteps.forEach((v, i) => {
    colors.push({
      name: `black-${i + 1}`,
      hex: rgbToHex(v, v, v),
    });
  });

  // 8 shades of white
  whiteSteps.forEach((v, i) => {
    colors.push({
      name: `white-${i + 1}`,
      hex: rgbToHex(v, v, v),
    });
  });

  // 30 rainbow hues, evenly spaced every 12 degrees (0..348), 8 shades each
  for (let i = 0; i < 30; i++) {
    const hue = i * 12;
    const baseName = rainbowNames[i] ?? `rainbow-${i + 1}`;

    for (let j = 0; j < 8; j++) {
      const l = shadeLightness[j];
      colors.push({
        name: `${baseName}-${j + 1}`, // e.g. "blue-3"
        hex: hslToHex(hue, shadeSaturation, l),
      });
    }
  }

  // Safety check: should be exactly 256
  if (colors.length !== 256) {
    throw new Error(`Expected 256 colors, got ${colors.length}`);
  }

  return colors;
}

export const colors = buildColors();