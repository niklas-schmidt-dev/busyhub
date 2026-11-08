# BusyHub brand assets

The logo was created with the built-in **Image Gen** tool on 8 November 2026.
The coral B and charcoal tile are the same artwork in every export. Transparency
outside the tile is preserved; ImageMagick only resizes/encodes the images.

| File | Use |
| --- | --- |
| `busyhub-logo.png` | 1024×1024 master, README, native window and macOS Dock |
| `busyhub-logo-128.png` | 128×128 export for the 40 px app header, including Retina displays |
| `favicon-32.png` | 32×32 PNG favicon |
| `favicon.ico` | 16, 32, 48 and 256 px favicon / Windows icon |
| `busyhub-icon.icns` | macOS icon, standard and Retina representations from 16 to 1024 px |

The renderer imports the header logo and references both favicons from
`index.html`, so Vite includes and resolves them in development and production.
The main process imports the master with Electron Vite's `?asset` suffix, so its
path also works in the bundled application. The README uses a repository-relative
image path.

## Generation prompt

```text
Use case: logo-brand
Asset type: production logo symbol for BusyHub, a desktop marketplace and controller for BUSY Bar LED display apps; the same symbol must work as a macOS app icon, a 16–32 px browser favicon, and a README logo.
Primary request: create one exceptionally clean, distinctive geometric B monogram made from a few bold modular horizontal bars, subtly suggesting a physical LED display and an app hub. Make the B silhouette immediately legible, with two large open dark counters, consistent bar thickness and balanced negative space. Use broad solid shapes rather than a grid of tiny dots.
Style/medium: refined flat vector-like brand design, crisp edges, precise proportions, confident and simple.
Color palette: warm coral red #FF5A4F for the symbol, very dark charcoal #141416 for its rounded-square backing tile, matching the app's neutral dark interface.
Composition: one square 1024x1024 image; one centered rounded-square app tile occupies about 88 percent of the canvas, with an optically centered coral monogram occupying most of the tile and generous even internal padding. Straight-on orthographic view. Transparent canvas outside the rounded-square tile, true alpha.
Text: no wordmark or extra letters; only the abstract B symbol.
Constraints: one final logo only, no contact sheet, no mockup, no presentation board, no labels, no shadows outside the tile, no fine strokes, no tiny pixel details, no 3D, no bevel, no glow, no gradients, no extra decorative elements. The mark must remain bold and recognizable at favicon sizes.
```

## Final refinement prompt

The first generated image was supplied as the edit target.

```text
Use case: logo-brand
Input image: edit target, the generated BusyHub app icon.
Make one precise correction to the logo: add a solid coral-red vertical spine along the LEFT edge of the three horizontal bars, joining the top, middle, and bottom bars into a clearly readable capital B. The spine must have the same thickness as the horizontal bars. It must enclose two large dark counters. The resulting symbol must read as B, never as 3. Preserve the existing coral color, charcoal rounded-square tile, proportions, centered placement, large-scale simplicity and transparent canvas. Make the surfaces flat, with clean crisp edges and no texture or gradients. Do not add text or any other elements. Deliver one square production logo with true alpha outside the tile.
```

