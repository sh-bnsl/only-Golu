// Orbi — 3D build of the Figma "Bot 3D 01" set (1032:19174).
//
// The body is a rigid ball: it never squashes or deforms. All motion is
// whole-body — a light hover spring, airy hops with a couple of rebounds and
// a nod/rock wobble kicked by each landing. The bot ignores the cursor; press
// and drag sideways to rotate it freely (it follows the pointer 1:1 and glides
// on with momentum when released, then springs back to face the camera);
// swipe up / down to raise / lower the visor.
//
// The face is not geometry: each state is drawn into a canvas in Figma
// coordinates and sampled in the shader by the vertex's rest direction.

import * as THREE from 'three';
import { createHelmet, SURFACE_GLSL } from './helmet.js';

// ─── constants ────────────────────────────────────────────────────────────
const R = 1;                    // body radius (Figma body = 240px → 120px = 1 unit)
const HOVER_Y = 0;              // resting centre height while floating
const FLOOR_Y = -1.18;          // Figma: body bottom 270, contact shadow 288 → 0.15R gap
const GRAVITY = 17;              // low: a light, floaty toy ball
const DRAG_YAW = 0.0105;        // rad per px of horizontal drag (~360° over 600px)
const DRAG_PITCH = 0.006;       // rad per px of vertical drag (tilt while swiping the visor)
const MAX_TILT = 0.5;
const BASE_PITCH = -0.2;        // tip the face up toward the camera

const STATES = [
  { key: 'idle',     label: 'Idle' },
  { key: 'greeting', label: 'Greeting' },
  { key: 'angry',    label: 'Angry' },
  { key: 'wishlist', label: 'Wishlist' },
  { key: 'yellowfriday', label: 'Yellow Friday' },
  { key: 'curious',  label: 'Curious' },
  { key: 'happy',    label: 'Happy' },
  { key: 'wow',      label: 'Wow', hidden: true },   // Happy's first beat (lights the Happy chip)
];
const BAR_STATES = STATES.filter(s => !s.hidden);

// ─── renderer / scene ─────────────────────────────────────────────────────
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);
// No shadow maps: at the softness wanted they turned blocky/kinked on the
// curved face. Helmet-on-ball shading is an analytic occlusion term in the
// ball's shader instead (see HELMET_AO_GLSL).

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);   // matches the page
const pmrem = new THREE.PMREMGenerator(renderer);

