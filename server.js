"use strict";

const http = require("http");
const { URL } = require("url");
const { icon, themeName, iconSize } = require("./node/icon");

const CARD = "icon";
const GITHUB = process.env.GITHUB_REDIRECT || "https://github.com/itsrealkaran/nothing-github-icons";
const PORT = Number(process.env.PORT || 8092);
const TTL = Number(process.env.CARD_CACHE_SECONDS || 3600);
const cache = new Map();

function errorSvg(message) {
  const text = String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img">' +
    '<rect width="128" height="128" rx="34" fill="#000000"/>' +
    '<text x="64" y="70" fill="#FFFFFF" font-family="ui-monospace, monospace" font-size="12" text-anchor="middle">' +
    text +
    "</text></svg>"
  );
}

function linkOk(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
  return value.length <= 2000;
}

async function fetchImage(target) {
  const response = await fetch(target, {
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
    headers: { "user-agent": "nothing-github-icons" },
  });
  if (!response.ok) throw new Error("image " + response.status);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 2000000) throw new Error("image is too large");
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 2000000) throw new Error("image is too large");
  if (body.length < 16) throw new Error("image is empty");
  return body;
}

function send(res, status, type, body, maxAge) {
  const buf = Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": String(buf.length),
    "Cache-Control": "public, max-age=" + maxAge,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(buf);
}

async function handle(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "text/plain; charset=utf-8", "Method not allowed", 0);
    return;
  }
  const url = new URL(req.url, "http://" + (req.headers.host || "127.0.0.1"));
  const name = url.pathname.replace(/^\/+|\/+$/g, "");
  if (name !== "" && name !== CARD) {
    send(res, 200, "image/svg+xml; charset=utf-8", errorSvg("unknown card"), 60);
    return;
  }
  const source = (url.searchParams.get("url") || url.searchParams.get("src") || "").trim();
  if (!source) {
    res.writeHead(302, { Location: GITHUB, "Cache-Control": "no-store" });
    res.end();
    return;
  }
  if (!linkOk(source)) {
    send(res, 200, "image/svg+xml; charset=utf-8", errorSvg("image link is required"), 60);
    return;
  }
  const theme = themeName(url.searchParams.get("theme") || "classic");
  if (!theme) {
    send(res, 200, "image/svg+xml; charset=utf-8", errorSvg("unknown theme"), 60);
    return;
  }
  const size = iconSize(url.searchParams.get("size") || "128");
  if (size < 32 || size > 512) {
    send(res, 200, "image/svg+xml; charset=utf-8", errorSvg("unknown size"), 60);
    return;
  }
  const glyph = (url.searchParams.get("glyph") || "1").trim().toLowerCase();
  const original = ["0", "no", "off", "false"].includes(glyph);
  const key = [theme, size, original ? "0" : "1", source].join("\0");
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    send(res, 200, "image/png", hit.body, TTL);
    return;
  }
  try {
    const body = await icon(await fetchImage(source), theme, size, original);
    cache.set(key, { expires: Date.now() + TTL * 1000, body });
    send(res, 200, "image/png", body, TTL);
  } catch (error) {
    const message = String(error && error.message ? error.message : "icon failed").split("\n")[0];
    send(res, 200, "image/svg+xml; charset=utf-8", errorSvg(message.slice(0, 22) || "icon failed"), 60);
  }
}

if (require.main === module) {
  http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 200, "image/svg+xml; charset=utf-8", errorSvg("icon failed"), 60);
    });
  }).listen(PORT, "0.0.0.0", () => {
    console.log(CARD + " listening on " + PORT);
  });
}

module.exports = handle;
