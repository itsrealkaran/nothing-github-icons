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
  const mask = backdrop(rendered.data, rendered.info.width, rendered.info.height);
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
  const lines = original
    ? null
    : markEdges(rendered.data, mask, rendered.info.width, rendered.info.height);
  const mark = original
    ? await keepColor(rendered.data, rendered.info.width, rendered.info.height, mask, accent)
    : await paint(
        rendered.data,
        rendered.info.width,
        rendered.info.height,
        mask,
        rgb(colors.fg),
        accent,
        lines
      );
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
  const corner = [data[0], data[1], data[2]];
  const chroma = Math.max(...corner) - Math.min(...corner);
  const light = (corner[0] + corner[1] + corner[2]) / 3;
  const canvas = opaque / count > 0.84 && chroma < 28 && (light < 30 || light > 225);
  for (let index = 0; index < count; index += 1) {
    if (alpha[index] < 24) continue;
    if (!canvas) {
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

const ACCENT = { r: 200, g: 16, b: 46 };

function colorDistance(data, left, right) {
  const a = left * 4;
  const b = right * 4;
  return (
    Math.abs(data[a] - data[b]) +
    Math.abs(data[a + 1] - data[b + 1]) +
    Math.abs(data[a + 2] - data[b + 2])
  );
}

// Every logo keeps its own colours. A thin theme-coloured line traces the
// silhouette and the real colour changes inside it, so the parts stay distinct.
function markEdges(data, mask, width, height) {
  const count = width * height;
  const outer = new Uint8Array(count);
  const inner = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = (index - x) / width;
    const neighbors = [];
    if (x > 0) neighbors.push(index - 1);
    if (x + 1 < width) neighbors.push(index + 1);
    if (y > 0) neighbors.push(index - width);
    if (y + 1 < height) neighbors.push(index + width);
    neighbors.forEach((next) => {
      if (!mask[next]) outer[index] = 255;
      else if (colorDistance(data, index, next) > 160) inner[index] = 255;
    });
  }
  const edge = dilate(outer, width, height);
  for (let index = 0; index < count; index += 1) if (inner[index]) edge[index] = 255;
  return edge;
}

function dilate(source, width, height) {
  const count = width * height;
  const next = new Uint8Array(source);
  for (let index = 0; index < count; index += 1) {
    if (!source[index]) continue;
    const x = index % width;
    const y = (index - x) / width;
    const stamp = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      next[ny * width + nx] = 255;
    };
    stamp(x - 1, y);
    stamp(x + 1, y);
    stamp(x, y - 1);
    stamp(x, y + 1);
  }
  return next;
}

function stampLines(pixels, lines, color) {
  if (!lines) return;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]) continue;
    const offset = index * 4;
    pixels[offset] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
    pixels[offset + 3] = 255;
  }
}

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

async function paint(data, width, height, mask, color, accent, lines) {
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
  stampLines(pixels, lines, color);
  stampAccent(pixels, accent);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

module.exports = { icon, themeName, iconSize, THEMES };