// Studio environment: a dim warm gradient dome plus one large softbox up-left
// and two weak fills. Replaces RoomEnvironment, whose many small panel lights
// read as scattered hot spots on the ball.
function studioEnvironment() {
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(20, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 floorC = vec3(0.045, 0.042, 0.035);
          vec3 sky = vec3(0.30, 0.29, 0.27);
          gl_FragColor = vec4(mix(floorC, sky, smoothstep(-0.25, 0.85, h)), 1.0);
        }`,
    }),
  );
  env.add(dome);
  const panel = (w, h, intensity, pos) => {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.93).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    p.position.set(...pos);
    p.lookAt(0, 0, 0);
    env.add(p);
  };
  panel(15, 12, 1.9, [-7, 8, 9]);  // key softbox — large, so highlights stay broad and soft
  panel(7, 10, 0.6, [10, 1, 5]);   // right fill
  panel(8, 2.5, 0.7, [3, 5, -10]); // back rim strip
  return env;
}
scene.environment = pmrem.fromScene(studioEnvironment(), 0.06).texture;
scene.environmentIntensity = 1.2;

// long lens: close to the flat Figma front view, so near parts (forehead,
// wordmark) aren't magnified by perspective
const FOV = 13.5;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
const CAM_TARGET = new THREE.Vector3(0, -0.22, 0);
camera.position.set(0, 3.1, 15.2);
camera.lookAt(CAM_TARGET);

const key = new THREE.DirectionalLight(0xfff8e6, 2.0);
key.position.set(-3.6, 5, 4);
scene.add(key);
const bounce = new THREE.HemisphereLight(0xfffcf0, 0x6a6040, 0.85);   // brighter, warmer fill: lifts the shadow side
scene.add(bounce);
const rim = new THREE.DirectionalLight(0xfff4c0, 0.25);
rim.position.set(3.5, 2.5, -3);   // upper back: rims the silhouette without glaring on the flap tips
scene.add(rim);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the bot a comfortable size on narrow screens
  camera.fov = w / h < 0.8 ? FOV / Math.max(w / h, 0.45) * 0.8 : FOV;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ─── body geometry ────────────────────────────────────────────────────────
const geometry = new THREE.SphereGeometry(R, 64, 48);   // optimised mesh (was 256 × 192); the face is drawn in the shader, so it stays crisp
// rest direction = object-space unit normal; the face shader samples by it
geometry.setAttribute('aRest', geometry.attributes.normal.clone());

// ─── face texture ─────────────────────────────────────────────────────────
// Canvas covers ±90 Figma px around the body centre (body radius = 120 px).
const FACE_EXTENT = 0.75;
const FACE_PX = 2048;
const S = FACE_PX / 180;
const faceCanvas = document.createElement('canvas');
faceCanvas.width = faceCanvas.height = FACE_PX;
const fctx = faceCanvas.getContext('2d');
const faceTex = new THREE.CanvasTexture(faceCanvas);
faceTex.colorSpace = THREE.SRGBColorSpace;
faceTex.anisotropy = 8;
faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;

const X = x => FACE_PX / 2 + x * S;
const Y = y => FACE_PX / 2 + y * S;

// ── Morphable face ────────────────────────────────────────────────────────
// Every eye of every state is two brush strokes (N points each) with one
// width: a pill is a short vertical stroke 28 wide, a dash a short
// horizontal one, ^ and ◡ thin arcs, X two crossing strokes (single-stroke
// eyes just repeat the stroke). Because all faces share that shape, a state
// change interpolates points + widths + the glint / lip / cheek weights, so
// pills flow into ^^, a dash splits into an X, etc. The right eye is the
// mirror of the left (same point order), so morphs stay symmetric.
const FACE_DY = 20;   // whole face sits 20 Figma px lower than the Bot 3D 01 layout (clears the helmet liner)
const NP = 28;
const linePts = (x0, y0, x1, y1) => Array.from({ length: NP }, (_, i) => {
  const t = i / (NP - 1); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
});
const arcPts = (cx, cy, r, a0, a1) => Array.from({ length: NP }, (_, i) => {
  const a = a0 + (a1 - a0) * (i / (NP - 1)); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
// one half of a heart eye (dir −1 = left, +1 = right), NP points evenly spaced
// along its outline from the top dip to the bottom tip
function heartHalf(dir, cx = -32, cy = -8.5) {
  const r = 8, ox = 7.2, oy = -4, tip = 13;            // lobe radius, lobe centre offset, tip height
  const C = [-ox, oy], T = [0, tip];
  const d = Math.hypot(T[0] - C[0], T[1] - C[1]);
  const aT = Math.atan2(T[1] - C[1], T[0] - C[0]) + Math.acos(r / d);   // outer tangent point
  const a0 = Math.atan2(-Math.sqrt(r * r - ox * ox), ox);               // the top dip, where the lobes meet
  const a1 = aT - Math.PI * 2;                                         // round the top and outside of the lobe
  const P = [C[0] + r * Math.cos(aT), C[1] + r * Math.sin(aT)];
  const arcLen = r * (a0 - a1), lineLen = Math.hypot(T[0] - P[0], T[1] - P[1]);
  return Array.from({ length: NP }, (_, i) => {
    const sl = (i / (NP - 1)) * (arcLen + lineLen);
    let x, y;
    if (sl <= arcLen) { const a = a0 - sl / r; x = C[0] + r * Math.cos(a); y = C[1] + r * Math.sin(a); }
    else { const u = (sl - arcLen) / lineLen; x = P[0] + (T[0] - P[0]) * u; y = P[1] + (T[1] - P[1]) * u; }
    return [cx - dir * x, cy + y];
  });
}
// left eye per face (Figma px, eye centre around x −32)
const LEFT_EYE = {
  pill:     () => { const l = linePts(-32, -20, -32, 6); return { a: l, b: l, w: 28 }; },           // 28 × 54 pill (Figma 62, shortened)
  greeting: () => { const l = arcPts(-32, -7, 12.5, Math.PI + 0.38, Math.PI * 2 - 0.38); return { a: l, b: l, w: 6.5 }; },
  error:    () => { const l = linePts(-45, -6, -19, -6); return { a: l, b: l, w: 9 }; },
  dizzy:    () => ({ a: linePts(-44, -16, -22, 6), b: linePts(-22, -16, -44, 6), w: 7.5 }),
  sleepy:   () => { const l = arcPts(-32, -12, 12, Math.PI - 0.32, 0.32); return { a: l, b: l, w: 6.5 }; },
  // angry: a stroke is the narrowed eye (short pill), b the brow — high at the
  // outer side, dropping toward the nose
  angry:    () => ({ a: linePts(-31, -9, -31, 7), b: linePts(-49, -35, -17, -21), w: 22 }),
  // wishlist: a filled heart — stroke a is its left half (top dip → round lobe →
  // straight side → tip), b the right half; drawFace fills between them.
  // Two round lobes with straight tangent sides give a clean point (the
  // classic sin³ heart curve pinches into a thin spike at the tip).
  // ~30 × 25 Figma px, centred on the pill eye.
  heart:    () => ({ a: heartHalf(-1), b: heartHalf(1), w: 4 }),
  // curious: lopsided — this eye a touch narrowed, the other (R) opened big and raised
  curious:  () => { const l = linePts(-32, -15, -32, 3); const r = linePts(32, -25, 32, 7);
    return { a: l, b: l, w: 25, R: { a: r, b: r, w: 30 } }; },
  // wow: eyes opened wide (taller, wider pills) with the brows shot up (stroke b)
  // (brows kept low enough to clear the helmet's liner, which hides anything above y ≈ −38)
  wow:      () => ({ a: linePts(-32, -14, -32, 8), b: arcPts(-32, -25.5, 11.5, Math.PI + 0.75, Math.PI * 2 - 0.75), w: 33 }),
  // squeeze: eyes screwed shut, > <  (helmet coming off / about to land)
  squeeze:  () => ({ a: linePts(-44, -17, -23, -8), b: linePts(-23, -8, -44, 1), w: 7 }),
  // lookUp: round eyes glancing up at something above (the helmet coming in)
  lookUp:   () => { const l = linePts(-31, -28, -31, -5); return { a: l, b: l, w: 27 }; },
  // happy: big ^^ (a touch larger and bolder than the greeting's)
  happy:    () => { const l = arcPts(-32, -6, 14, Math.PI + 0.36, Math.PI * 2 - 0.36); return { a: l, b: l, w: 7.5 }; },
};
const EYE_SET = LEFT_EYE;
const FACE_OF = { idle: 'pill', working: 'pill', greeting: 'greeting', error: 'error', dizzy: 'dizzy', sleepy: 'sleepy', angry: 'angry', wishlist: 'heart', curious: 'curious', wow: 'wow', happy: 'happy' };
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
// Mouth: only the greeting smiles; every other face keeps it collapsed to a
// point (width 0) at the same spot, so the smile grows out of / shrinks into
// nothing as faces morph.
const MOUTH = {
  smile: () => ({ a: arcPts(0, 13, 10.5, Math.PI - 0.55, 0.55), w: 5.5 }),
  frown: () => ({ a: arcPts(0, 29, 9.5, Math.PI + 0.6, Math.PI * 2 - 0.6), w: 5.5 }),
  none: () => ({ a: linePts(0, 23, 0, 23), w: 0 }),
  grin: () => ({ a: arcPts(0, 11, 13.5, Math.PI - 0.62, 0.62), w: 6.5 }),               // happy: a big smile
  o:    () => ({ a: arcPts(0, 31, 8, -Math.PI / 2, Math.PI * 1.5), w: 5.5 }),             // wow: a round "O"
  hmm:  () => ({ a: linePts(-5, 26, 7, 23.5), w: 4.5 }),                                 // curious: a small sideways "hmm"
  tight: () => ({ a: linePts(-7, 27, 7, 27), w: 5 }),                                    // squeeze: a pressed-shut mouth
  ooh:  () => ({ a: arcPts(0, 27, 5, -Math.PI / 2, Math.PI * 1.5), w: 4.5 }),            // lookUp: a small "ooh"
};
const MOUTH_SET = MOUTH;
const faceSpec = (state) => faceSpecKind(FACE_OF[state] || 'pill');
function faceSpecKind(kind) {
  const L = EYE_SET[kind]();
  const R = L.R || { a: mirror(L.a), b: mirror(L.b), w: L.w };   // most faces mirror; curious is lopsided
  const pill = kind === 'pill' ? 1 : 0;
  const pillish = pill || kind === 'curious' || kind === 'wow' || kind === 'lookUp' ? 1 : 0;   // round eyes: morph straight across, and blink
  const happy = kind === 'greeting' ? 1 : 0;
  const angry = kind === 'angry' ? 1 : 0;
  const heart = kind === 'heart' ? 1 : 0;
  const mouth = happy || heart ? MOUTH_SET.smile() : angry ? MOUTH_SET.frown()
    : kind === 'happy' ? MOUTH_SET.grin() : kind === 'wow' ? MOUTH_SET.o() : kind === 'curious' ? MOUTH_SET.hmm()
    : kind === 'squeeze' ? MOUTH_SET.tight() : kind === 'lookUp' ? MOUTH_SET.ooh() : MOUTH_SET.none();
  const brow = angry || kind === 'wow' ? 1 : 0;
  // brow width: the angry brow is a thinner stroke than its eye (stroke b)
  // no blush on any face (greeting / intro and wishlist keep just the smile)
  return { eyes: [{ a: L.a, b: L.b, w: L.w }, R], mouth, glint: pill, lip: pill, cheeks: 0, flush: angry, brow, blink: pillish, heart };
}
const lerp = (a, b, t) => a + (b - a) * t;
const lerpPts = (A, B, t) => A.map((p, i) => [lerp(p[0], B[i][0], t), lerp(p[1], B[i][1], t)]);
function lerpFace(A, B, t) {
  return {
    eyes: A.eyes.map((e, i) => ({ a: lerpPts(e.a, B.eyes[i].a, t), b: lerpPts(e.b, B.eyes[i].b, t), w: lerp(e.w, B.eyes[i].w, t) })),
    mouth: { a: lerpPts(A.mouth.a, B.mouth.a, t), w: lerp(A.mouth.w, B.mouth.w, t) },
    glint: lerp(A.glint, B.glint, t), lip: lerp(A.lip, B.lip, t),
    cheeks: lerp(A.cheeks, B.cheeks, t), blink: lerp(A.blink, B.blink, t),
    flush: lerp(A.flush || 0, B.flush || 0, t), brow: lerp(A.brow || 0, B.brow || 0, t),
    heart: lerp(A.heart || 0, B.heart || 0, t),
  };
}

function drawFace(spec, open = 1) {
  fctx.clearRect(0, 0, FACE_PX, FACE_PX);
  fctx.save();
  fctx.translate(0, FACE_DY * S);

  if (spec.flush > 0.01) {                           // angry red flush
    fctx.save();
    fctx.globalAlpha = spec.flush;
    fctx.filter = `blur(${10 * S}px)`;
    fctx.fillStyle = 'rgba(232,70,40,0.32)';
    fctx.beginPath();
    fctx.ellipse(X(0), Y(-2), 70 * S, 34 * S, 0, 0, Math.PI * 2);
    fctx.fill();
    fctx.restore();
  }

  if (spec.cheeks > 0.01) {                          // greeting blush
    fctx.save();
    fctx.globalAlpha = spec.cheeks;
    fctx.filter = `blur(${3.5 * S}px)`;
    fctx.fillStyle = 'rgba(244,128,128,0.55)';
    for (const cx of [-61, 63]) {
      fctx.beginPath();
      fctx.ellipse(X(cx), Y(29), 17 * S, 9 * S, 0, 0, Math.PI * 2);
      fctx.fill();
    }
    fctx.restore();
  }

  if (spec.mouth.w > 0.05) {                         // smile
    fctx.save();
    fctx.strokeStyle = '#000';
    fctx.lineWidth = spec.mouth.w * S;
    fctx.lineCap = 'round';
    fctx.lineJoin = 'round';
    fctx.beginPath();
    spec.mouth.a.forEach(([x, y], i) => (i ? fctx.lineTo(X(x), Y(y)) : fctx.moveTo(X(x), Y(y))));
    fctx.stroke();
    fctx.restore();
  }

  const k = spec.glint;                              // "pill-ness": top shading weight
  const hk = spec.heart || 0;                        // heart eyes: black → red, filled
  const mix = (a, b) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * hk)).join(',')})`;
  const stops = [mix([59 * k, 59 * k, 59 * k], [255, 110, 130]), mix([12, 12, 12], [245, 51, 79]), mix([0, 0, 0], [214, 30, 62])];
  fctx.save();
  fctx.translate(eyeLook.x * S, eyeLook.y * S);   // the eyes lead the head's glances (see updateEyeLook)
  for (const e of spec.eyes) {
    const all = e.a.concat(e.b);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const h = y1 - y0 + e.w;                         // visual height including the round caps
    fctx.save();
    // blink: squash the eye vertically about its centre (pill eyes only)
    const sq = lerp(1, Math.max(open, 5 / 54), spec.blink);
    fctx.translate(0, Y(cy)); fctx.scale(1, sq); fctx.translate(0, -Y(cy));
    // (no white bottom lip under the eyes — removed on request; eyes are plain)
    const g = fctx.createLinearGradient(0, Y(y0 - e.w / 2), 0, Y(y1 + e.w / 2));
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.32, stops[1]);
    g.addColorStop(1, stops[2]);
    fctx.strokeStyle = g;
    fctx.fillStyle = g;
    fctx.lineCap = 'round';
    fctx.lineJoin = 'round';
    // stroke b shares the eye's width, except as a brow (angry), where it thins
    const widths = [e.w, lerp(e.w, 8.5, spec.brow || 0)];
    const same = e.a.every((p, i) => Math.abs(p[0] - e.b[i][0]) + Math.abs(p[1] - e.b[i][1]) < 0.01);
    (same ? [e.a] : [e.a, e.b]).forEach((pts, si) => {   // single-stroke eyes: draw once (no doubled lip)
      fctx.lineWidth = widths[si] * S;
      fctx.beginPath();
      pts.forEach(([x, y], i) => (i ? fctx.lineTo(X(x), Y(y)) : fctx.moveTo(X(x), Y(y))));
      fctx.stroke();
    });
    if (hk > 0.01) {                                 // heart: fill between its two halves
      fctx.globalAlpha = hk;
      fctx.beginPath();
      e.a.concat(e.b.slice().reverse()).forEach(([x, y], i) => (i ? fctx.lineTo(X(x), Y(y)) : fctx.moveTo(X(x), Y(y))));
      fctx.closePath();
      fctx.fill();
    }
    fctx.restore();
  }
  fctx.restore();
  fctx.restore();
  faceTex.needsUpdate = true;
  eyeLook.drawn = eyeLook.x + eyeLook.y * 1000;
}

