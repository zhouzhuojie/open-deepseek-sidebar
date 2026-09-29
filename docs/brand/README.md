# Open DeepSeek Sidebar — brand kit

Minimal mark for the Chromium extension. **Not affiliated with DeepSeek. Do not use the official whale.**

## Concept

- Vertical rounded bar = native side panel
- Geometric fluke = a nod to DeepSeek without copying the official mascot
- Color `#4D6BFE` = adjacent to DeepSeek blue, not a trademarked drawing

## What ships in the extension

Only `assets/icons/` enters the store package (see `scripts/package.mjs`):

| File | Used by |
| --- | --- |
| `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` | `manifest.json` icons and the toolbar action |
| `mark.svg` | Brand mark in `src/sidepanel.html` and `src/options.html` |

The PNGs here are byte-identical copies of the runtime icons; edit both if the mark changes.

## Everything in this folder

- `svg/icon.svg` — app icon, white mark on the blue tile
- `svg/icon-mark.svg` — mark only, on transparent (the in-app `mark.svg`)
- `svg/icon-dark.svg` — dark tile variant
- `svg/logo-lockup.svg` — wordmark lockup used by the README
- `png/` — raster exports, including 256 / 512 for the Chrome Web Store listing and the `icon-dark-512` / `icon-mark-512` variants
- `png/logo-lockup.png` — raster lockup, for the store listing and social previews

## Rebuilding the runtime icons

Raster exports are generated from `svg/icon.svg`. When the mark changes, update `svg/` first, then re-export and copy the four sizes into `assets/icons/`.
