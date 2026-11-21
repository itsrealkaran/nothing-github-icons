"use strict";

const sharp = require("sharp");

const THEMES = {
  classic: { bg: "#000000", fg: "#FFFFFF" },
  "classic-r": { bg: "#000000", fg: "#FFFFFF" },
  white: { bg: "#FFFFFF", fg: "#000000" },
  "white-r": { bg: "#FFFFFF", fg: "#000000" },
  light: { bg: "#DCD7D2", fg: "#000000" },
  red: { bg: "#000000", fg: "#C8102E" },
  blue: { bg: "#FFFFFF", fg: "#002F6C" },
  yellow: { bg: "#000000", fg: "#FFC700" },
};

const ALIASES = { dark: "classic" };

function themeName(value) {
  const name = ALIASES[String(value || "classic").trim().toLowerCase()] || String(value || "classic").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(THEMES, name) ? name : "";
}

function rgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function iconSize(value) {
  const size = Number(value || 128);
  if (!Number.isFinite(size)) return 0;
  return Math.round(size);
}

function svgDensity(buffer, glyph) {
  const head = buffer.subarray(0, 800).toString("utf8");
  if (!head.includes("<svg")) return 288;
  const width = Number((/\bwidth="([\d.]+)/.exec(head) || [])[1]);
  const height = Number((/\bheight="([\d.]+)/.exec(head) || [])[1]);
  const declared = Math.max(width || 0, height || 0);
  if (!declared) return 288;
  const target = Math.max(glyph * 4, 256);
  return Math.min(288, Math.max(36, Math.round((72 * target) / declared)));
}

async function icon(buffer, theme, size, original) {
  const colors = THEMES[theme];
  const glyph = Math.round(size * 0.56);
  const rendered = await sharp(buffer, { density: svgDensity(buffer, glyph), limitInputPixels: 4e7, animated: false })
    .resize(glyph, glyph, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = original
    ? backdrop(rendered.data, rendered.info.width, rendered.info.height)
    : buildMask(rendered.data, rendered.info.width, rendered.info.height);
  const plate = await sharp(
    Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.27)}" fill="${colors.bg}"/>` +
        `</svg>`
    )
  )
    .png()
    .toBuffer();
  const accent = theme.endsWith("-r")
    ? accentHoles(mask, rendered.info.width, rendered.info.height)
    : null;
  const mark = original
    ? await keepColor(rendered.data, rendered.info.width, rendered.info.height, mask, accent)
    : await paint(rendered.data, rendered.info.width, rendered.info.height, mask, rgb(colors.fg), accent);
  const left = Math.round((size - rendered.info.width) / 2);
  const top = Math.round((size - rendered.info.height) / 2);
  return sharp(plate)
    .composite([{ input: mark, left, top }])
    .png()
    .toBuffer();
}

function backdrop(data, width, height) {
  const count = width * height;
  const alpha = new Uint8Array(count);
  let opaque = 0;
  for (let index = 0; index < count; index += 1) {
    alpha[index] = data[index * 4 + 3];
    if (alpha[index] > 24) opaque += 1;
  }
  const mask = new Uint8Array(count);
  const solid = opaque / count > 0.84;
  const corner = [data[0], data[1], data[2]];
  for (let index = 0; index < count; index += 1) {
    if (alpha[index] < 24) continue;
    if (!solid) {
      mask[index] = alpha[index];
      continue;
    }
    const offset = index * 4;
    const distance =
      Math.abs(data[offset] - corner[0]) +
      Math.abs(data[offset + 1] - corner[1]) +
      Math.abs(data[offset + 2] - corner[2]);
    if (distance > 72) mask[index] = 255;
  }
  return mask;
}

function buildMask(data, width, height) {
  const mask = backdrop(data, width, height);
  return keepMark(data, mask, width * height, width);
}

// A coloured tile with a smaller contrasting mark keeps the mark.
// A two-colour drawing, such as the Python snakes, keeps both colours.
function keepMark(data, mask, count, width) {
  const buckets = new Map();
  let ink = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    ink += 1;
    const key =
      (data[index * 4] >> 4) * 256 +
      (data[index * 4 + 1] >> 4) * 16 +
      (data[index * 4 + 2] >> 4);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  if (ink < 12) return mask;
  const ranked = [...buckets.entries()].sort((left, right) => right[1] - left[1]);
  const share = ranked[0][1] / ink;
  if (share < 0.72 || share > 0.96 || ranked.length < 2) return cutPlate(data, mask, count, width);
  const key = ranked[0][0];
  const plate = [(key >> 8) * 16, ((key >> 4) & 15) * 16, (key & 15) * 16];
  const next = new Uint8Array(count);
  let kept = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    const distance =
      Math.abs(data[offset] - plate[0]) +
      Math.abs(data[offset + 1] - plate[1]) +
      Math.abs(data[offset + 2] - plate[2]);
    if (distance > 96) {
      next[index] = 255;
      kept += 1;
    }
  }
  if (kept < ink * 0.05 || kept > ink * 0.4) return cutPlate(data, mask, count, width);
  return next;
}

// A filled badge keeps the light or dark mark drawn on it. The badge is the
// largest hue. A two-colour drawing stays whole, and scattered highlights
// stay with the drawing.
function cutPlate(data, mask, count, width) {
  const height = count / width;
  const bins = new Array(30).fill(0);
  let ink = 0;
  let plateLight = 0;
  let plateCount = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    ink += 1;
    const tone = toneOf(data, index * 4);
    if (tone.hue < 0) continue;
    bins[Math.round(tone.hue / 12) % 30] += 1;
    plateCount += 1;
  }
  if (ink < 12 || plateCount < ink * 0.45) return mask;
  let best = 0;
  for (let bin = 1; bin < bins.length; bin += 1) if (bins[bin] > bins[best]) best = bin;
  let clustered = 0;
  for (let offset = -2; offset <= 2; offset += 1) clustered += bins[(best + offset + 30) % 30];
  if (clustered < ink * 0.5 || clustered > ink * 0.9) return mask;
  const plateHue = best * 12;
  let plateSeen = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    const tone = toneOf(data, index * 4);
    if (tone.hue < 0 || hueGap(tone.hue, plateHue) > 28) continue;
    plateLight += tone.light;
    plateSeen += 1;
  }
  if (!plateSeen) return mask;
  plateLight /= plateSeen;
  const next = new Uint8Array(count);
  let kept = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    const tone = toneOf(data, index * 4);
    if (tone.hue >= 0 || Math.abs(tone.light - plateLight) <= 0.38) continue;
    next[index] = 255;
    kept += 1;
  }
  if (kept < ink * 0.06 || kept > ink * 0.42) return mask;
  let largest = 0;
  const seen = new Uint8Array(count);
  for (let start = 0; start < count; start += 1) {
    if (!next[start] || seen[start]) continue;
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop();
      size += 1;
      const x = index % width;
      const y = (index - x) / width;
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x + 1 < width) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y + 1 < height) neighbors.push(index + width);
      neighbors.forEach((nextIndex) => {
        if (!next[nextIndex] || seen[nextIndex]) return;
        seen[nextIndex] = 1;
        stack.push(nextIndex);
      });
    }
    if (size > largest) largest = size;
  }
  if (largest < kept * 0.18) return mask;
  return next;
}