// ─── body material ────────────────────────────────────────────────────────
const bodyMat = new THREE.MeshPhysicalMaterial({
  color: 0xffeb45,
  roughness: 0.5,
  clearcoat: 0.6,                // lacquered candy finish: a crisp softbox highlight over the satin base
  clearcoatRoughness: 0.26,     // soft enough that the key light blooms instead of a pin-point hotspot
  specularIntensity: 0.75,
  sheen: 0.3,
  sheenColor: new THREE.Color(0xfff6c8),
  sheenRoughness: 0.8,
  emissive: 0x141000,
});
const uniforms = {
  faceMap: { value: faceTex },
  uTint: { value: new THREE.Color(0xf2dc00) },
  uRimColor: { value: new THREE.Color(0xfffbe0) },
  uRim: { value: 0.3 },
  uGlowColor: { value: new THREE.Color(0xffeb45) },     // inner glow, in the body colour (themed)
  uGlow: { value: 0.16 },
  uShade: { value: new THREE.Color(0.9, 0.86, 0.74) },   // colour of the helmet shade (themed)
  // Yellow Friday ball: uYF 0 = the bot, 1 = the plain ball (face off, no helmet shade) + the running text
  uYF: { value: 0 },
  uBare: { value: 0 },                                     // helmet off: 0 on … 1 off (its shade on the head fades)
  yfMap: { value: null },
  uYFText: { value: 0 },                                   // text opacity
  uYFScroll: { value: 0 },                                 // strip x (px) at the ball's centre
  uYFStrip: { value: new THREE.Vector4(1, 1, 301.5, 0) },   // strip w, h (px), ball radius (px), strip row of the ball centre
};
// Helmet → ball occlusion, evaluated on the ball's rest sphere (the helmet is
// a child of the body, so they share that space). The face window is the
// liner's inner edge (Figma liner: sides x ±0.85, top y 0.467, 24px stroke →
// inner edge x ±0.75, y 0.37, corner r ≈ 0.37); its top is pulled down a touch
// because the light comes from above (the Figma "Liner shadow" sits 6px low).
//   • inside the window: dark at the liner, opening to full light ~0.34 in
//   • under the shell: deep shade (the inside of the helmet)
//   • below the shell rim (y −0.55): back into the light over ~0.35
// The shadow is tinted by the theme (uShade) so it reads as the body colour in shade, not grey.
const HELMET_AO_GLSL = `
{
  vec3 rp = normalize(vRest);
  float top = 0.30, bot = -1.7;
  vec2 q = abs(vec2(rp.x, rp.y - (top + bot) * 0.5)) - vec2(0.75, (top - bot) * 0.5) + 0.36;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.36;
  float faceAO = mix(0.46, 1.0, smoothstep(0.0, 0.34, -sd));
  float ao = (rp.z > 0.0 && sd < 0.0) ? faceAO : 0.42;
  ao = max(ao, mix(0.42, 1.0, smoothstep(-0.5, -0.88, rp.y)));   // below the rim
  ao = mix(ao, 1.0, max(uYF, uBare));                              // helmet tucked away / off: no shade
  outgoingLight *= ao * mix(uShade, vec3(1.0), ao);
}`;

bodyMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, uniforms);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aRest;\nvarying vec3 vRest;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
uniform sampler2D faceMap;
uniform vec3 uTint;
uniform vec3 uRimColor;
uniform float uRim;
uniform vec3 uShade;
uniform vec3 uGlowColor;
uniform float uGlow;
uniform float uYF;
uniform float uBare;
uniform sampler2D yfMap;
uniform float uYFText;
uniform float uYFScroll;
uniform vec4 uYFStrip;
varying vec3 vRest;
${SURFACE_GLSL}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float lower = smoothstep(0.25, -0.95, vRest.y) * smoothstep(-0.6, 0.4, vRest.z);
diffuseColor.rgb = mix(diffuseColor.rgb, uTint, lower * 0.6);
vec2 fuv = vRest.xy / (2.0 * ${FACE_EXTENT.toFixed(3)}) + 0.5;
vec4 face = texture2D(faceMap, fuv);
float faceA = face.a * smoothstep(0.15, 0.4, vRest.z)
  * step(abs(fuv.x - 0.5), 0.5) * step(abs(fuv.y - 0.5), 0.5) * (1.0 - uYF);
diffuseColor.rgb = mix(diffuseColor.rgb, face.rgb, faceA);
// Yellow Friday text: the Lottie's strip wrapped round the ball like a band round its
// middle, seen from the camera (view-space normal): x = scroll + R·angle, y = height —
// so letters squeeze toward the edges exactly like the Lottie's run round its ball
vec4 yfText = vec4(0.0);
if (uYFText > 0.001) {
  vec3 vn = normalize(vNormal);
  float th = atan(vn.x, vn.z);
  // (vertical × 1.062 − 0.015: matches the Lottie's letter height / position under the 3D camera's perspective)
  vec2 sp = vec2(uYFScroll + uYFStrip.z * th, uYFStrip.w + (-vn.y * 1.062 - 0.015) * uYFStrip.z);
  vec2 suv = sp / uYFStrip.xy;
  // sample unconditionally (mip derivatives stay valid), then mask outside the strip
  yfText = texture2D(yfMap, vec2(clamp(suv.x, 0.0, 1.0), 1.0 - clamp(suv.y, 0.0, 1.0)));
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  yfText.a *= inside * uYFText * smoothstep(0.0, 0.06, vn.z);
}
// soft-touch vinyl, evaluated on the rest sphere so it turns with the face:
// gentle tonal depth, a fine moulded grain and a mottled satin sheen
float skin = 1.0 - faceA;
float tone = fbm3(vRest * 3.5 + 11.0);
float grain = vnoise(vRest * 24.0);                 // broad, soft undulation only
diffuseColor.rgb *= mix(1.0, 0.96 + 0.08 * tone, skin);
float mottle = smoothstep(0.3, 0.8, fbm3(vRest * 6.0 + 4.0));`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.32, faceA);
roughnessFactor += skin * (mottle * 0.07 - 0.035);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
// grain on the vinyl; the lacquered eyes only get a faint orange peel
normal = bumpN(normal, grain * 0.00012 * skin);`)
    .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
clearcoatNormal = bumpN(clearcoatNormal, grain * 0.0001 * skin);`)
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.sheenColor *= 1.0 - faceA;
material.clearcoat *= 1.0 - 0.5 * faceA;
material.specularColor *= 1.0 - 0.6 * faceA;
material.specularColorBlended *= 1.0 - 0.6 * faceA;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// premium inner glow: the colour seems lit from within, strongest where the ball faces the camera
float facing = saturate(dot(normal, normalize(vViewPosition)));
totalEmissiveRadiance += uGlowColor * uGlow * facing * facing;
totalEmissiveRadiance *= 1.0 - faceA;`)
    .replace('#include <opaque_fragment>', `float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
outgoingLight += uRimColor * fres * uRim * (1.0 - faceA);
${HELMET_AO_GLSL}
outgoingLight = mix(outgoingLight, yfText.rgb, yfText.a);   // flat print, like the Lottie's letters
#include <opaque_fragment>`);
};

const body = new THREE.Mesh(geometry, bodyMat);
body.frustumCulled = false;
scene.add(body);

const helmet = createHelmet();
body.add(helmet.group);
const BODY_BOTTOM = R;                               // distance from the centre down to where it sits on the floor
const ORBIT_UP = 1.55;                               // dizzy beads circle this far above the centre

// ─── props: dizzy orbit, Zz ───────────────────────────────────────────────
const satin = (color, emissive = 0x000000, ei = 0) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4, emissive, emissiveIntensity: ei,
});

const orbiters = [0.075, 0.055, 0.068].map((r, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), satin(0xfff6a8, 0xfff07a, 0.35));
  m.userData.phase = i * Math.PI * 2 / 3;
  m.scale.setScalar(0);
  scene.add(m);
  return m;
});

function zTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff6b0';
  x.font = '800 104px -apple-system, "SF Pro Rounded", system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('z', 64, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const zTex = zTexture();
const zs = [];
let zTimer = 0;

// Wishlist hearts: 3 hearts start hidden behind the bot and pop out past its
// edge (up-left, up, up-right), overshooting in size, then drift up and fade.
function heartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const heart = new Path2D();
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2, sn = Math.sin(t);
    const px = 64 + 3.6 * 16 * sn * sn * sn, py = 58 - 3.6 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    i ? heart.lineTo(px, py) : heart.moveTo(px, py);
  }
  const g = x.createLinearGradient(0, 10, 0, 120);
  g.addColorStop(0, '#ff7a8f');
  g.addColorStop(1, '#e8233f');
  x.fillStyle = g;
  x.fill(heart);
  x.globalAlpha = 0.55;                               // soft highlight on the left lobe
  x.fillStyle = '#fff';
  x.beginPath();
  x.ellipse(40, 34, 11, 7, -0.6, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const heartTex = heartTexture();
const hearts = [];
// [right, up, size, reach]: up-left, up-right and out to the right — diagonals clear the
// helmet's outline without leaving the top of a short window
const HEART_DIRS = [[-0.8, 0.6, 0.28, 1.25], [0.7, 0.72, 0.3, 1.05], [1, 0.15, 0.23, 1.15]];
const _hR = new THREE.Vector3(), _hU = new THREE.Vector3(), _hB = new THREE.Vector3();
function popHearts() {
  _hB.subVectors(body.position, camera.position).normalize();
  HEART_DIRS.forEach(([dx, dy, size, reach], i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false, toneMapped: false }));
    const n = Math.hypot(dx, dy);
    sp.userData = { age: -i * 0.09, dx: dx / n, dy: dy / n, size, reach, rot: (i - 1) * -0.35,
      origin: body.position.clone().addScaledVector(_hB, 0.45) };   // a little behind the bot's centre
    sp.visible = false;
    scene.add(sp);
    hearts.push(sp);
  });
}
function updateHearts(dt) {
  _hR.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _hU.set(0, 1, 0).applyQuaternion(camera.quaternion);
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i], u = h.userData;
    u.age += dt;
    const a = u.age;
    if (a < 0) continue;
    h.visible = true;
    const out = 0.5 + u.reach * (1 - (1 - Math.min(1, a / 0.5)) ** 3);   // ease out from behind the body past its edge
    h.position.copy(u.origin)
      .addScaledVector(_hR, u.dx * out)
      .addScaledVector(_hU, u.dy * out + a * 0.15);                   // then keeps floating up
    const pop = Math.min(1, a / 0.32);
    h.scale.setScalar(u.size * Math.max(0, 1 + 2.4 * (pop - 1) ** 3 + 1.4 * (pop - 1) ** 2));   // ease-out-back pop
    h.material.rotation = u.rot + Math.sin(a * 7) * 0.12;
    h.material.opacity = Math.min(1, a / 0.08) * THREE.MathUtils.clamp(1 - (a - 0.9) / 0.5, 0, 1);
    if (a > 1.4) { scene.remove(h); h.material.dispose(); hearts.splice(i, 1); }
  }
}

