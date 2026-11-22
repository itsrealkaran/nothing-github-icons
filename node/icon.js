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

function themeName(value) {
  const name = String(value || "classic").trim() || "classic";
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
  const text = String(value ?? "128").trim();
  if (!/^\d+$/.test(text)) return 0;
  const size = Number(text);
  if (String(size) !== text) return 0;
  return size;
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

function solidMono(data, mask, width, count) {
  const tone = new Int8Array(count);
  let ink = 0;
  let dark = 0;
  let light = 0;
  let chroma = 0;
  for (let index = 0; index < count; index += 1) {
    if (mask[index] < 24) continue;
    ink += 1;
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    const level = (red + green + blue) / 3;
    if (spread > 28) {
      chroma += 1;
      continue;
    }
    if (level < 80) {
      dark += 1;
      tone[index] = 1;
    } else if (level > 175) {
      light += 1;
      tone[index] = 2;
    }
  }
  if (ink < 8 || chroma / ink > 0.05) return false;
  const minority = dark < light ? 1 : 2;
  const minorityCount = Math.min(dark, light);
  if (!minorityCount) return true;
  const height = count / width;
  let core = 0;
  for (let index = 0; index < count; index += 1) {
    if (tone[index] !== minority) continue;
    const x = index % width;
    const y = (index - x) / width;
    let same = 0;
    if (x > 0 && tone[index - 1] === minority) same += 1;
    if (x + 1 < width && tone[index + 1] === minority) same += 1;
    if (y > 0 && tone[index - width] === minority) same += 1;
    if (y + 1 < height && tone[index + width] === minority) same += 1;
    if (same >= 3) core += 1;
  }
  return core / minorityCount < 0.25;
}

function assignRegions(data, mask, count) {
  const buckets = new Map();
  let ink = 0;
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    ink += 1;
    const offset = index * 4;
    const key = (data[offset] >> 4) * 256 + (data[offset + 1] >> 4) * 16 + (data[offset + 2] >> 4);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { n: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, bucket);
    }
    bucket.n += 1;
    bucket.r += data[offset];
    bucket.g += data[offset + 1];
    bucket.b += data[offset + 2];
  }
  const ranked = [...buckets.values()].sort((left, right) => right.n - left.n);
  const kept = [];
  ranked.forEach((bucket) => {
    if (kept.length >= 4) return;
    if (kept.length && bucket.n < ink * 0.07) return;
    const color = { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n, n: bucket.n };
    const near = kept.find((item) => Math.abs(item.r - color.r) + Math.abs(item.g - color.g) + Math.abs(item.b - color.b) < 90);
    if (near) {
      near.n += color.n;
      return;
    }
    kept.push(color);
  });
  if (kept.length < 4 && ink) {
    let n = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let index = 0; index < count; index += 1) {
      if (!mask[index]) continue;
      const offset = index * 4;
      const apart = kept.every((item) => (
        Math.abs(data[offset] - item.r) +
        Math.abs(data[offset + 1] - item.g) +
        Math.abs(data[offset + 2] - item.b)
      ) > 180);
      if (!apart) continue;
      n += 1;
      r += data[offset];
      g += data[offset + 1];
      b += data[offset + 2];
    }
    if (n > ink * 0.03) kept.push({ r: r / n, g: g / n, b: b / n, n });
  }
  if (!kept.length && ranked[0]) {
    const bucket = ranked[0];
    kept.push({ r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n, n: bucket.n });
  }
  const ids = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    let best = 0;
    let bestDistance = Infinity;
    for (let region = 0; region < kept.length; region += 1) {
      const distance =
        Math.abs(data[offset] - kept[region].r) +
        Math.abs(data[offset + 1] - kept[region].g) +
        Math.abs(data[offset + 2] - kept[region].b);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = region;
      }
    }
    ids[index] = best + 1;
  }
  return { ids, kept };
}

