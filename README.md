# Icons

An image link, drawn as a Nothing app icon. The tile follows the theme. The logo is one colour. Shade and a thin outline separate its parts. `glyph=0` keeps the original colours.

## Usage

```text
https://nothing-github-icons.vercel.app/icon?theme=classic&url=https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg
```

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://nothing-github-icons.vercel.app/icon?theme=classic-r&url=IMAGE">
  <source media="(prefers-color-scheme: light)" srcset="https://nothing-github-icons.vercel.app/icon?theme=white-r&url=IMAGE">
  <img alt="Python" src="https://nothing-github-icons.vercel.app/icon?theme=white-r&url=IMAGE" width="40" height="40">
</picture>
```

`url` is the image. An unknown theme or a rejected link still returns an image, so the slot in a README stays intact.

## Themes

| Theme | Tile | Glyph |
| --- | --- | --- |
| `classic`, `classic-r` | Pure Black `#000000` | white |
| `white`, `white-r` | Pure White `#FFFFFF` | black |
| `light` | Warm Grey `#DCD7D2` | black |
| `red` | Pure Black `#000000` | N-Red `#C8102E` |
| `blue` | Pure White `#FFFFFF` | N-Blue `#002F6C` |
| `yellow` | Pure Black `#000000` | N-Yellow `#FFC700` |

The tile is a rounded square. The glyph is the theme colour, centred inside the tile. Separate parts of a logo become lighter or darker shades of that colour. A thin outline follows the outer shape and the changes between those parts. On classic-r and white-r a small enclosed dot, such as a Python eye, is N-Red.

## Parameters

| Parameter | Required | Default | Purpose |
| --- | --- | --- | --- |
| `url` | yes |  | Image link. |
| `theme` | no | `classic` | One of the themes above. |
| `glyph` | no | on | `0` keeps the original logo colours. |
| `size` | no | `128` | Square side, a whole number from 32 to 512. |


## Run locally

```bash
npm install
node server.js
```

The server listens on port `8092`.

```text
http://127.0.0.1:8092/icon?theme=classic&url=https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg
```