// ─── Yellow Friday sale ───────────────────────────────────────────────────
// The bot whips round a full-power 360° and, while its back is turned, tucks
// its helmet into the ball and its face fades: it comes round as a plain yellow
// ball, 1.22× bigger (the Lottie's ball phase, r 302 vs the bot's 247), and
// "YELLOW FRIDAY SALE" runs round it — the "Golu New Loop_6" Lottie's own
// lettering (3D Bot Home Page, iteration 03, frames 217–402), unwrapped into
// assets/yf-strip.png, scrolling on the Lottie's own curve (YF_S). Then a second
// 360° turns it back into the bot, and it returns to Idle. No hop either way.
const YF = {
  spin: 1.8,                   // s for each 360° — a slow, eased turn (ease-in-out sine)
  morph: [0.12, 0.88],         // spin progress over which it morphs: helmet sinks in, face fades, ball swells
  textAt: 0.62,                // spin progress where the text starts (just before it's fully a ball)
  ballK: 1.22,                 // ball size vs the bot's ball
  f0: 217, f1: 402,            // Lottie frames of the ball phase (60 fps)
  outAt: 372,                  // Lottie frame to start turning back (the last letter has just left; the slow turn's own ease-in covers the rest)
};
// strip x at the ball centre, every 3 Lottie frames from 217 (then 402); centreX0 + S(f)
// (the PNG is 2× — 6185 × 708; these are in 1× Lottie px)
const YF_CENTRE_X0 = -681.5, YF_R = 301.5, YF_ROW = 183, YF_W = 3092.5, YF_H = 354;
const YF_S = [0, 92.4, 184.9, 277.3, 369.7, 462.1, 554.6, 647, 739.2, 829.6, 918.1, 1004.7, 1089.7, 1173.1, 1255, 1335.5,
  1414.7, 1492.8, 1569.8, 1645.9, 1721.1, 1795.5, 1869.3, 1942.5, 2015.2, 2087.5, 2159.6, 2231.4, 2303.1, 2374.9, 2446.6,
  2518.5, 2590.7, 2663.1, 2736, 2809.3, 2883.2, 2957.7, 3032.9, 3108.9, 3185.7, 3263.5, 3342.2, 3422, 3503, 3585.1, 3668.4,
  3753.1, 3838.7, 3924.3, 4009.9, 4095.5, 4181.1, 4266.8, 4352.4, 4438, 4523.6, 4609.2, 4694.8, 4780.4, 4866, 4951.6];
const YF_S_402 = 5008.6;
function yfScrollAt(f) {
  if (f >= 400) return YF_S[YF_S.length - 1] + (YF_S_402 - YF_S[YF_S.length - 1]) * Math.min(1, (f - 400) / 2);
  const i = Math.max(0, (f - YF.f0) / 3), i0 = Math.floor(i);
  return YF_S[i0] + (YF_S[i0 + 1] - YF_S[i0]) * (i - i0);
}
{
  const tex = new THREE.TextureLoader().load('assets/yf-strip.png');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  uniforms.yfMap.value = tex;
  uniforms.uYFStrip.value.set(YF_W, YF_H, YF_R, YF_ROW);
}
// yf.phase: null | 'in' | 'ball' | 'out'; t = s into the phase; amt = 0 bot … 1 ball;
// tf = the Lottie frame the text is at (starts during the turn in, runs on through the ball phase)
const yf = { phase: null, t: 0, amt: 0, base: 0, tf: null };
let yfHidesHelmet = false;
const smooth01 = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// one slow full turn to its left, easing in and out
const yfSpinAngle = (p) => -Math.PI * 2 * (1 - Math.cos(Math.PI * p)) / 2;
const yfMorph = (p) => smooth01((p - YF.morph[0]) / (YF.morph[1] - YF.morph[0]));
function startYF() {
  finishHelmetMove();
  Object.assign(yf, { phase: 'in', t: 0, tf: null, base: Math.round(m.spin / (Math.PI * 2)) * Math.PI * 2 });
  m.homing = false;
}
function resetYF() {
  if (!yf.phase && yf.amt === 0) return;
  Object.assign(yf, { phase: null, t: 0, amt: 0, tf: null });
  uniforms.uYF.value = 0; uniforms.uYFText.value = 0;
  helmet.group.scale.setScalar(1); yfHidesHelmet = false;
  m.spin = 0; m.spinV = 0; m.homing = true; m.home = 0; m.glideF = 0;
}
function updateYF(dt) {
  if (!yf.phase) return;
  yf.t += dt;
  let turnLeft = 0;                                   // rad still to turn (text rides on the ball's surface)
  if (yf.phase === 'in' || yf.phase === 'out') {
    const p = Math.min(1, yf.t / YF.spin);
    const prev = m.spin;
    m.spin = yf.base + yfSpinAngle(p);
    m.spinV = dt > 0 ? (m.spin - prev) / dt : 0;        // a gentle lean into the turn
    turnLeft = m.spin - (yf.base - Math.PI * 2);
    yf.amt = yf.phase === 'in' ? yfMorph(p) : 1 - yfMorph(p);
    if (yf.phase === 'in' && yf.tf == null && p >= YF.textAt) yf.tf = YF.f0;   // the sale text starts
    if (p >= 1) {
      m.spin = 0; m.spinV = 0; turnLeft = 0;
      if (yf.phase === 'in') { yf.phase = 'ball'; yf.t = 0; }
      else { resetYF(); setState('idle'); return; }
    }
  }
  if (yf.tf != null) {
    yf.tf += dt * 60;
    if (yf.phase === 'ball' && yf.tf >= YF.outAt) { yf.phase = 'out'; yf.t = 0; yf.base = 0; yf.tf = null; }
  }
  uniforms.uYF.value = yf.amt;
  if (yf.tf != null) {
    // strip x at the ball centre on this Lottie frame; while it's still turning, the text is printed
    // on the turning ball (shifted by the turn still to come) so the turn carries it round
    uniforms.uYFScroll.value = YF_CENTRE_X0 + yfScrollAt(Math.min(yf.tf, YF.f1)) - YF_R * turnLeft;
    uniforms.uYFText.value = 1;
  } else uniforms.uYFText.value = 0;
  // the helmet sinks into the ball as it turns. Its visible range is 1 → 0.69 (the shell sits just
  // outside the ball, the visor at 1.36, the hinge knobs at 1.45 — all inside below 0.69), so that range
  // is spread over the whole morph and only the last 10% (already hidden) drops on to 0.4
  const a = yf.amt;
  helmet.group.scale.setScalar(a < 0.9 ? 1 - 0.31 * (a / 0.9) : THREE.MathUtils.lerp(0.69, 0.4, (a - 0.9) / 0.1));
  yfHidesHelmet = yf.amt >= 0.999;
}