function shadeStops(fg, kept) {
  const lightInk = (fg.r + fg.g + fg.b) / 3 > 140;
  const order = kept
    .map((color, index) => ({ index, light: (color.r + color.g + color.b) / 3 }))
    .sort((left, right) => (lightInk ? right.light - left.light : left.light - right.light));
  const shades = new Array(kept.length);
  order.forEach((item, rank) => {
    const mix = kept.length === 1 ? 0 : (rank / (kept.length - 1)) * (lightInk ? 0.58 : 0.5);
    const toward = lightInk ? 0 : 255;
    shades[item.index] = {
      r: Math.round(fg.r + (toward - fg.r) * mix),
      g: Math.round(fg.g + (toward - fg.g) * mix),
      b: Math.round(fg.b + (toward - fg.b) * mix),
    };
  });
  const outline = lightInk ? { r: 32, g: 32, b: 32 } : { r: 236, g: 236, b: 236 };
  const border = lightInk ? null : { r: 32, g: 32, b: 32 };
  return { shades, outline, border };
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

function neutralLight(color) {
  const spread = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
  return spread < 28 && (color.r + color.g + color.b) / 3 > 140;
}

function invertNeutral(pixels) {
  for (let index = 0; index < pixels.length; index += 4) {
    if (!pixels[index + 3]) continue;
    pixels[index] = 255 - pixels[index];
    pixels[index + 1] = 255 - pixels[index + 1];
    pixels[index + 2] = 255 - pixels[index + 2];
  }
}

async function paintFlat(width, height, mask, color, accent) {
  const ink = neutralLight(color) ? { r: 0, g: 0, b: 0 } : color;
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    pixels[offset] = ink.r;
    pixels[offset + 1] = ink.g;
    pixels[offset + 2] = ink.b;
    pixels[offset + 3] = mask[index];
  }
  if (ink !== color) invertNeutral(pixels);
  stampAccent(pixels, accent);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function paint(data, width, height, mask, color, accent) {
  const count = width * height;
  if (solidMono(data, mask, width, count)) return paintFlat(width, height, mask, color, accent);
  const ink = neutralLight(color) ? { r: 0, g: 0, b: 0 } : color;
  const { ids, kept } = assignRegions(data, mask, count);
  const { shades, outline, border } = shadeStops(ink, kept);
  const pixels = Buffer.alloc(count * 4);
  const edge = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const region = ids[index];
    if (!region) continue;
    const x = index % width;
    const y = (index - x) / width;
    const neighbors = [];
    if (x > 0) neighbors.push(index - 1);
    if (x + 1 < width) neighbors.push(index + 1);
    if (y > 0) neighbors.push(index - width);
    if (y + 1 < height) neighbors.push(index + width);
    if (neighbors.some((next) => ids[next] !== region)) edge[index] = 255;
    const shade = shades[region - 1];
    const offset = index * 4;
    pixels[offset] = shade.r;
    pixels[offset + 1] = shade.g;
    pixels[offset + 2] = shade.b;
    pixels[offset + 3] = mask[index];
  }
  const line = new Uint8Array(edge);
  const halo = border ? new Uint8Array(count) : null;
  for (let index = 0; index < count; index += 1) {
    if (!edge[index]) continue;
    const x = index % width;
    const y = (index - x) / width;
    const outside =
      x === 0 || x + 1 === width || y === 0 || y + 1 === height ||
      !ids[index - 1] || !ids[index + 1] || !ids[index - width] || !ids[index + width];
    if (!outside) continue;
    const stamp = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const next = ny * width + nx;
      line[next] = 255;
      if (halo && !ids[next]) halo[next] = 255;
    };
    stamp(x - 1, y);
    stamp(x + 1, y);
    stamp(x, y - 1);
    stamp(x, y + 1);
  }
  stampLines(pixels, line, outline);
  if (halo) stampLines(pixels, halo, border);
  if (ink !== color) invertNeutral(pixels);
  stampAccent(pixels, accent);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

module.exports = { icon, themeName, iconSize, THEMES };
