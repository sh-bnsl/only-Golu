# only Golu

A copy of `orbi-soft-body/` with only Bot 1 (Golu / Orbi): the noon assistant bot, built in 3D with three.js: a satin-yellow ball with
morphing facial expressions, wearing a 1:1 3D build of the Figma `Orbi Soft Helmet`.

## Run

No build step. Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000. (The build in [Build](#build) is only for the single-file pages the noon app
loads; the demo never needs it.)

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

- **States** — Idle, Greeting, Angry, Wishlist, Yellow Friday, Curious, Happy, Sunglasses, Tap me and Super angry (bar at the bottom, or keys 1–9, 0). Greeting
  smiles for 1.5 s, then goes back to Idle (the intro's greeting lasts the same). Angry always
  starts with the visor up (if it's down, it flips open first, ~0.35 s), lasts 1.5 s, then the
  face calms back to Idle and, once it has settled (~0.6 s), the visor comes down.
  **Curious**: one eye narrows and the other opens big (no mouth); the head tilts, leans in a
  touch and slowly peeks to one side; Idle after ~2.2 s. **Happy**: big ^^ eyes and a grin with a
  bouncy hop and a wiggle (1.5 s), then Idle.
  **Sunglasses**: the helmet comes off (the usual off move), then big black Ray-Ban Wayfarers —
  a flat front just in front of the face (it doesn't wrap onto the ball), thick glossy black frames
  heaviest along the brow, black trapezoid lenses, a bridge and straight arms back past the head — come from
  behind Golu, over the top of its head and onto its eyes (like the helmet), land with a little bounce and a nod, and it grooves (a cool tilt and
  an easy nod) with a smirk, low on the face below the shades. After ~2 s (or as soon as another mood is picked) the shades go back over its head and hide behind it,
  and as they go the helmet comes back from behind onto its head (always); then Golu returns to Idle.
  **Super angry** (key 0): furious — brows, red flush, a hard shudder and a stomp, visor up — then it
  turns away (about 130°, not all the way) and sulks, still and quiet (no shaking), with the odd
  "hmph". It won't turn back on its own: swipe it sideways twice (or press ← / → twice). Dragging it
  meets tight resistance — a very stiff rubber band that barely gives (~25° for a long drag) and
  pulls back toward the sulk —
  but each proper swipe counts: the first gets a grudging glance back, the second turns it round to
  face you and it calms back to Idle. Left sulking, every few seconds it insists — still angry-faced: turns
  partway back and rocks side to side, as if showing you the swipe.
  **Wishlist** (for a wishlist heart tap; call `orbi.wishlist()` from your card's heart): the
  eyes morph into red hearts (two round lobes to a clean point) with a smile, it hops, and 3 hearts pop out from
  behind the bot, drift up and fade; after 1.6 s it goes back to Idle.
  **Yellow Friday** (`orbi.yellowFriday()`): the helmet comes off (the usual helmet-off move: up,
  over and away behind the head), Golu's face clears and the bare yellow head becomes the ball, with a
  little bop as "YELLOW FRIDAY SALE" starts running round it: the 3D Bot Home Page iteration 03 Lottie's own
  lettering (*Golu New Loop_6*, frames 217–402), unwrapped into `assets/yf-strip.png` (a seam-free
  2× strip), scrolling on the Lottie's own speed curve at 0.75× (a bit slower, easier to read). Once the last
  letter has gone, the face comes back and the helmet goes on again — always with the visor down — then
  Idle (~4.8 s in all). Picking another mood mid-sale still brings the helmet back. Faces morph smoothly;
  Idle slowly glances left, right, up-left, up-right — the eyes lead each glance and ease back to centre as the
  head catches up. Faces ease across with a soft squint mid-change; blinks close quickly and open slower (now and
  then a double blink). Eyes are plain black (no white glint, no white rim under them).
- **Intro** — plays on load and again from the **Intro** chip at the start of the bar (or I):
  grows in place with a 360° turn, greets with a smile, settles into Idle, then
  lowers its visor.
- **Feel** — bouncy and energetic: a springy toy squish (stretches as it leaps, squashes on
  landing and jiggles back — helmet and shades too), snappy gravity with higher hops that land with a springy
  rebound, taps that add a playful twirl, lively wobbles, a bouncier float, quick springy glances (and the odd happy bop) in Idle,
  a little pop into every mood, bigger springier mood poses.
- **"Tap me!"** — if nobody interacts for ~6 s while Golu is idle, it asks to be tapped, with no
  text — just action: no extra elements, just body and face (no mouth). It leans in with big eager eyes, then acts out
  being "poked" twice like a button: each poke squashes it back and scrunches its eyes into a giggly
  ^^ with a wiggle, then the big eager eyes pop open again, asking for more. Then an eager hop and
  a wiggle, like "now you try!" (~2.6 s). No stray blinks while it asks.
  It asks again every ~8 s until someone clicks, taps or presses a key, which stops it at once.
  The **Tap me** chip (key 9) plays the same ask on demand, then Idle.
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
  The Visor button hides while the helmet is off; Angry skips its visor flip; Yellow Friday takes
  the helmet off and puts it back itself (the button waits); the intro keeps the helmet off.
- **Colour** — one fixed yellow (no colour switch).
- **Helmet** (`helmet.js`) — shell, artwork, liner + stitching built from the Figma
  component's SVG paths; glass visor + hinges; procedural paint, leather and metal detail.
- **Shading** — lacquered candy finish (clear coat, inner glow and a brand-tinted edge glow), studio environment lighting, analytic helmet-on-ball occlusion;
  no drop or contact shadows under the bot.

## Frames (save and resume)

`window.orbi.getFrame()` returns the whole animation at that instant as plain JSON (~3–5 KB):
the clock, motion springs, intro, idle gaze and eye look, face morph and override, blink,
pending one-shots (a mood's hold before Idle, the angry cool-off, the intro's hand-off), the
visor hinge, the helmet off / on move, sunglasses, Yellow Friday, the "tap me" nudge, super
angry's sulk and wishlist hearts in flight. `window.orbi.setFrame(frame)` puts a freshly loaded
page at exactly that instant, so it carries on from there; it returns `false` and changes nothing
for a frame it can't use (another `v`, unknown state). A page resumed from a frame draws the same
pixels as the page it was saved from.

When adding animation state, keep frames complete:

- Timed one-shots are named entries in `SCRIPTS` (`schedule(at, 'name', arg)`), not closures, so
  they can be saved. A new one needs an entry there.
- New per-instant state (a phase, a timer, a spring) goes into `getFrame` / `setFrame`; bump
  `FRAME_VERSION` when the shape changes, so an old frame falls back to the pose instead of
  restoring half a state.

The noon widget sends the frame of the tap with `openLandingPage` and resumes the landing page's
live copy from it (`window.noonWidgetConfig.frame`, see the noon app bridge below).

## Files

- `index.html` — page + state bar
- `main.js` — scene, bot, face morphing, motion, intro
- `helmet.js` — the helmet
- `assets/yf-strip.png` — the Yellow Friday lettering, unwrapped from the Lottie
- `vendor/` — three.js r186
- `bridge/noon-bridge.js` — noon app bridge (only in the widget build, see below)
- `scripts/build.mjs` — single-file build (`npm run build:html`)

## Embedding (host API)

Golu can be embedded in another page or app. The noon app uses it as its **spotlight touchpoint**: a small
floating Golu (117 × 102 pt by default, transparent background) on the home page, inside a WebView. Tapping it
opens a landing page where a second, live copy of Golu flies in and stays interactive.

**Embed mode.** Set `window.goluConfig = { embed: true }` before `main.js` runs: page and canvas become
transparent (`scene.background = null`) and the state bar is hidden (`html.embed`). Everything else — moods,
gestures, intro — works as in the demo.

**Host API.** Hosts should use only these on `window.orbi`; the rest of `window.orbi` (`intro`, `motion`, `hel`,
`helmet`, `setState`, …) is internal, used by the demo and checks, and may change at any time:

| | |
|---|---|
| `on('tap' \| 'ready', fn)` | `tap`: a tap on the bot — a press shorter than 300 ms that moved less than 6 px, never a drag or swipe; fires before Golu's own bounce. `ready`: the first frame is drawn (fires at once if it already was). Returns an unsubscribe function. |
| `getPose()` | `{ state, helmetOn, visorDown }` — `state` is one of the mood keys (`idle`, `greeting`, `angry`, `wishlist`, `yellowfriday`, `curious`, `happy`, `sunglass`, `tapme`, `superangry`); `visorDown` only matters while `helmetOn`. |
| `setPose(pose, { instant })` | Restores a pose from `getPose()` and ends the intro. One-off shows and asks (Yellow Friday, Tap me, Super angry) come back as Idle. `instant: true` settles helmet, visor and face right away instead of animating. |
| `skipIntro()` | Ends the intro now. |
| `getFrame()` / `setFrame(frame)` | The whole animation at this instant as plain JSON, and resuming a fresh page at exactly that instant (see "Frames" above). `setFrame` returns `false` and changes nothing for a frame it can't use (e.g. from another `FRAME_VERSION`). |
| `snapshot(type?)` | Renders and returns the current frame as a data URL (`image/png` by default). It poses the bot first, so it matches `getFrame()` taken right after. |
| `pause()` / `resume()` | Stops / restarts the render loop (no CPU / GPU use while paused); resume continues without a jump. |
| `ready` | `true` once the first frame is drawn. |

If you change any of these, keep the old behaviour working or bump the noon bridge with it (below).

### noon app bridge

`bridge/noon-bridge.js` connects the host API to the noon app's WebView message bridge (`streamGateApi`).
**It is the contract the noon app relies on** — if it breaks, taps stop opening the landing page or the landing
page Golu doesn't match. It is only included in `dist/only-golu.widget.html`.

Golu → app, via `window.ReactNativeWebView.postMessage(JSON.stringify(message))`:

```json
{ "namespace": "streamGateApi", "event": "contentReady", "payload": {} }
{ "namespace": "streamGateApi", "event": "openLandingPage", "payload": { "snapshot": "data:image/png;base64,…", "pose": { "state": "idle", "helmetOn": true, "visorDown": false }, "frame": { "v": 3, "simT": 3.61, "…": "…" } } }
```

- `contentReady` — sent once, after the first frame. The landing page shows the snapshot until this arrives,
  then swaps to the live Golu.
- `openLandingPage` — sent on every tap. `snapshot` is the frame the app flies into the landing page;
  `frame` (`getFrame()` at the tap, before Golu's own bounce) is what the landing page copy resumes from;
  `pose` is the fallback for a copy that can't use the frame.

App → Golu:

- `window.noonWidgetConfig = { skipIntro?: boolean, pose?: Pose, frame?: Frame }`, set before the page loads.
  Empty on the home page; on the landing page it's `{ skipIntro: true, pose, frame }` from the tap. With a
  usable `frame` the copy resumes from it (`setFrame(frame)`) and carries on from the tapped instant;
  otherwise it falls back to `skipIntro()` + `setPose(pose, { instant: true })`.
- `{ "namespace": "streamGateApi", "event": "visibilityChange", "result": { "visible": false } }`, posted to `window`
  (`message` event) whenever the app hides or shows the bot (landing page open, app in background, screen
  change). `false` pauses, `true` resumes; a pause before the first frame is ignored so `contentReady` always
  arrives.

Changing the contract: adding fields is safe; renaming or removing events or fields needs a matching app
release, so ship it under a new CDN version and agree on it with the app team first.

### Rules for the hosted page

- **No external requests.** The app loads the page as an HTML string, so relative URLs and network fetches don't
  work. Put files in `assets/` and reference them in the code as a string literal `'assets/…'`; the build inlines
  every such file that exists as a data URI.
- **Keep it light.** It runs in a WebView on low-end phones too: watch triangle count, texture sizes (some GPUs cap
  textures at 4096 px; bigger ones are scaled down) and per-frame work.
- **Transparent in embed mode.** Don't paint a page or canvas background when `html.embed` is set.

## Build

Needs Node 18+.

```bash
npm install
npm run build:html
```

writes two self-contained pages to `dist/` (three.js and the scripts bundled, tree-shaken and minified; CSS and
`assets/` files inlined; no external requests):

- `only-golu.html` — the demo page, as when served.
- `only-golu.widget.html` — embed mode + the noon bridge; **this is what the noon app loads.**

The script is called `build:html` (not `build`) so a static deploy such as Vercel doesn't run it.

### Try the widget build locally

Open `dist/only-golu.widget.html` in a browser (transparent page, no bar), then in the console:

```js
window.ReactNativeWebView = { postMessage: (m) => console.log(JSON.parse(m)) };
```

Tap Golu: an `openLandingPage` message with `snapshot` and `pose` is logged; drags and swipes log nothing. To
check the landing page copy, set `window.noonWidgetConfig = { skipIntro: true, pose: { state: 'sunglass', helmetOn: false } }`
in a `<script>` before the bundle and reload.

### Release to the noon app

1. `npm run build:html`.
2. Upload `dist/only-golu.widget.html` to a **new** versioned folder on the noon CDN,
   `…/s/app/com/noon/kinetics/golu/vN/only-golu.widget.html` — never overwrite a version (the CDN caches for an hour,
   and older app builds may still point at it).
3. Point the app at it: the spotlight widget's `touchpoint.url` in the CMS, or the app's default
   (`NOON_SPOTLIGHT_DEFAULT_HTML_URL` in bappzaar).
