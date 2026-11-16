# only Golu

A copy of `orbi-soft-body/` with only Bot 1 (Golu / Orbi): the noon assistant bot, built in 3D with three.js: a satin-yellow ball with
morphing facial expressions, wearing a 1:1 3D build of the Figma `Orbi Soft Helmet`.

## Run

No build step. Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Look and mesh

- **Colour** — a bright, saturated lemon yellow (#FFF000 body, lighter lower tint, yellow
  sheen, and a yellow self-glow so the shadow side doesn't go olive).
- **Mesh** — optimised to ~31k triangles (the original build was ~504k): ball 64 × 48, helmet
  shell 72 segments on every 5th profile point, lighter tubes, plate, visor and snaps.

## Optimisation numbers

Measured in the browser against the original Orbi (Bot 1 of `orbi-soft-body`):

| | Original | Optimised | Change |
|---|---|---|---|
| Triangles | 503,606 | 30,876 | −94% |
| Vertices | 260,425 | 18,293 | −93% |
| Geometry memory | 12.27 MB | 0.76 MB | −94% |
| Triangles drawn per frame | 524,438 | 35,368 | −93% |
| Meshes / draw calls | 31 / 29 | 28 / 26 | −3 (no shadow sprites) |
| Shadow textures (1024 × 1024) | 3 (~12 MB) | 0 | removed |

The model is built in code when the page opens, so file sizes barely change
(2.26 MB → 2.21 MB, almost all of it three.js in `vendor/`); the saving is in what the
browser builds and draws.

## What's in it

- **States** — Idle, Greeting and Angry (bar at the bottom, or keys 1–3). Faces morph smoothly;
  Idle slowly glances left, right, up-left, up-right. Eyes are plain black (no white glint).
- **Intro** — grows in place with a 360° turn, greets with a smile, settles into Idle, then
  lowers its visor.
- **Interaction** — drag sideways to rotate; on release it coasts with your momentum and
  springs back face-on. Swipe up / down to raise / lower the visor;
  swipe up 3 times in a row (each within 1.5 s) and it gets angry. Tap to bounce.
  ← / → give it a spin.
- **Visor** — hinged smoked-glass flip-up visor (swipe up/down on the bot, the bar button, or V). It swings
  around the hinge axis at the temples without clipping, and drops down after the intro.
- **Colour** — one fixed yellow (no colour switch).
- **Helmet** (`helmet.js`) — shell, artwork, liner + stitching built from the Figma
  component's SVG paths; glass visor + hinges; procedural paint, leather and metal detail.
- **Shading** — lacquered candy finish (clear coat, inner glow and a brand-tinted edge glow), studio environment lighting, analytic helmet-on-ball occlusion;
  no drop or contact shadows under the bot.

## Files

- `index.html` — page + state bar
- `main.js` — scene, bot, face morphing, motion, intro
- `helmet.js` — the helmet
- `vendor/` — three.js r186
