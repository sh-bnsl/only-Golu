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

- **States** — Idle, Greeting, Angry, Wishlist, Yellow Friday, Curious, Happy and Sunglasses (bar at the bottom, or keys 1–8). Greeting
  smiles for 1.5 s, then goes back to Idle (the intro's greeting lasts the same). Angry always
  starts with the visor up (if it's down, it flips open first, ~0.35 s), lasts 1.5 s, then the
  face calms back to Idle and, once it has settled (~0.6 s), the visor comes down.
  **Curious**: one eye narrows and the other opens big (no mouth); the head tilts, leans in a
  touch and slowly peeks to one side; Idle after ~2.2 s. **Happy**: big ^^ eyes and a grin with a
  bouncy hop and a wiggle (1.5 s), then Idle.
  **Sunglasses**: the helmet comes off (the usual off move), then big black Ray-Ban Wayfarers —
  a flat front just in front of the face (it doesn't wrap onto the ball), thick glossy black frames
  heaviest along the brow, black trapezoid lenses, a bridge and straight arms back past the head — drop
  onto Golu's eyes from above, land with a little bounce and a nod, and it grooves (a cool tilt and
  an easy nod) with a smirk, low on the face below the shades. After ~2 s (or as soon as another mood is picked) the shades lift off,
  the helmet goes back on (if the mode took it off) and Golu returns to Idle.
  **Wishlist** (for a wishlist heart tap; call `orbi.wishlist()` from your card's heart): the
  eyes morph into red hearts (two round lobes to a clean point) with a smile, it hops, and 3 hearts pop out from
  behind the bot, drift up and fade; after 1.6 s it goes back to Idle.
  **Yellow Friday** (`orbi.yellowFriday()`): one quick, eased 360° (0.5 s) during which the bot
  morphs into a plain yellow ball — the helmet sinks gradually into the ball, the face fades and
  the ball swells to 1.22×. Just before it's fully a ball, "YELLOW FRIDAY SALE" starts running
  round it, carried round by the end of the turn: the 3D Bot Home Page iteration 03 Lottie's own
  lettering (*Golu New Loop_6*, frames 217–402), unwrapped into `assets/yf-strip.png` (a seam-free
  2× strip), scrolling on the Lottie's own speed curve at 0.75× (a bit slower, easier to read). Once the text has gone, a second 360° (0.8 s)
  morphs it back into the bot — always with the visor down — then Idle (~4.6 s in all). No hop either way. Faces morph smoothly;
  Idle slowly glances left, right, up-left, up-right — the eyes lead each glance and ease back to centre as the
  head catches up. Faces ease across with a soft squint mid-change; blinks close quickly and open slower (now and
  then a double blink). Eyes are plain black (no white glint, no white rim under them).
- **Intro** — plays on load and again from the **Intro** chip at the start of the bar (or I):
  grows in place with a 360° turn, greets with a smile, settles into Idle, then
  lowers its visor.
- **Feel** — bouncy and energetic: a springy toy squish (stretches as it leaps, squashes on
  landing and jiggles back — helmet and shades too), snappy gravity with higher hops that land with a springy
  rebound, taps that add a playful twirl, lively wobbles, a bouncier float, quick springy glances (and the odd happy bop) in Idle,
  a little pop into every mood, bigger springier mood poses, and Yellow Friday turns that wind up
  and snap home with an overshoot.
- **Interaction** — drag sideways to rotate; on release it coasts with your momentum and
  springs back face-on. Swipe up / down to raise / lower the visor;
  swipe up 3 times in a row (each within 1.5 s) and it gets angry. Tap to bounce.
  ← / → give it a spin.
- **Visor** — hinged smoked-glass flip-up visor (swipe up/down on the bot, the bar button, or V). It swings
  around the hinge axis at the temples without clipping, and drops down after the intro.
- **Helmet off / on** — the button at the end of the bar (or H). Off (0.55 s): in one quick flow
  the helmet lifts off, rolls back over Golu's head and carries on away behind it, where the head
  hides it. On (~0.8 s): the same flow in reverse. Both ways Golu keeps its normal eyes — they just
  look up while the helmet moves, then come back to normal. The helmet stays its real size the whole time (it only looks smaller as it goes
  further away), never passes through the head (straight up its own axis is the one clean way off;
  turning about the head's centre keeps that clearance), and ends on the camera's line of sight
  behind the head, fully hidden. Golu holds still (no idle glances) while it moves.
  The Visor button hides while the helmet is off; Angry skips its visor flip; Yellow Friday and
  the intro keep the helmet off.
- **Colour** — one fixed yellow (no colour switch).
- **Helmet** (`helmet.js`) — shell, artwork, liner + stitching built from the Figma
  component's SVG paths; glass visor + hinges; procedural paint, leather and metal detail.
- **Shading** — lacquered candy finish (clear coat, inner glow and a brand-tinted edge glow), studio environment lighting, analytic helmet-on-ball occlusion;
  no drop or contact shadows under the bot.

## Files

- `index.html` — page + state bar
- `main.js` — scene, bot, face morphing, motion, intro
- `helmet.js` — the helmet
- `assets/yf-strip.png` — the Yellow Friday lettering, unwrapped from the Lottie
- `vendor/` — three.js r186