// ─── helmet off / on ──────────────────────────────────────────────────────
// Off: one quick flow — the helmet lifts off, goes back over Golu's head and
// hides behind it (no tug). On: the reverse — it comes from behind, over the
// head, and snugs down onto it with a soft settle.
// One path both ways, at the helmet's real size, which never passes through
// the head and ends far behind it on the camera's line of sight, hidden.
const HELM = { flow: 0.75, off: 0.75, lead: 0.12, flowIn: 0.8, on: 1.05 };   // quick: no tug, straight into the flow
// The helmet stays its real size the whole time (no stretch, no shrink). It covers
// more than half the ball, so the only clean way off is straight up its own axis
// (measured: its closest point never dips below the ball's surface, ≥ 1.003 R, at
// any lift — every other direction cuts into the head), and turning about the
// ball's centre keeps that clearance. So: lift up its axis, roll back over the
// top about the centre until its axis lines up with the camera's ray through the
// head, then carry on along that axis — straight away behind the head, where it
// shrinks only by perspective and the head covers it. Near the head that's done
// in the body's space; once it's well clear (SWITCH_D) it moves along the ray in
// world space, so a nod or bob of the head can't swing the distant helmet out.
// While it moves, Golu holds still (its idle glances ease out: hel.focus).
const NEAR_D = 0.35, SWITCH_D = 1.5, FAR_D = 20;
// One continuous flow (u 0 → 1) instead of lift → stop → roll → stop → away: the
// three overlap, so something is always moving and it never pauses. Off: it
// lifts straight off (fast start), rolls back over the top while still
// lifting, and is already heading away before the roll ends.
function flowOff(u, out) {
  out.d = NEAR_D * easeOutCubic01(u / 0.35) + (FAR_D - NEAR_D) * Math.max(0, (u - 0.42) / 0.58) ** 3;
  out.th = hel.thE * smooth01((u - 0.12) / 0.6);
  return out;
}
// On: it comes in from far behind, slowing, is already rolling up the back as it
// arrives, and slides down onto the head as the roll finishes.
function flowOn(u, out) {
  out.d = (FAR_D - NEAR_D) * Math.max(0, (0.55 - u) / 0.55) ** 3 + NEAR_D * (1 - smooth01((u - 0.6) / 0.4));
  out.th = hel.thE * (1 - smooth01((u - 0.25) / 0.6));
  return out;
}
const _fl = {};
function placeFlow(g, f) { if (f.d < SWITCH_D) placeHelmet(g, f.d, f.th); else placeHelmetFar(g, f.d, f.th); }   // FAR_D: far enough that perspective makes the full-size helmet smaller than the head
function placeHelmet(g, d, th, s = 1, ry = 0, rz = 0) {
  g.position.set(0, d * Math.cos(th), -d * Math.sin(th));
  g.rotation.set(-th, ry, rz);
  g.scale.setScalar(s);
}
const _cw = new THREE.Vector3(), _ray = new THREE.Vector3(), _bq = new THREE.Quaternion(), _ax = new THREE.Vector3();
const _wm = new THREE.Matrix4(), _wp = new THREE.Vector3(), _wq = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _inv = new THREE.Matrix4();
// the roll angle whose axis points (in world space) along the camera's ray through the head
function rayTheta() {
  body.updateMatrixWorld();
  body.getWorldPosition(_cw); body.getWorldQuaternion(_bq);
  _ray.subVectors(_cw, camera.position).normalize();
  let best = 1.7, bd = -2;
  for (let th = 1.0; th <= 2.4; th += 0.005) {
    _ax.set(0, Math.cos(th), -Math.sin(th)).applyQuaternion(_bq);
    const dd = _ax.dot(_ray); if (dd > bd) { bd = dd; best = th; }
  }
  return best;
}
// far placement: D out from the head's centre along a direction that blends from the
// helmet's own axis (at SWITCH_D, matching the near path exactly) to the camera's live
// ray through the head (by SWITCH_D + 1.5) — so it always ends dead behind the head,
// whatever the head is doing, and stays outside it (it only moves away)
const _ab = new THREE.Vector3(), _dir = new THREE.Vector3(), _qa = new THREE.Quaternion(), _ql = new THREE.Quaternion(), _ex = new THREE.Euler();
function placeHelmetFar(g, D, th) {
  body.updateMatrixWorld();
  body.getWorldPosition(_cw); body.getWorldQuaternion(_bq);
  _ab.set(0, Math.cos(th), -Math.sin(th)).applyQuaternion(_bq);
  _ray.subVectors(_cw, camera.position).normalize();
  _dir.copy(_ab).lerp(_ray, smooth01((D - SWITCH_D) / 1.5)).normalize();
  _ql.copy(_bq).multiply(_qa.setFromEuler(_ex.set(-th, 0, 0)));
  _wq.setFromUnitVectors(_ab, _dir).multiply(_ql);
  _wp.copy(_cw).addScaledVector(_dir, D);
  _wm.compose(_wp, _wq, _one);
  _inv.copy(body.matrixWorld).invert().multiply(_wm);
  _inv.decompose(g.position, g.quaternion, g.scale);
}
const hel = { on: true, anim: null, t: 0, bare: 0, focus: 0, thE: 1.6 };
const easeOutCubic01 = (x) => 1 - (1 - THREE.MathUtils.clamp(x, 0, 1)) ** 3;
const easeInQuad01 = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x; };
function setHelmet(on) {
  if (yf.phase) return;                               // not mid Yellow Friday
  if (hel.on === on && !hel.anim) return;
  endIntro();
  hel.on = on; hel.anim = on ? 'on' : 'off'; hel.t = 0; hel.fired = {};
  syncHelmetBtn();
}
function finishHelmetMove() {
  if (!hel.anim) return;
  hel.anim = null; hel.bare = hel.on ? 0 : 1;
  placeHelmet(helmet.group, 0, 0, 1);
}
// extra head motion the helmet move adds to the pose (pitch, yaw, roll)
const helPose = { pitch: 0, yaw: 0, roll: 0, lift: 0 };
function updateHelmet(dt) {
  const g = helmet.group;
  helPose.pitch = helPose.yaw = helPose.roll = helPose.lift = 0;
  const once = (k, fn) => { if (!hel.fired[k]) { hel.fired[k] = true; fn(); } };
  if (hel.anim === 'off') {
    const t = (hel.t += dt);
    once('aim', () => { hel.thE = rayTheta(); });     // one flow: up off the head, back over the top, away behind it
    placeFlow(g, flowOff(Math.min(1, t / HELM.flow), _fl));
    once('ex0', () => setFaceOverride('lookUp'));    // eyes up, watching it go up and over…
    if (t >= 0.48) once('ex1', () => setFaceOverride('happy'));   // …then a relieved ^^ once it's gone behind
    hel.bare = smooth01(t / 0.2);                    // its shade lifts off the head as it goes
    if (t >= HELM.off) { hel.anim = null; hel.bare = 1; placeHelmet(g, 0, 0); schedule(0.6, () => { if (faceOverride === 'happy') setFaceOverride(null); }); }
  } else if (hel.anim === 'on') {
    const t = (hel.t += dt);
    const tD = HELM.lead + HELM.flowIn;
    if (t < HELM.lead) {                              // (still hidden: Golu settles its gaze first)
      placeHelmetFar(g, FAR_D, 1.6);
      once('ex0', () => setFaceOverride('lookUp'));  // looks up at it coming, "ooh"
    } else if (t < tD) {                              // in one flow: from behind, up and over, down onto the head
      once('aim', () => { hel.thE = rayTheta(); });
      placeFlow(g, flowOn((t - HELM.lead) / HELM.flowIn, _fl));
      if (t >= tD - 0.3) once('ex1', () => setFaceOverride('squeeze'));   // braces for it, > <
    } else {                                          // a soft settle as it fits
      once('land', () => { m.nodV += 0.8; setFaceOverride('happy'); });   // fits — a happy ^^ "ready!"
      placeHelmet(g, 0, 0);
    }
    hel.bare = 1 - smooth01((t - tD + 0.08) / 0.16);
    if (t >= HELM.on) { hel.anim = null; hel.bare = 0; placeHelmet(g, 0, 0); schedule(0.45, () => { if (faceOverride === 'happy') setFaceOverride(null); }); }
  }
  // Golu holds still while the helmet moves (its idle glances ease out, then back in)
  hel.focus += ((hel.anim ? 1 : 0) - hel.focus) * (1 - Math.exp(-dt * (hel.anim ? 9 : 3)));
  uniforms.uBare.value = hel.bare;
  g.visible = !yfHidesHelmet && (hel.anim === 'on' ? hel.t >= HELM.lead : (hel.on || (hel.anim === 'off' && hel.t < HELM.off)));
}

// ─── rigid-body motion ────────────────────────────────────────────────────
const m = {
  y: HOVER_Y, vy: 0, airborne: false, hoverY: HOVER_Y,
  x: 0, vx: 0,
  spin: 0, spinV: 0,                  // yaw: set by dragging; after release glides, then springs home
  homing: false, home: 0, glideF: 0,  // home = front-facing turn it settles into; glideF = coast friction
  tilt: 0, tiltV: 0,                  // vertical-drag tilt, eases back to level on release
  dragging: false, dragVel: 0, lastDir: 1,
  nod: 0, nodV: 0, rock: 0, rockV: 0, // pitch / roll wobble kicked by landings
  shake: 0,                           // error tremble amplitude
};

function hop(v) {
  if (m.airborne && m.y > m.hoverY + 0.12) return;   // no re-launching mid-air (rapid taps)
  m.airborne = true;
  m.vy = Math.min(Math.max(m.vy, 0) + v, 4.6);
}

// Where to come to rest after a release: the whole turn (face-on) nearest to
// where the flick would naturally stop. If that's ahead in the direction of
// travel, coast there with exactly the friction that stops on it (no
// overshoot-and-reverse on fast flicks); otherwise spring straight back.
function planReturn() {
  const TAU = Math.PI * 2;
  const proj = m.spin + m.spinV / 2.6;
  m.home = Math.round(proj / TAU) * TAU;
  const dist = m.home - m.spin;
  m.glideF = (Math.abs(m.spinV) > 0.5 && Math.sign(dist) === Math.sign(m.spinV) && Math.abs(dist) > 0.05)
    ? THREE.MathUtils.clamp(m.spinV / dist, 1, 8) : 0;
  m.homing = true;
}

// keyboard nudge: a flick of momentum in that direction
function nudge(dir) {
  m.lastDir = dir;
  m.homing = false;
  m.spinV += dir * 14;                                // about one full turn, then home
}

function stepMotion(h) {
  // yaw: the pointer drives it while held; after release it returns face-on
  if (!m.dragging && !intro.active && !yf.phase) {
    // after a release (see planReturn): coast on the flick's momentum with a
    // friction tuned to come to rest on the chosen front-facing turn, then a
    // soft spring finishes the settle (or brings a slow release straight back)
    if (!m.homing) planReturn();
    if (m.glideF > 0) {
      m.spinV *= Math.exp(-h * m.glideF);
      if (Math.abs(m.spinV) < 1.2) m.glideF = 0;
    } else {
      m.spinV += (45 * (m.home - m.spin) - 9.5 * m.spinV) * h;   // ζ ≈ 0.7: one soft overshoot
      if (Math.abs(m.home - m.spin) < 1e-4 && Math.abs(m.spinV) < 1e-3) {
        m.spin -= m.home; m.home = 0;                  // keep the numbers small
      }
    }
    m.spin += m.spinV * h;
  }
  if (!m.dragging) {
    // tilt eases back to level (slightly under-damped)
    m.tiltV += (-70 * m.tilt - 11 * m.tiltV) * h;
    m.tilt += m.tiltV * h;
  }

  // vertical: ballistic in the air, light rebounds, then the hover spring.
  // Each touchdown nods the ball forward and rocks it toward the spin.
  if (m.airborne) {
    m.vy -= GRAVITY * h;
    m.y += m.vy * h;
    if (m.y <= m.hoverY && m.vy < 0) {
      const impact = -m.vy;
      m.y = m.hoverY;
      m.nodV += Math.min(impact, 4.5) * 0.55;
      m.rockV += m.lastDir * Math.min(impact, 4.5) * 0.35;
      if (impact > 1.5) m.vy = impact * 0.4;
      else { m.airborne = false; m.vy *= 0.3; }
    }
  } else {
    m.vy += (85 * (m.hoverY - m.y) - 11 * m.vy) * h;
    m.y += m.vy * h;
  }

  // wobble springs (ζ ≈ 0.24): two or three gentle rocks, then still
  m.nodV += (-95 * m.nod - 4.6 * m.nodV) * h;
  m.nod += m.nodV * h;
  m.rockV += (-95 * m.rock - 4.6 * m.rockV) * h;
  m.rock += m.rockV * h;

  m.vx += (90 * -m.x - 14 * m.vx) * h;
  m.x += m.vx * h;
}

// ─── state machine ────────────────────────────────────────────────────────
let state = 'idle';
let faceCur = faceSpec('idle');   // what's on the face right now
let morph = null;                 // { from, to, t } while a state change morphs the face
// into / out of the round pill eyes: go via a closed eye (natural blink into the
// new expression) instead of twisting the pill into the shape
function faceTo(to) {
  const fromPill = faceCur.blink > 0.5, toPill = to.blink > 0.5;
  morph = fromPill !== toPill ? { via: true, fromPill, from: faceCur, to, t: 0 } : { from: faceCur, to, t: 0 };
}
// a passing expression on top of the current mood (the helmet moves use it); null = back to the mood's face
let faceOverride = null;
function setFaceOverride(kind) {
  if (faceOverride === kind) return;
  faceOverride = kind;
  faceTo(kind ? faceSpecKind(kind) : faceSpec(state));
}
let stateTime = 0;
let eyeOpen = 1;
let blinkT = -1, nextBlink = 2.5;
const scripts = [];               // timed one-shots { at, fn }

