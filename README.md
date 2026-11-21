# Icons

An image link, drawn as a Nothing app icon. The tile follows the theme. The logo keeps its own colours. A thin line in the theme colour traces the shape and the colour changes inside it. `glyph=0` leaves that line off.

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

`url` is the image. `src` is the same parameter. An unknown theme or a rejected link still returns an image, so the slot in a README stays intact.

## Themes

| Theme | Tile | Outline |
| --- | --- | --- |
| `classic`, `classic-r`, `dark` | Pure Black `#000000` | white |
| `white`, `white-r` | Pure White `#FFFFFF` | black |
| `light` | Warm Grey `#DCD7D2` | black |
| `red` | Pure Black `#000000` | N-Red `#C8102E` |
| `blue` | Pure White `#FFFFFF` | N-Blue `#002F6C` |
| `yellow` | Pure Black `#000000` | N-Yellow `#FFC700` |

The tile is a rounded square. The logo keeps its colours and is centred inside the tile. A thin outline in the theme colour follows the outer shape and the real colour changes inside, so a mark stays recognisable on a black tile and on a white tile. On classic-r and white-r a small enclosed dot, such as a Python eye, is N-Red. `dark` is `classic`.

## Parameters

| Parameter | Required | Default | Purpose |
| --- | --- | --- | --- |
| `url` | yes |  | Image link. `src` is the same parameter. |
| `theme` | no | `classic` | One of the themes above. |
| `glyph` | no | on | `0`, `no`, `off`, or `false` leaves the outline off. |
| `size` | no | `128` | Square side, from 32 to 512. |

`glyph=0` leaves the outline off. The logo still sits on the theme tile in its own colours.

## Run locally

```bash
npm install
node server.js
```

The server listens on port `8092`.

```text
http://127.0.0.1:8092/icon?theme=classic&url=https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg
```