// A small enclosed dot, such as a Python eye, is the red accent on -r.
// Larger counters, such as a letter hole or a gear cutout, stay empty.
function accentHoles(mask, width, height) {
  const count = width * height;
  let ink = 0;
  for (let index = 0; index < count; index += 1) if (mask[index]) ink += 1;
  const accent = new Uint8Array(count);
  if (ink < 12) return accent;
  const outside = new Uint8Array(count);
  const stack = [];
  const seed = (index) => {
    if (index < 0 || index >= count || mask[index] || outside[index]) return;
    outside[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const index = stack.pop();
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) seed(index - 1);
    if (x + 1 < width) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y + 1 < height) seed(index + width);
  }
  const seen = new Uint8Array(count);
  const cap = Math.max(6, ink * 0.02);
  for (let start = 0; start < count; start += 1) {
    if (mask[start] || outside[start] || seen[start]) continue;
    const component = [];
    const pending = [start];
    seen[start] = 1;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    while (pending.length) {
      const index = pending.pop();
      component.push(index);
      const x = index % width;
      const y = (index - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x + 1 < width) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - width);
      if (y + 1 < height) neighbors.push(index + width);
      neighbors.forEach((next) => {
        if (mask[next] || outside[next] || seen[next]) return;
        seen[next] = 1;
        pending.push(next);
      });
    }
    const spanX = maxX - minX + 1;
    const spanY = maxY - minY + 1;
    const aspect = Math.max(spanX, spanY) / Math.max(1, Math.min(spanX, spanY));
    const fill = component.length / (spanX * spanY);
    if (component.length < 4 || component.length > cap || aspect > 1.8 || fill < 0.55) continue;
    component.forEach((index) => {
      accent[index] = 255;
    });
  }
  return accent;
}

function toneOf(data, offset) {
  const red = data[offset] / 255;
  const green = data[offset + 1] / 255;
  const blue = data[offset + 2] / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta < 0.12) return { hue: -1, light };
  let hue = 0;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, light };
}

function hueGap(left, right) {
  const gap = Math.abs(left - right);
  return Math.min(gap, 360 - gap);
}

const ACCENT = { r: 200, g: 16, b: 46 };

function stampAccent(pixels, accent) {
  if (!accent) return;
  for (let index = 0; index < accent.length; index += 1) {
    if (!accent[index]) continue;
    const offset = index * 4;
    pixels[offset] = ACCENT.r;
    pixels[offset + 1] = ACCENT.g;
    pixels[offset + 2] = ACCENT.b;
    pixels[offset + 3] = 255;
  }
}

async function keepColor(data, width, height, mask, accent) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const alpha = mask[index];
    if (!alpha) continue;
    const offset = index * 4;
    pixels[offset] = data[offset];
    pixels[offset + 1] = data[offset + 1];
    pixels[offset + 2] = data[offset + 2];
    pixels[offset + 3] = alpha;
  }
  stampAccent(pixels, accent);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function paint(data, width, height, mask, color, accent) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const alpha = mask[index];
    if (!alpha) continue;
    const offset = index * 4;
    pixels[offset] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
    pixels[offset + 3] = alpha;
  }
  stampAccent(pixels, accent);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

module.exports = { icon, themeName, iconSize, THEMES };