function schedule(at, fn) { scripts.push({ at: stateTime + at, fn }); }
const CURIOUS_HOLD = 2.2;        // s of curious before Idle
const WOW_HOLD = 0.75;           // s of "wow" before it turns happy
const HAPPY_HOLD = 1.5;          // s of happy before Idle
const ANGRY_HOLD = 1.5;         // s the bot stays angry before it goes back to Idle
const GREETING_HOLD = 1.5;      // s of greeting before it goes back to Idle
const WISHLIST_HOLD = 1.6;      // s of heart eyes (the hearts are gone by ~1.4 s), then back to Idle
const FACE_SETTLE = 0.6;        // s for the face to finish morphing back to Idle pills (VIA_BACK: reshape 0.3 + open 0.26)
const VISOR_LEAD = 0.35;        // s for the visor to swing open / shut around Angry (snappy spring ≈ 90% there)
// Angry always happens with the visor up: if it's down, it flips open first
// and the angry face follows; on the way out the face returns to Idle, then
// the visor comes down.
function goAngry() {
  endIntro();
  if (!helmet.visorDown || !hel.on) { setState('angry'); return; }
  scripts.length = 0;                                 // drop anything pending (e.g. the intro's own hand-off)
  setVisor(false);
  schedule(VISOR_LEAD, () => setState('angry'));
}
function pickState(key) {
  if (key === 'angry') { goAngry(); return; }
  endIntro();
  setState(key);
}

function setState(next, { quiet = false, intro: byIntro = false, fromWow = false } = {}) {
  if (next === 'happy' && !fromWow) next = 'wow';     // Happy is "wow!" first, then happy
  if (!STATES.some(s => s.key === next)) return;
  if (!byIntro) introRun = false;                     // any other state change ends the Intro chip
  if (state === 'yellowfriday' && next !== 'yellowfriday') resetYF();   // picked something else mid-sale
  const prev = state;
  if (prev !== next) { prevState = prev; prevStateTime = stateTime; poseBlend = 0; }
  state = next;
  stateTime = 0;
  scripts.length = 0;
  faceOverride = null;                                // a mood change always wins over a passing expression
  faceTo(faceSpec(next));
  m.shake = 0;

  if (!quiet) {
    switch (next) {
      case 'greeting':
        hop(3.2);
        schedule(GREETING_HOLD, () => { if (state === 'greeting') setState('idle'); });
        break;
      case 'error':
        m.vx -= 2.4;
        m.shake = 0.03;
        schedule(0.45, () => { m.shake = 0; });
        break;
      case 'dizzy':
        m.vx += 1.6;
        break;
      case 'angry': {
        // stiffen with a shudder and a faint tremble, then cool off: back to
        // Idle ANGRY_HOLD seconds after it got angry
        m.shake = 0.024;
        m.nodV += 1.4;
        schedule(0.4, () => { m.shake = 0.006; });
        schedule(ANGRY_HOLD, () => {
          if (state !== 'angry') return;
          setState('idle');                             // the face calms back to normal first…
          schedule(FACE_SETTLE, () => { if (state === 'idle' && hel.on) setVisor(true); });   // …then the visor comes down
        });
        break;
      }
      case 'yellowfriday':
        startYF();
        break;
      case 'curious':
        // a little "hm?" — leans in with a small bob, tilts and peeks; then back to Idle
        m.nodV += 0.7;
        schedule(CURIOUS_HOLD, () => { if (state === 'curious') setState('idle'); });
        break;
      case 'wow':
        // "wow!": a jolt back and a little hop, eyes and brows shoot up, mouth an O
        hop(2.3);
        m.nodV -= 1.2;
        schedule(WOW_HOLD, () => { if (state === 'wow') setState('happy', { fromWow: true }); });
        break;
      case 'happy':
        // …then happy: a blink into big ^^ and a grin, a bouncy hop and a wiggle; then Idle
        hop(2.9);
        schedule(HAPPY_HOLD, () => { if (state === 'happy') setState('idle'); });
        break;
      case 'wishlist':
        // heart eyes, a happy hop and hearts popping out from behind, then Idle
        popHearts();
        hop(2.4);
        m.nodV -= 0.8;
        schedule(WISHLIST_HOLD, () => { if (state === 'wishlist') setState('idle'); });
        break;
      default:
        if (prev === 'sleepy') hop(3.6);
    }
  }
  syncNav();
}

// ─── UI ───────────────────────────────────────────────────────────────────
const nav = document.getElementById('states');
// Intro: replays the opening — grows in with a full turn, greets, settles into
// Idle, then lowers the visor. Its chip stays lit until that sequence ends.
let introRun = false;
const introBtn = document.createElement('button');
introBtn.type = 'button';
introBtn.textContent = 'Intro';
introBtn.title = 'Intro (I)';
introBtn.addEventListener('click', () => playIntro());
nav.appendChild(introBtn);
{ const d = document.createElement('span'); d.className = 'sep'; nav.appendChild(d); }   // Intro | moods
function playIntro() {
  setState('idle', { quiet: true });
  helmet.setVisorDown(false);
  syncVisor();
  Object.assign(intro, { active: true, t: 0, scale: 0, greeted: false });
  introRun = true;
  syncNav();
}
BAR_STATES.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = s.label;
  b.dataset.state = s.key;
  b.title = `${s.label} (${i + 1})`;
  b.addEventListener('click', () => pickState(s.key));
  nav.appendChild(b);
});
function syncNav() {
  introBtn.setAttribute('aria-pressed', String(introRun));
  const shown = state === 'wow' ? 'happy' : state;   // "wow" is Happy's first beat
  nav.querySelectorAll('button[data-state]').forEach(b => b.setAttribute('aria-pressed', String(!introRun && b.dataset.state === shown)));
}
// visor toggle, after a divider in the same bar
const sep = document.createElement('span');
sep.className = 'sep';
nav.appendChild(sep);
const visorBtn = document.createElement('button');
visorBtn.type = 'button';
visorBtn.className = 'visor';
visorBtn.title = 'Visor up / down (V)';
nav.appendChild(visorBtn);
function syncVisor() {
  visorBtn.textContent = helmet.visorDown ? 'Visor up' : 'Visor down';
  visorBtn.setAttribute('aria-pressed', String(helmet.visorDown));
}
function setVisor(down, { slow = false } = {}) {
  if (helmet.visorDown === down) return;
  helmet.setVisorDown(down, { slow });
  m.nodV += (down ? 0.5 : -0.5) * (slow ? 0.4 : 1);   // a little nod as the visor swings
  syncVisor();
}
function toggleVisor() {
  endIntro();
  setVisor(!helmet.visorDown);
}
visorBtn.addEventListener('click', toggleVisor);
syncVisor();
// helmet off / on — the visor button only makes sense with the helmet on
const helmetBtn = document.createElement('button');
helmetBtn.type = 'button';
helmetBtn.className = 'visor';
helmetBtn.title = 'Helmet off / on (H)';
nav.appendChild(helmetBtn);
function syncHelmetBtn() {
  helmetBtn.textContent = hel.on ? 'Helmet off' : 'Helmet on';
  helmetBtn.setAttribute('aria-pressed', String(!hel.on));
  visorBtn.hidden = !hel.on;
}
helmetBtn.addEventListener('click', () => setHelmet(!hel.on));
syncHelmetBtn();

// ─── colour: bright, saturated yellow ───────────────────────────────────
// The Figma noon tile is body #FFEB45, tint #F2DC00. Here the
// ball is a purer, fully saturated lemon yellow with a lighter lower tint, a
// yellow (not white) sheen, a warmer helmet shade and a yellow self-glow
// (GLOW, × body) so the shadow side stays bright instead of going olive.
// Helmet paint + stitching follow the accent.
const NOON = { name: 'noon', body: 0xfff000, tint: 0xffe600, accent: 0xfff000, sheen: 0xfff8b0, shade: [0.96, 0.88, 0.5] };
const GLOW = 0.22;
const WHITE = new THREE.Color(1, 1, 1);
const themeColor = (th, hex) => new THREE.Color(hex);
function toColors(th) {
  const body = themeColor(th, th.body), tint = themeColor(th, th.tint);
  const t = [(th.tint >> 16 & 255) / 255, (th.tint >> 8 & 255) / 255, (th.tint & 255) / 255];
  const mx = Math.max(...t);
  return {
    body, tint, accent: themeColor(th, th.accent),
    sheen: th.sheen != null ? new THREE.Color(th.sheen) : WHITE.clone().lerp(body, 0.3),
    rim: WHITE.clone().lerp(body, 0.55),               // brand-tinted edge glow
    shade: th.shade ? new THREE.Color(...th.shade) : new THREE.Color(...t.map((c) => 0.9 - 0.16 * (1 - c / mx))),
    logo: th.name === 'noon' ? 0 : 1,                 // front wordmark: black on noon yellow, white on the rest
  };
}
const themeCur = toColors(NOON);
function applyTheme() {
  bodyMat.color.copy(themeCur.body);
  uniforms.uTint.value.copy(themeCur.tint);
  uniforms.uRimColor.value.copy(themeCur.rim);
  uniforms.uShade.value.copy(themeCur.shade);
  uniforms.uGlowColor.value.copy(themeCur.body);
  bodyMat.sheenColor.copy(themeCur.sheen);
  bodyMat.emissive.copy(themeCur.body).multiplyScalar(GLOW);
  helmet.setAccent(themeCur.accent);
  helmet.setLogoWhite(themeCur.logo);
}
applyTheme();

addEventListener('keydown', (e) => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= BAR_STATES.length) pickState(BAR_STATES[n - 1].key);
  if (e.key === 'v' || e.key === 'V') toggleVisor();
  if (e.key === 'h' || e.key === 'H') setHelmet(!hel.on);
  if (e.key === 'i' || e.key === 'I') playIntro();
  if (e.key === 'ArrowLeft') nudge(-1);
  if (e.key === 'ArrowRight') nudge(1);
});

