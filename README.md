# only Golu

A copy of `orbi-soft-body/` with only Bot 1 (Golu / Orbi): the noon assistant bot, built in 3D with three.js: a satin-yellow ball with
morphing facial expressions, wearing a 1:1 3D build of the Figma `Orbi Soft Helmet`.

## Run

No build step. Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000.

## What's in it

- **States** — Idle and Greeting (bar at the bottom, or keys 1–2). Faces morph smoothly;
  Idle slowly glances left, right, up-left, up-right. Eyes are plain black (no white glint).
- **Intro** — grows in place with a 360° turn, greets with a smile, settles into Idle, then
  lowers its visor.
- **Interaction** — drag sideways to rotate; on release it coasts with your momentum and
  springs back face-on. Swipe up / down to raise / lower the visor. Tap to bounce.
  ← / → give it a spin.
- **Visor** — hinged smoked-glass flip-up visor (swipe up/down on the bot, the bar button, or V). It swings
  around the hinge axis at the temples without clipping, and drops down after the intro.
- **Colour** — noon yellow only (no colour switch).
- **Helmet** (`helmet.js`) — shell, artwork, liner + stitching built from the Figma
  component's SVG paths; glass visor + hinges; procedural paint, leather and metal detail.
- **Shading** — lacquered candy finish (clear coat, inner glow and a brand-tinted edge glow), studio environment lighting, analytic helmet-on-ball occlusion, and the
  Figma drop / contact shadows.

## Files

- `index.html` — page + state bar
- `main.js` — scene, bot, face morphing, motion, intro, shadows
- `helmet.js` — the helmet
- `vendor/` — three.js r186
