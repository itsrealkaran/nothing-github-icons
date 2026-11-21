# Icons

An image link, drawn as a Nothing app icon. Dark is a white glyph on black. Light is a black glyph on white.

## Usage

```text
https://nothing-github-icons.vercel.app/icon?theme=dark&url=https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg
```

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://nothing-github-icons.vercel.app/icon?theme=dark&url=IMAGE">
  <source media="(prefers-color-scheme: light)" srcset="https://nothing-github-icons.vercel.app/icon?theme=light&url=IMAGE">
  <img alt="Python" src="https://nothing-github-icons.vercel.app/icon?theme=light&url=IMAGE" width="40" height="40">
</picture>
```

`url` is the image. `src` is the same parameter. An unknown theme or a rejected link still returns an image, so the slot in a README stays intact.

## Themes

| Theme | Tile | Glyph |
| --- | --- | --- |
| `dark`, `classic`, `classic-r` | Pure Black `#000000` | white |
| `light`, `white`, `white-r` | Pure White `#FFFFFF` | black |

The tile is a rounded square. The source is reduced to one colour and centred inside it.

## Parameters

| Parameter | Required | Default | Purpose |
| --- | --- | --- | --- |
| `url` | yes |  | Image link. `src` is the same parameter. |
| `theme` | no | `dark` | `dark` or `light`. |
| `size` | no | `128` | Square side, from 32 to 512. |

## Run locally

```bash
npm install
node server.js
```

The server listens on port `8092`.

```text
http://127.0.0.1:8092/icon?theme=dark&url=https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg
```