// ─── pointer: drag to rotate, swipe for the visor, tap to bounce ──────────
// The bot does not follow the cursor. Each gesture locks to an axis after a
// few pixels: horizontal drags spin the bot (release hands the velocity to
// the glide → spring back face-on); vertical swipes tilt the bot with the
// finger (eases back level on release) and work the visor — swipe up to raise
// it, down to lower it (once per swipe, after VISOR_SWIPE px).
// A short still press is a tap (a bounce).
const AXIS_LOCK_PX = 8;
const VISOR_SWIPE_PX = 35;
// Three swipes up in a row (each within ANGRY_GAP_MS of the last) make the bot
// angry; a swipe down or a pause resets the count.
const ANGRY_SWIPES = 3;
const ANGRY_GAP_MS = 1500;
let upSwipes = 0, lastUpSwipe = 0;
function countSwipe(up) {
  const now = performance.now();
  if (!up) { upSwipes = 0; return; }
  upSwipes = now - lastUpSwipe <= ANGRY_GAP_MS ? upSwipes + 1 : 1;
  lastUpSwipe = now;
  if (upSwipes >= ANGRY_SWIPES) {
    upSwipes = 0;
    goAngry();
  }
}
let gesture = null;

canvas.addEventListener('pointerdown', (e) => {
  if (yf.phase) return;                               // hands off during the Yellow Friday show
  gesture = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), t: performance.now(), moved: 0, axis: null, fired: false, turn: 0 };
  if (intro.active) { const sp = m.spin; endIntro(); m.spin = sp; }   // grab takes over mid-turn
  m.dragging = true;
  m.homing = false;
  m.spinV = 0;
  m.dragVel = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  canvas.classList.add('grabbing');
});

canvas.addEventListener('pointermove', (e) => {
  if (!gesture) return;
  const now = performance.now();
  const dx = e.clientX - gesture.lx, dy = e.clientY - gesture.ly;
  const dt = Math.max(1, now - gesture.lt) / 1000;
  gesture.lx = e.clientX; gesture.ly = e.clientY; gesture.lt = now;
  gesture.moved = Math.max(gesture.moved, Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y));
  if (!gesture.axis) {
    if (gesture.moved < AXIS_LOCK_PX) return;          // let taps stay taps
    const tx = e.clientX - gesture.x, ty = e.clientY - gesture.y;
    gesture.axis = Math.abs(tx) >= Math.abs(ty) ? 'x' : 'y';
  }
  if (gesture.axis === 'y') {
    // the bot tilts with the finger as before…
    m.tilt = THREE.MathUtils.clamp(m.tilt + dy * DRAG_PITCH, -MAX_TILT, MAX_TILT);
    m.tiltV = 0;
    // …and the swipe works the visor: up raises it, down lowers it
    const ty = e.clientY - gesture.y;
    if (!gesture.fired && Math.abs(ty) >= VISOR_SWIPE_PX) {
      gesture.fired = true;
      setVisor(ty > 0);
      countSwipe(ty < 0);
    }
    return;
  }
  if (state === 'sleepy') setState('idle', { quiet: true });
  m.spin += dx * DRAG_YAW;
  // smoothed angular velocity, used for the release glide and the lean
  m.dragVel += ((dx * DRAG_YAW) / dt - m.dragVel) * 0.35;
  if (dx) m.lastDir = Math.sign(dx);
});

function endGesture() {
  if (!gesture) return;
  const g = gesture;
  gesture = null;
  m.dragging = false;
  // stale velocity (pointer held still before release) shouldn't fling it
  const idle = performance.now() - g.lt;
  m.spinV = idle > 80 ? 0 : THREE.MathUtils.clamp(m.dragVel, -14, 14);
  m.dragVel = 0;
  canvas.classList.remove('grabbing');
  if (g.moved < 6 && performance.now() - g.t < 300) tap();
}
canvas.addEventListener('pointerup', endGesture);
canvas.addEventListener('pointercancel', endGesture);

function tap() {
  if (state === 'sleepy') { setState('idle'); return; }
  hop(2.6);
  m.nodV += 1.2;
}

// ─── face animation ───────────────────────────────────────────────────────
const MORPH_S = 0.34;            // a direct face change (shapes ease across, with a soft squint mid-way)
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
// the eyes lead the head: on a new glance they flick toward it, then ease back to
// centre as the head turns to catch up (like real eyes); Figma px on the face
const eyeLook = { x: 0, y: 0, vx: 0, vy: 0, drawn: 0 };
function updateEyeLook(dt) {
  const k = state === 'idle' && !hel.anim ? 42 : 0;   // px per rad of head still to turn
  const tx = THREE.MathUtils.clamp((gaze.ty - gaze.yaw) * k, -7, 7);
  const ty = THREE.MathUtils.clamp((gaze.tp - gaze.pitch) * k, -5, 5);
  const K = 170, D = 2 * Math.sqrt(K);               // quick, no overshoot
  eyeLook.vx += (K * (tx - eyeLook.x) - D * eyeLook.vx) * dt; eyeLook.x += eyeLook.vx * dt;
  eyeLook.vy += (K * (ty - eyeLook.y) - D * eyeLook.vy) * dt; eyeLook.y += eyeLook.vy * dt;
}
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeInQuad = (x) => x * x;
const easeOutCubicF = (x) => 1 - (1 - x) ** 3;
// The "closed eye": a short horizontal stroke, exactly the size of a pill eye
// squashed shut (28 wide × ~7 tall), so the two can hand over seamlessly.
const SQUASH = 7.1 / 54;
const CLOSED = (() => {
  const l = linePts(-42.5, -7, -21.5, -7);
  return { eyes: [{ a: l, b: l, w: 7 }, { a: mirror(l), b: mirror(l), w: 7 }], mouth: MOUTH_SET.none(), glint: 0, lip: 1, cheeks: 0, blink: 0 };
})();
const VIA = { close: 0.13, open: 0.34 };            // s: a quick blink shut, then open softly into the new shape
const VIA_BACK = { reshape: 0.3, open: 0.32 };      // back to pills: relax shut, then open gently
function updateFace(dt) {
  updateEyeLook(dt);
  // pill ⇄ other face: squash the pills shut, then the closed line bends into
  // the new shape (and the reverse: reshape to closed, then open into pills)
  if (morph && morph.via) {
    const total = morph.fromPill ? VIA.close + VIA.open : VIA_BACK.reshape + VIA_BACK.open;
    morph.t = Math.min(1, morph.t + dt / total);
    if (morph.fromPill) {
      const split = VIA.close / total;
      if (morph.t < split) {
        faceCur = morph.from;
        drawFace(morph.from, lerp(1, SQUASH, easeInQuad(morph.t / split)));
      } else {
        faceCur = lerpFace(CLOSED, morph.to, easeOutCubicF((morph.t - split) / (1 - split)));
        drawFace(faceCur, 1);
      }
    } else {
      const split = VIA_BACK.reshape / total;         // relax into a closed line, then open gently
      if (morph.t < split) {
        faceCur = lerpFace(morph.from, CLOSED, easeInOutCubic(morph.t / split));
        drawFace(faceCur, 1);
      } else {
        faceCur = morph.to;
        drawFace(morph.to, lerp(SQUASH, 1, easeInOutCubic((morph.t - split) / (1 - split))));
      }
    }
    if (morph.t >= 1) { faceCur = morph.to; morph = null; drawFace(faceCur, 1); }
    return;
  }
  // state change: morph the current face (even mid-morph) into the new one
  if (morph) {
    const mt = (morph.t = Math.min(1, morph.t + dt / MORPH_S));
    faceCur = lerpFace(morph.from, morph.to, easeInOutSine(mt));
    if (mt >= 1) { faceCur = morph.to; morph = null; }
    drawFace(faceCur, 1 - 0.14 * Math.sin(Math.PI * mt));   // a soft squint as it changes
    return;
  }
  // blinks on the pill eyes
  if (faceCur.blink > 0.5) {
    nextBlink -= dt;
    if (nextBlink <= 0 && blinkT < 0) blinkT = 0;
    if (blinkT >= 0) {                              // a real blink: quick close, a beat shut, a slower open
      blinkT += dt;
      const C = 0.065, HOLD = 0.035, O = 0.13;
      if (blinkT < C) eyeOpen = 1 - easeInQuad(blinkT / C);
      else if (blinkT < C + HOLD) eyeOpen = 0;
      else eyeOpen = easeOutCubicF(Math.min(1, (blinkT - C - HOLD) / O));
      if (blinkT >= C + HOLD + O) {
        eyeOpen = 1; blinkT = -1;
        nextBlink = Math.random() < 0.15 ? 0.12 : 1.8 + Math.random() * 3.5;   // now and then a double blink
      }
      drawFace(faceCur, Math.max(0, eyeOpen));
      return;
    }
  }
  if (Math.abs(eyeLook.x + eyeLook.y * 1000 - eyeLook.drawn) > 0.03) drawFace(faceCur, 1);   // eyes moving with a glance
}
const ease = x => 1 - (1 - x) * (1 - x);

// ─── frame loop ───────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const up = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const H = 1 / 240;
let acc = 0;

let simT = 0;
// ─── intro: grow from nothing with a full turn, in place ──────────────────
// Scale 0 → 1 on an ease-out-back (overshoots ~8%, settles) while the bot
// makes one full turn on its vertical axis, ending face-on.
// A grab or a state pick finishes it instantly.
const intro = { active: true, t: 0, scale: 0, greeted: false };
const GREET_AT = 0.6;       // s into the intro: as the scale overshoot peaks and the turn swings home
const GREET_FOR = GREETING_HOLD;   // s of greeting in the intro before it melts into idle (same as the Greeting state)
const INTRO = { delay: 0.12, scale: 0.75, spin: 0.95 };
const easeOutBack = (x, c = 1.9) => 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
const easeOutCubicI = (x) => 1 - (1 - x) ** 3;
function updateIntro(dt) {
  if (!intro.active) return;
  intro.t += dt;
  const t = Math.max(0, intro.t - INTRO.delay);
  const ps = Math.min(1, t / INTRO.scale), pr = Math.min(1, t / INTRO.spin);
  intro.scale = Math.max(0, easeOutBack(ps));
  m.spin = Math.PI * 2 * (1 - easeOutCubicI(pr));   // 360° → 0: turns to its left, ends face-on
  m.spinV = 0;
  if (!intro.greeted && intro.t >= GREET_AT) {
    // no pause: it greets while still settling — eyes morph to ^^, the smile
    // and cheeks bloom, a little happy hop + wave — then melts into idle
    intro.greeted = true;
    setState('greeting', { quiet: true, intro: true });
    hop(2.2);
    schedule(GREET_FOR, () => {
      if (state !== 'greeting') return;
      setState('idle');
      schedule(0.2, () => { if (state === 'idle') setVisor(true, { slow: true }); });   // settles in, then the visor glides down
    });
  }
  if (ps >= 1 && pr >= 1) endIntro();
}
function endIntro() {
  if (!intro.active) return;
  intro.active = false;
  intro.greeted = true;
  intro.scale = 1;
  m.spin = 0; m.spinV = 0;
  m.homing = true; m.home = 0; m.glideF = 0;
}

// ─── idle glances ─────────────────────────────────────────────────────────
// In Idle the bot looks around: slight left → slight right → up-left →
// up-right → back to centre, holding each glance ~2 s (with a little jitter)
// and sometimes blinking as it shifts. A slow, critically damped spring
// (ζ = 1, ~1.5 s to arrive, no overshoot) drives the look so it drifts
// unhurriedly; leaving Idle eases it back to centre.
const GLANCES = [               // [yaw, pitch]  (+yaw = its face turns right on screen, −pitch = up)
  [-0.2, 0], [0.2, 0], [-0.16, -0.12], [0.16, -0.12], [0, 0],
];
const gaze = { yaw: 0, pitch: 0, vy: 0, vp: 0, ty: 0, tp: 0, i: -1, hold: 1.4 };
function updateGaze(dt) {
  if (state === 'idle' && !m.dragging && !intro.active) {
    gaze.hold -= dt;
    if (gaze.hold <= 0) {
      gaze.i = (gaze.i + 1) % GLANCES.length;
      [gaze.ty, gaze.tp] = GLANCES[gaze.i];
      const centre = gaze.ty === 0 && gaze.tp === 0;
      gaze.hold = (centre ? 2.8 : 2.0) + Math.random() * 0.8;
      if (Math.random() < 0.3 && blinkT < 0) nextBlink = 0.05;     // blink as it shifts its gaze
    }
  } else {
    gaze.ty = 0; gaze.tp = 0; gaze.i = -1; gaze.hold = 0.9;        // back to centre; restart the loop later
  }
  const K = 6, D = 2 * Math.sqrt(K);                  // critically damped: smooth, no overshoot
  gaze.vy += (K * (gaze.ty - gaze.yaw) - D * gaze.vy) * dt;
  gaze.yaw += gaze.vy * dt;
  gaze.vp += (K * (gaze.tp - gaze.pitch) - D * gaze.vp) * dt;
  gaze.pitch += gaze.vp * dt;
}

// Per-state body pose (offsets on top of gaze / base pitch). Kept as a pure
// function of time so the previous state's pose can keep playing while it
// crossfades into the new one — no snap when a state ends.
const POSE_BLEND_S = 0.65;        // mood → mood pose crossfade (eased)
let prevState = 'idle', prevStateTime = 0, poseBlend = 1;
function statePose(st, t, st_t) {
  const p = { yaw: 0, pitch: 0, roll: 0, sway: 0 };
  switch (st) {
    case 'idle':
      p.yaw = Math.sin(t * 0.7) * 0.015;             // faint drift between glances
      break;
    case 'working':
      p.yaw = Math.sin(t * 1.5) * 0.3;
      p.pitch = 0.1;
      break;
    case 'greeting':
      p.roll = Math.sin(st_t * 9) * 0.2 * Math.exp(-st_t * 1.2) + 0.06;
      break;
    case 'error':
      p.roll = Math.sin(st_t * 18) * 0.1 * Math.exp(-st_t * 3);
      p.pitch = 0.05;
      break;
    case 'angry':
      p.pitch = 0.13;                                  // head down: a glare from under the brows
      p.roll = Math.sin(t * 1.9) * 0.025;              // slow, stiff sway
      break;
    case 'dizzy':
      p.roll = Math.sin(t * 2.6) * 0.24;
      p.pitch = Math.cos(t * 2.6) * 0.14;
      p.yaw = Math.sin(t * 1.3) * 0.18;
      p.sway = Math.sin(t * 2.6) * 0.08;
      break;
    case 'sleepy':
      p.roll = 0.14 + Math.sin(t * 0.8) * 0.03;
      p.pitch = 0.16;
      break;
    case 'curious': {
      const k = 1 - Math.exp(-st_t * 5);              // eases into the tilt
      p.roll = -0.17 * k;                              // head tilted, big eye up
      p.yaw = (0.11 + Math.sin(st_t * 1.4) * 0.05) * k;   // peeks to one side, slowly
      p.pitch = 0.06 * k;                              // leans in a touch
      break;
    }
    case 'wow':
      p.pitch = -0.13 * (1 - Math.exp(-st_t * 9));    // rears back in surprise
      break;
    case 'happy':
      p.roll = Math.sin(st_t * 10) * 0.16 * Math.exp(-st_t * 1.4);   // a happy wiggle
      p.pitch = -0.04;
      break;
    case 'wishlist':
      p.roll = Math.sin(st_t * 8) * 0.12 * Math.exp(-st_t * 1.6);   // a delighted little wiggle
      p.pitch = -0.06;                                               // looks up a touch
      break;
  }
  return p;
}

function update(dt) {
  simT += dt;
  const t = simT;
  stateTime += dt;
  for (let i = scripts.length - 1; i >= 0; i--) {
    if (stateTime >= scripts[i].at) { const s = scripts[i]; scripts.splice(i, 1); s.fn(); }
  }

  // hover height: a gentle bob, or sitting on the floor when asleep
  if (state === 'sleepy') m.hoverY = FLOOR_Y + BODY_BOTTOM;
  else m.hoverY = HOVER_Y + Math.sin(t * 1.6) * (state === 'working' ? 0.02 : 0.05);

  updateIntro(dt);
  acc += dt;
  while (acc >= H) { stepMotion(H); acc -= H; }
  updateYF(dt);                                       // Yellow Friday drives the turn itself
  updateHelmet(dt);

  // state-specific pose (self-driven — never from the cursor)
  updateGaze(dt);
  helmet.update(dt);
  // state pose, crossfaded from the previous state's pose after a change
  poseBlend = Math.min(1, poseBlend + dt / POSE_BLEND_S);
  prevStateTime += dt;
  const cur = statePose(state, t, stateTime);
  const pb = easeInOutCubic(poseBlend);
  const pv = pb < 1 ? statePose(prevState, t, prevStateTime) : cur;
  const gf = 1 - hel.focus;                          // idle glances pause while the helmet moves
  let yaw = gaze.yaw * gf + lerp(pv.yaw, cur.yaw, pb);
  let pitch = BASE_PITCH + gaze.pitch * gf + lerp(pv.pitch, cur.pitch, pb);
  let roll = lerp(pv.roll, cur.roll, pb);
  const sway = lerp(pv.sway, cur.sway, pb);
  // lean into the spin like a ball rolling off a flick, plus landing wobble
  roll += THREE.MathUtils.clamp(-(m.dragging ? m.dragVel : m.spinV) * 0.012, -0.18, 0.18) - m.rock;
  pitch += m.nod + m.tilt + helPose.pitch;
  yaw += helPose.yaw;
  roll += helPose.roll;

  euler.set(pitch, yaw + m.spin, roll, 'YXZ');
  body.quaternion.setFromEuler(euler);
  body.scale.setScalar(Math.max(1e-4, intro.scale) * THREE.MathUtils.lerp(1, YF.ballK, yf.amt));
  const tremble = m.shake ? Math.sin(t * 90) * m.shake : 0;
  body.position.set(m.x + sway + tremble, m.y + helPose.lift, 0);

  updateFace(dt);

  // dizzy orbit — three beads circling above the head
  up.set(0, 1, 0).applyQuaternion(body.quaternion);
  orbiters.forEach((o, i) => {
    const on = state === 'dizzy' ? 1 : 0;
    o.scale.setScalar(THREE.MathUtils.lerp(o.scale.x, on, 1 - Math.exp(-dt * 10)));
    o.visible = o.scale.x > 0.01;
    if (!o.visible) return;
    const a = t * 3.2 + o.userData.phase;
    tmpV.set(Math.cos(a) * 0.62, 0.02 * Math.sin(a * 2 + i), Math.sin(a) * 0.36);
    o.position.copy(body.position).addScaledVector(up, ORBIT_UP).add(tmpV);
  });

  // Zz — drift up and to the right, then fade
  if (state === 'sleepy') {
    zTimer -= dt;
    if (zTimer <= 0) {
      zTimer = 1.15;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false, toneMapped: false }));
      sp.userData.age = 0;
      sp.position.copy(body.position).add(new THREE.Vector3(0.55, 0.95, 0.3));
      scene.add(sp);
      zs.push(sp);
    }
  }
  for (let i = zs.length - 1; i >= 0; i--) {
    const z = zs[i];
    z.userData.age += dt;
    const a = z.userData.age;
    z.position.x += dt * 0.22 + Math.sin(a * 3) * dt * 0.08;
    z.position.y += dt * 0.38;
    const s = 0.16 + a * 0.12;
    z.scale.set(s, s, 1);
    z.material.opacity = Math.min(1, a * 3) * Math.max(0, 1 - a / 2.6);
    if (a > 2.6) { scene.remove(z); z.material.dispose(); zs.splice(i, 1); }
  }
  updateHearts(dt);

}

function frame() {
  update(Math.min(clock.getDelta(), 1 / 30));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

drawFace(faceCur, 1);
setState('idle', { quiet: true });
introRun = true;                                      // the page opens on the intro
syncNav();
requestAnimationFrame(frame);

// small hook for automated checks
window.orbi = { setState, setHelmet, hel, eyeLook, faceCur: () => faceCur, wishlist: () => pickState('wishlist'), yellowFriday: () => pickState('yellowfriday'), yf, nudge, helmet, toggleVisor, advance: update, faceCanvas, intro, gaze, replay: playIntro, get state() { return state; }, motion: m, bodyUniforms: uniforms, bodyMat, renderer, scene, camera };
