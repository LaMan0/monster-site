/* =========================================================
   MONSTER ENERGY — Canettes 3D (Three.js)
   Chaque canette est ton VRAI modèle 3D Blender (dossier
   "3D textures"), converti en .glb optimisé (dossier models/) :
   1. le mesh (corps, opercule, fond) et ses textures réelles
      (étiquette du parfum, haut/bas de cannette) sont chargés
      avec GLTFLoader — le hero d'abord, les autres de façon
      étalée (le .webp de la page sert d'aperçu entre-temps) ;
   2. rendu : étiquette en couleurs exactes + vernis spéculaire
      (reflets studio mobiles) + condensation (bump/roughness
      fusionnés dans UNE texture) ;
   3. le modèle est recentré/normalisé en hauteur 5 pour garder
      le même cadrage que la canette de secours.
   Perfs : pixel ratio plafonné à 2, rendu suspendu hors écran,
   résolution adaptative si les FPS chutent (matériel modeste).
   Interactions : rotation auto, drag avec inertie, tilt hero.
   Fallback : image .webp si WebGL est indisponible, canette
   procédurale seulement si le .glb est introuvable.
   ========================================================= */
import * as THREE from "../lib/three.module.js";
import { GLTFLoader } from "../lib/jsm/loaders/GLTFLoader.js";

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* =========================================================
   1. MODÈLES 3D : chargement des .glb exportés depuis Blender
   ========================================================= */
const gltfLoader = new GLTFLoader();
const glbCache = new Map();

/* Orientation : dans le UV du modèle Blender, la griffe (logo) est
   au centre de l'étiquette (u≈0.5). Ce capot la fait tourner pour
   qu'elle regarde la caméra au chargement (le viewer démarre à
   ry = PI, comme les anciennes canettes). */
const GLB_FACE_FRONT = -2.479; /* rad — recalculable depuis les UV */

/* charge une fois par parfum, clone ensuite pour chaque viewer */
function loadGLBCan(flavor) {
  if (!glbCache.has(flavor)) {
    glbCache.set(
      flavor,
      new Promise((resolve, reject) => {
        gltfLoader.load(
          "models/can-" + flavor + ".glb",
          (gltf) => resolve(gltf.scene),
          undefined,
          (err) => {
            glbCache.delete(flavor);
            reject(err);
          }
        );
      })
    );
  }
  return glbCache.get(flavor);
}


/* =========================================================
   2. ÉTIQUETTES DE SECOURS (canvas procédural, par parfum)
   ========================================================= */
const LW = 2048, LH = 1024;

function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(ctx, n, color, alpha, seed) {
  const rnd = mulberry(seed);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.3 + rnd() * 0.7);
    const s = rnd() * 2.2 + 0.6;
    ctx.fillRect(rnd() * LW, rnd() * LH, s, s);
  }
  ctx.restore();
}

function blob(ctx, cx, cy, r, rnd, irr) {
  const n = 7 + Math.floor(rnd() * 5);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
    const rad = r * (1 - irr / 2 + rnd() * irr);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * (0.7 + rnd() * 0.6)]);
  }
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

function swirl(ctx, cx, cy, r0, turns, lw, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  const steps = Math.ceil(turns * 28);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = t * turns * Math.PI * 2, r = r0 * (1 - t * 0.92);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

function flower(ctx, cx, cy, r, petals, petalColor, coreColor, rot) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot || 0);
  ctx.fillStyle = petalColor;
  for (let i = 0; i < petals; i++) {
    ctx.save();
    ctx.rotate((i / petals) * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.62, r * 0.30, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function hibiscus(ctx, cx, cy, r, color, rot) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i / 5) * Math.PI * 2 + i * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.34, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.rotate(0.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(r * 0.3, -r * 0.5, r * 0.75, -r * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.78, -r * 0.83, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function label(ctx, str, cx, y, size, opts) {
  const o = opts || {};
  const fill = o.fill || "#fff";
  const weight = o.weight || 900;
  const font = o.font || "Impact,'Arial Narrow','Franklin Gothic Medium','Franklin Gothic',sans-serif";
  ctx.save();
  ctx.font = weight + " " + size + "px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx && o.spacing) ctx.letterSpacing = o.spacing + "px";
  ctx.translate(cx, y);
  if (o.skew) ctx.transform(1, 0, Math.tan((o.skew * Math.PI) / 180), 1, 0, 0);
  if (o.jitter) {
    const rnd = mulberry(o.seed || 7);
    const chars = [...str];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    let total = widths.reduce((a, b) => a + b, 0);
    let x = -total / 2;
    chars.forEach((ch, i) => {
      ctx.save();
      ctx.translate(x + widths[i] / 2, (rnd() - 0.5) * o.jitter);
      ctx.rotate((rnd() - 0.5) * 0.06);
      if (o.stroke) {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeW || 12;
        ctx.lineJoin = "round";
        ctx.strokeText(ch, 0, 0);
      }
      ctx.fillStyle = fill;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += widths[i];
    });
  } else {
    if (o.stroke) {
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.strokeW || 12;
      ctx.lineJoin = "round";
      ctx.strokeText(str, 0, 0);
    }
    ctx.fillStyle = fill;
    ctx.fillText(str, 0, 0);
  }
  ctx.restore();
}

const GASH_L = [
  [0.30, 0.00], [0.16, 0.06], [0.24, 0.13], [0.12, 0.22], [0.22, 0.31],
  [0.10, 0.42], [0.20, 0.52], [0.11, 0.63], [0.19, 0.74], [0.13, 0.85], [0.28, 0.94],
];
const GASH_TIP = [0.40, 1.00];
const GASH_R = [
  [0.50, 0.90], [0.42, 0.78], [0.52, 0.67], [0.44, 0.56], [0.54, 0.45],
  [0.46, 0.34], [0.56, 0.24], [0.48, 0.15], [0.60, 0.08], [0.52, 0.02],
];

function mapGash(pts, ox, oy, gw, gh, lean) {
  return pts.map(([x, y]) => [ox + x * gw + (y - 0.5) * lean * gh, oy + y * gh]);
}

function gashPath(ctx, ox, oy, gw, gh, lean) {
  const L = mapGash(GASH_L, ox, oy, gw, gh, lean);
  const T = mapGash([GASH_TIP], ox, oy, gw, gh, lean)[0];
  const R = mapGash(GASH_R, ox, oy, gw, gh, lean);
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length - 1; i++) {
    const p = L[i], q = L[i + 1];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  const lLast = L[L.length - 1];
  ctx.quadraticCurveTo(lLast[0], lLast[1], T[0], T[1]);
  for (let i = 0; i < R.length - 1; i++) {
    const p = R[i], q = R[i + 1];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  const rLast = R[R.length - 1];
  ctx.lineTo(rLast[0], rLast[1]);
  ctx.closePath();
}

function clawM(ctx, cx, cy, w, h, o) {
  const gw = w * 0.235, gap = w * 0.062;
  const total = gw * 3 + gap * 2;
  const cfg = [
    { dx: 0, dy: 0.045 * h, sh: 0.94 * h, lean: -0.10 },
    { dx: gw + gap, dy: 0, sh: 1.06 * h, lean: 0.0 },
    { dx: 2 * (gw + gap), dy: 0.045 * h, sh: 0.94 * h, lean: 0.10 },
  ];
  const grad = ctx.createLinearGradient(cx, cy - h * 0.55, cx, cy + h * 0.55);
  if (o.c0 && o.c1) {
    grad.addColorStop(0, o.c0);
    grad.addColorStop(1, o.c1);
  } else {
    grad.addColorStop(0, o.fill);
    grad.addColorStop(1, o.fill);
  }
  if (o.glow) {
    ctx.save();
    ctx.shadowColor = o.glow;
    ctx.shadowBlur = 46;
  }
  cfg.forEach((c) => {
    const ox = cx - total / 2 + c.dx, oy = cy - c.sh / 2 + c.dy;
    gashPath(ctx, ox, oy, gw, c.sh, c.lean);
    if (o.outline) {
      ctx.strokeStyle = o.outline;
      ctx.lineWidth = o.outlineW || 18;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    ctx.fillStyle = grad;
    ctx.fill();
  });
  if (o.glow) ctx.restore();
}

const PAINT = {
  original(x) {
    x.fillStyle = "#0c0c0e";
    x.fillRect(0, 0, LW, LH);
    const g = x.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, "rgba(255,255,255,0.06)");
    g.addColorStop(0.35, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, LW, LH);
    speckle(x, 900, "#ffffff", 0.05, 11);
    label(x, "TAURINE + GINSENG", LW / 2, 66, 54, {
      fill: "#b9c2bb", spacing: 34, weight: 800, font: "'Arial Narrow',Arial,sans-serif",
    });
    clawM(x, LW / 2, 440, 900, 470, { c0: "#c9ff3a", c1: "#4aa810", glow: "rgba(140,255,40,0.55)" });
    label(x, "MONSTER", LW / 2, 800, 168, { fill: "#f4f7f2", jitter: 10, seed: 5 });
    label(x, "ENERGY", LW / 2, 898, 78, { fill: "#9dff1e", spacing: 58 });
  },

  ultra(x) {
    const g = x.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, "#fdfdfc");
    g.addColorStop(0.5, "#f2f2f0");
    g.addColorStop(1, "#e9e9e6");
    x.fillStyle = g;
    x.fillRect(0, 0, LW, LH);
    const rnd = mulberry(4);
    for (let i = 0; i < 220; i++) {
      x.strokeStyle = "rgba(150,158,166," + (0.03 + rnd() * 0.06).toFixed(3) + ")";
      x.lineWidth = 1 + rnd() * 2;
      const px = rnd() * LW;
      x.beginPath();
      x.moveTo(px, 0);
      x.lineTo(px, LH);
      x.stroke();
    }
    for (let i = 0; i < 9; i++) {
      swirl(x, rnd() * LW, 60 + rnd() * (LH - 120), 60 + rnd() * 120, 1 + rnd() * 1.4, 5 + rnd() * 4, "rgba(140,146,155,0.25)");
    }
    label(x, "ZERO SUGAR", LW / 2, 62, 52, {
      fill: "#8b9198", spacing: 40, weight: 800, font: "'Arial Narrow',Arial,sans-serif",
    });
    clawM(x, LW / 2 + 10, 448, 880, 460, { fill: "rgba(0,0,0,0.14)" });
    clawM(x, LW / 2, 440, 880, 460, { c0: "#ffffff", c1: "#e4e6e8", outline: "#43484e", outlineW: 16 });
    label(x, "MONSTER", LW / 2, 790, 160, { fill: "#202327", jitter: 10, seed: 21 });
    label(x, "ENERGY", LW / 2, 878, 70, { fill: "#65c9e2", spacing: 50 });
    label(x, "ZERO ULTRA", LW / 2, 966, 96, { fill: "#101215", spacing: 8 });
  },

  mango(x) {
    const g = x.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, "#38b9f2");
    g.addColorStop(1, "#1683d4");
    x.fillStyle = g;
    x.fillRect(0, 0, LW, LH);
    const rnd = mulberry(31);
    for (let i = 0; i < 8; i++) {
      swirl(x, rnd() * LW, rnd() * LH, 70 + rnd() * 110, 1.2 + rnd() * 1.2, 8, "rgba(10,46,80,0.35)");
    }
    for (let i = 0; i < 9; i++) flower(x, rnd() * LW, rnd() * LH, 46 + rnd() * 52, 8, "#ffad1f", "#d63b28", rnd() * 3);
    for (let i = 0; i < 8; i++) flower(x, rnd() * LW, rnd() * LH, 26 + rnd() * 30, 6, "#ff6aa4", "#ffd23f", rnd() * 3);
    speckle(x, 500, "#083a68", 0.18, 77);
    label(x, "MANGO LOCO", LW / 2, 84, 108, { fill: "#101318", skew: -3 });
    clawM(x, LW / 2, 440, 880, 450, { c0: "#ffd23f", c1: "#ff7a00", outline: "#0f2c52", outlineW: 20, glow: "rgba(255,160,20,0.5)" });
    label(x, "JUICE", LW / 2, 750, 210, { fill: "#ffb020", stroke: "#0f2c52", strokeW: 24, skew: -2 });
    label(x, "MONSTER", LW / 2, 885, 118, { fill: "#ffffff", jitter: 9, seed: 9 });
    label(x, "ENERGY + JUICE", LW / 2, 972, 42, { fill: "#0f2c52", spacing: 24 });
  },

  pipeline(x) {
    const g = x.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, "#ff8296");
    g.addColorStop(0.55, "#ff4e6e");
    g.addColorStop(1, "#ff2f56");
    x.fillStyle = g;
    x.fillRect(0, 0, LW, LH);
    const rnd = mulberry(9);
    for (let i = 0; i < 11; i++) hibiscus(x, rnd() * LW, rnd() * LH, 60 + rnd() * 90, "rgba(255,255,255,0.10)", rnd() * 6);
    for (let i = 0; i < 4; i++) {
      x.strokeStyle = "rgba(255,255,255," + (0.10 - i * 0.02).toFixed(3) + ")";
      x.lineWidth = 10;
      x.beginPath();
      const yb = LH - 30 - i * 42;
      for (let px = 0; px <= LW; px += 16) {
        const y = yb + Math.sin(px / 130 + i) * 16;
        px ? x.lineTo(px, y) : x.moveTo(px, y);
      }
      x.stroke();
    }
    label(x, "PIPELINE PUNCH", LW / 2, 74, 98, { fill: "#1c0d12", skew: -3 });
    clawM(x, LW / 2, 445, 880, 455, { c0: "#ffffff", c1: "#ffd9e0", outline: "#101013", outlineW: 26, glow: "rgba(255,255,255,0.4)" });
    label(x, "PUNCH", LW / 2, 775, 215, { fill: "#ffffff", stroke: "#101013", strokeW: 30, skew: -2 });
    label(x, "MONSTER", LW / 2, 898, 122, { fill: "#ffffff", jitter: 9, seed: 12 });
    label(x, "PUNCH · ENERGY", LW / 2, 976, 44, { fill: "#1c0d12", spacing: 22 });
  },

  pacific(x) {
    const g = x.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, "#f0e2c2");
    g.addColorStop(1, "#e4d0a8");
    x.fillStyle = g;
    x.fillRect(0, 0, LW, LH);
    const rnd = mulberry(15);
    for (let i = 0; i < 10; i++) {
      swirl(x, rnd() * LW, rnd() * LH, 60 + rnd() * 120, 1 + rnd() * 1.3, 5 + rnd() * 4, "rgba(120,104,74,0.35)");
    }
    speckle(x, 800, "#6b5a38", 0.10, 19);
    label(x, "PACIFIC PUNCH", LW / 2, 76, 96, { fill: "#c0272d", skew: -5 });
    clawM(x, LW / 2, 445, 880, 455, { c0: "#ee2931", c1: "#a80d19", outline: "#171310", outlineW: 20, glow: "rgba(200,20,30,0.35)" });
    label(x, "PUNCH", LW / 2, 775, 210, { fill: "#d2202a", stroke: "#f8eed8", strokeW: 28, skew: -2 });
    label(x, "MONSTER", LW / 2, 900, 126, { fill: "#1b1510", jitter: 9, seed: 16 });
    label(x, "PUNCH + ENERGY", LW / 2, 978, 46, { fill: "#b1281f", spacing: 20 });
  },

  assault(x) {
    x.fillStyle = "#4b512e";
    x.fillRect(0, 0, LW, LH);
    const rnd = mulberry(23);
    ["#33381c", "#6a703f", "#22250f", "#7f8452", "#3f4425", "#14160a"].forEach((c) => {
      x.fillStyle = c;
      for (let i = 0; i < 22; i++) {
        blob(x, rnd() * LW, rnd() * LH, 40 + rnd() * 130, rnd, 0.6);
        x.fill();
      }
    });
    x.fillStyle = "rgba(214,15,38,0.16)";
    for (let i = 0; i < 8; i++) {
      blob(x, rnd() * LW, rnd() * LH, 30 + rnd() * 60, rnd, 0.6);
      x.fill();
    }
    speckle(x, 700, "#000000", 0.12, 29);
    label(x, "TAURINE", LW / 2, 62, 54, {
      fill: "#e9ebdf", spacing: 44, weight: 800, font: "'Arial Narrow',Arial,sans-serif",
    });
    clawM(x, LW / 2, 440, 890, 455, { c0: "#e01623", c1: "#9d0712", outline: "rgba(0,0,0,0.35)", outlineW: 10, glow: "rgba(220,20,35,0.4)" });
    label(x, "MONSTER", LW / 2, 780, 150, { fill: "#f4f5ee", jitter: 10, seed: 27 });
    label(x, "ENERGY", LW / 2, 864, 64, { fill: "#e9ebdf", spacing: 50 });
    const bw = 620, bh = 116, bx = LW / 2 - bw / 2, by = 902;
    x.fillStyle = "rgba(8,8,6,0.55)";
    x.fillRect(bx, by, bw, bh);
    x.strokeStyle = "#f4f5ee";
    x.lineWidth = 6;
    x.strokeRect(bx, by, bw, bh);
    label(x, "ASSAULT", LW / 2, by + bh / 2 + 2, 88, { fill: "#f4f5ee", spacing: 6 });
  },
};

const SHELL = {
  original: "#101012",
  ultra: "#eef0ee",
  mango: "#1e9ade",
  pipeline: "#ff4c68",
  pacific: "#e7d6ae",
  assault: "#47502c",
};

const ACCENT = {
  original: "#3dff1c",
  ultra: "#bfe9ff",
  mango: "#ffb020",
  pipeline: "#ff5e7a",
  assault: "#ff4b2e",
  pacific: "#e03a3a",
};

/* =========================================================
   3. ENVIRONNEMENT (reflets métalliques procéduraux)
   ========================================================= */
const _envs = new WeakMap();
function getEnv(renderer) {
  if (_envs.has(renderer)) return _envs.get(renderer);
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 256;
  const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#6a6f75");
  g.addColorStop(0.42, "#1a1d20");
  g.addColorStop(1, "#050607");
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 256);
  /* grand softbox latéral + bandelettes studio */
  c.fillStyle = "#ffffff";
  c.globalAlpha = 0.95;
  c.fillRect(48, 18, 44, 150);
  c.globalAlpha = 0.85;
  c.fillRect(196, 14, 24, 140);
  c.fillRect(352, 24, 56, 120);
  c.globalAlpha = 0.6;
  c.fillRect(452, 40, 26, 90);
  c.fillRect(120, 66, 60, 26);
  c.globalAlpha = 0.4;
  c.fillRect(300, 56, 40, 22);
  /* bande lumineuse d'horizon (reflet continu sur l'alu) */
  c.globalAlpha = 0.35;
  c.fillRect(0, 118, 512, 6);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(tex).texture;
  pm.dispose();
  tex.dispose();
  _envs.set(renderer, env);
  return env;
}

/* =========================================================
   4. GÉOMÉTRIES
   ========================================================= */
/* profil générique (fallback uniquement) */
function canProfilePts() {
  const P = (x, y) => new THREE.Vector2(x, y);
  return [
    P(0.02, 0.14), P(0.28, 0.12), P(0.52, 0.07), P(0.70, 0.03),
    P(0.82, 0.02), P(0.885, 0.05), P(0.945, 0.14), P(0.985, 0.28),
    P(1.0, 0.42),
    P(1.0, 3.86),
    P(0.985, 4.06), P(0.955, 4.26), P(0.91, 4.44), P(0.855, 4.58),
    P(0.815, 4.68), P(0.8, 4.75),
    P(0.82, 4.84), P(0.83, 4.92), P(0.8, 4.98), P(0.765, 4.975), P(0.755, 4.9),
  ];
}
const FB_MIN = 0, FB_MAX = 4.98;



/* métal : dessous + couvercle + rivet + languette (fallback) */
function addMetalParts(group) {
  const metal = new THREE.MeshStandardMaterial({
    color: 0xd9dde1, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.15,
  });
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.8, 64), metal);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = 0.035;
  group.add(bottom);

  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.752, 64), metal);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = 4.885;
  group.add(lid);

  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 24), metal);
  rivet.position.set(0.02, 4.895, 0);
  group.add(rivet);

  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 10, 32), metal);
  tab.rotation.x = Math.PI / 2;
  tab.scale.set(1, 0.62, 1);
  tab.position.set(0.2, 4.9, 0);
  group.add(tab);
}

/* =========================================================
   4b. CONDENSATION + LANGUETTE (détail photoréaliste)
   ========================================================= */
let _drops = null;
function getDropMaps() {
  if (_drops) return _drops;
  const rnd = mulberry(777);

  /* positions partagées : le bump et la roughness tombent EXACTEMENT
     sur les mêmes gouttes (sinon les perles brillent sans dénivellé) */
  const P = [];
  for (let i = 0; i < 460; i++)
    P.push([rnd() * 1024, rnd() * 1024, 1, 1.6 + Math.pow(rnd(), 2.0) * 6.8]);
  for (let i = 0; i < 46; i++) /* coulures : [x, y, longueur, demi-largeur] */
    P.push([rnd() * 1024, rnd() * 1024, 24 + rnd() * 100, 0.9 + rnd() * 1.6, -1]);

  /* hauteur (bump) : perles sphériques + coulures */
  const bc = document.createElement("canvas");
  bc.width = bc.height = 1024;
  const b = bc.getContext("2d");
  b.fillStyle = "#808080";
  b.fillRect(0, 0, 1024, 1024);
  for (const [x, y, a, r, drip] of P) {
    if (drip === -1) { /* coulure verticale terminée par une perle */
      const len = a, wd = r;
      const g = b.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, "rgba(215,215,215,0.55)");
      g.addColorStop(1, "rgba(128,128,128,0)");
      b.fillStyle = g;
      b.fillRect(x - wd / 2, y, wd, len);
      const g2 = b.createRadialGradient(x, y + len, 0, x, y + len, wd * 1.6);
      g2.addColorStop(0, "rgba(255,255,255,0.85)");
      g2.addColorStop(1, "rgba(128,128,128,0)");
      b.fillStyle = g2;
      b.beginPath(); b.arc(x, y + len, wd * 1.6, 0, Math.PI * 2); b.fill();
      continue;
    }
    const g = b.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.55, "rgba(205,205,205,0.4)");
    g.addColorStop(1, "rgba(128,128,128,0)");
    b.fillStyle = g;
    b.beginPath();
    b.arc(x, y, r, 0, Math.PI * 2);
    b.fill();
  }

  /* roughness : les perles sont quasi-miroir, l'alu reste satiné */
  const rc = document.createElement("canvas");
  rc.width = rc.height = 1024;
  const q = rc.getContext("2d");
  q.fillStyle = "rgb(58,58,58)";
  q.fillRect(0, 0, 1024, 1024);
  for (const [x, y, a, r, drip] of P) {
    if (drip === -1) {
      const len = a, wd = r;
      const g = q.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, "rgba(18,18,18,0.8)");
      g.addColorStop(1, "rgba(18,18,18,0)");
      q.fillStyle = g;
      q.fillRect(x - wd / 2, y, wd, len);
      q.beginPath(); q.arc(x, y + len, wd * 1.6, 0, Math.PI * 2); q.fill();
      continue;
    }
    const g = q.createRadialGradient(x, y, 0, x, y, r * 1.18);
    g.addColorStop(0, "rgba(8,8,8,1)");
    g.addColorStop(0.6, "rgba(10,10,10,0.85)");
    g.addColorStop(1, "rgba(10,10,10,0)");
    q.fillStyle = g;
    q.beginPath();
    q.arc(x, y, r * 1.18, 0, Math.PI * 2);
    q.fill();
  }

  /* fusion dans UNE SEULE texture : canal R = hauteur (bumpMap lit .r),
     canal G = roughness (roughnessMap lit .g) → 2× moins de mémoire GPU
     et un upload de texture au lieu de deux par contexte WebGL. */
  const tinted = (src, rgb) => {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    const x = c.getContext("2d");
    x.fillStyle = rgb;
    x.fillRect(0, 0, 1024, 1024);
    x.globalCompositeOperation = "multiply";
    x.drawImage(src, 0, 0);
    return c;
  };
  const mc = document.createElement("canvas");
  mc.width = mc.height = 1024;
  const m = mc.getContext("2d");
  m.drawImage(tinted(bc, "#ff0000"), 0, 0);
  m.globalCompositeOperation = "lighter";
  m.drawImage(tinted(rc, "#00ff00"), 0, 0);

  const map = new THREE.CanvasTexture(mc);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  _drops = { map };
  return _drops;
}

/* canette 3D réelle (modèle Blender exporté en .glb) :
   - étiquette : couleurs exactes de la texture + vernis spéculaire ;
   - haut/bas de cannette : alu imprimé réfléchissant ;
   - condensation (bump + roughness) sur les deux ;
   - normalisée en hauteur 5, centrée, logo face caméra. */
function buildGLBCan(flavor, source, anisotropy) {
  const drops = getDropMaps();
  /* can = objet piloté par le viewer (la boucle réécrit sa rotation) ;
     pivot interne = capot d'orientation du logo */
  const can = new THREE.Group();
  const pivot = new THREE.Group();
  const model = source.clone(true); /* clone par viewer (hero + section) */

  /* vernis : reflets studio qui glissent pendant la rotation */
  const glazeMat = new THREE.MeshStandardMaterial({
    color: 0x2e2e2e, metalness: 1.0, roughness: 1.0,
    roughnessMap: drops.map, bumpMap: drops.map, bumpScale: 0.7,
    envMapIntensity: 1.6,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  /* collecte AVANT traitement (pas de traverse pendant modification) */
  const meshes = [];
  model.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });

  for (const o of meshes) {
    const base = o.material;
    const map = base && base.map ? base.map : null;
    if (map) {
      map.anisotropy = Math.min(8, anisotropy);
      map.colorSpace = THREE.SRGBColorSpace;
    }
    const isLabel = map && map.image && map.image.width >= 500;
    if (isLabel) {
      /* étiquette : couleurs brutes de la texture + vernis par-dessus */
      o.material = new THREE.MeshBasicMaterial({ map, toneMapped: false });
      const coat = new THREE.Mesh(o.geometry, glazeMat);
      o.add(coat); /* même géo, hérite de la transform du mesh */
    } else {
      /* métal imprimé (haut/bas de cannette) */
      o.material = new THREE.MeshStandardMaterial({
        map,
        color: base && base.color ? base.color : new THREE.Color(0xffffff),
        metalness: 0.9, roughness: 0.32, envMapIntensity: 1.35,
        roughnessMap: drops.map, bumpMap: drops.map, bumpScale: 0.35,
      });
    }
  }

  /* normalise : hauteur 5 unités, centré à l'origine (repère du viewer) */
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const h = Math.max(1e-6, box.max.y - box.min.y);
  model.scale.setScalar(5 / h);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  model.position.sub(box.getCenter(new THREE.Vector3()));

  /* la griffe fait face à la caméra au démarrage */
  pivot.rotation.y = GLB_FACE_FRONT;
  pivot.add(model);
  can.add(pivot);
  return can;
}

/* canette de secours : étiquette procédurale + coque colorée */
function buildFallbackCan(flavor, anisotropy) {
  const group = new THREE.Group();

  const cv = document.createElement("canvas");
  cv.width = LW;
  cv.height = LH;
  PAINT[flavor](cv.getContext("2d"));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, anisotropy);
  tex.wrapS = THREE.RepeatWrapping;
  const labelMat = new THREE.MeshStandardMaterial({
    map: tex, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.0,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.004, 1.004, 3.44, 96, 1, true), labelMat);
  body.position.y = 2.14;
  group.add(body);

  const shellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(SHELL[flavor] || "#333333"),
    metalness: 0.5, roughness: 0.38, envMapIntensity: 0.9,
  });
  group.add(new THREE.Mesh(new THREE.LatheGeometry(canProfilePts(), 96), shellMat));

  addMetalParts(group);
  return group;
}

/* =========================================================
   5. VIEWER : scène + interactions par canette
   ========================================================= */
const FOV = 22; /* quasi-orthographique : colle à la perspective studio */
const viewers = [];

function createViewer(container, opts) {
  const o = opts || {};
  const flavor = container.dataset.flavor;
  const stage = container.querySelector(".can3d-stage");
  if (!flavor || !stage) return false;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    console.warn("WebGL indisponible pour la canette", flavor);
    return false;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = getEnv(renderer);

  const camera = new THREE.PerspectiveCamera(FOV, 0.45, 0.1, 80);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
  fill.position.set(-3.5, 1, 3.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(new THREE.Color(ACCENT[flavor] || "#ffffff"), 1.4);
  rim.position.set(-1.5, 2.5, -4.5);
  scene.add(rim);

  /* modèle : chargé en différé (le .webp de la page sert d'attente) ;
     plus de canette procédurale construite pour rien au démarrage */
  const aniso = renderer.capabilities.getMaxAnisotropy();

  const v = {
    stage, renderer, scene, camera, can: null,
    minY: -2.5, maxY: 2.5, H: 5,
    visible: true, ready: false,
    basePR: Math.min(window.devicePixelRatio || 1, 2), /* >2 : coût GPU x2 pour rien */
    state: {
      ry: Math.PI, rx: 0, vel: 0,
      auto: REDUCED ? 0 : 0.5, autoT: REDUCED ? 0 : 0.5,
      drag: false, lx: 0, ly: 0,
      tiltX: 0, tiltY: 0, tiltTX: 0, tiltTY: 0,
      bobPhase: Math.random() * 7,
    },
  };

  const fitCamera = () => {
    const dist = (v.H / 2 + 0.3) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.position.set(0, v.H * 0.06, dist);
    camera.lookAt(0, 0, 0);
  };
  fitCamera();

  const reveal = () => {
    v.ready = true;
    container.classList.add("gl-on"); /* masque le .webp, montre la 3D */
    resize();
  };

  if (PAINT[flavor]) {
    /* hero : tout de suite ; sections : après l'étalonnage du démarrage
       (le .webp de la page fait un aperçu parfait entre-temps) */
    const fetchGLB = () => {
      loadGLBCan(flavor)
      .then((source) => {
        const glb = buildGLBCan(flavor, source, aniso);
        v.can = glb;
        scene.add(glb);
        reveal();
      })
      .catch(() => {
        /* .glb absent/corrompu : canette procédurale de secours */
        const fb = buildFallbackCan(flavor, aniso);
        v.can = fb;
        v.minY = FB_MIN;
        v.maxY = FB_MAX;
        v.H = FB_MAX - FB_MIN;
        scene.add(fb);
        fitCamera();
        reveal();
      });
    };
    if (o.deferGLB) setTimeout(fetchGLB, o.delay || 0);
    else fetchGLB();
  }

  /* --- interactions --- */
  const st = v.state;
  stage.addEventListener("pointerdown", (e) => {
    st.drag = true;
    st.lx = e.clientX;
    st.ly = e.clientY;
    st.vel = 0;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener("pointermove", (e) => {
    if (!st.drag) return;
    const dx = e.clientX - st.lx;
    const dy = e.clientY - st.ly;
    st.lx = e.clientX;
    st.ly = e.clientY;
    st.ry += dx * 0.009;
    st.vel = dx * 0.009;
    st.rx = clamp(st.rx + dy * 0.004, -0.5, 0.5);
  });
  const endDrag = () => { st.drag = false; };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  if (!REDUCED) {
    stage.addEventListener("mouseenter", () => { st.autoT = 1.25; });
    stage.addEventListener("mouseleave", () => { st.autoT = 0.5; });
  }

  if (container.dataset.tilt === "mouse") {
    const heroSec = container.closest(".hero");
    if (heroSec) {
      heroSec.addEventListener("mousemove", (e) => {
        const r = heroSec.getBoundingClientRect();
        st.tiltTY = ((e.clientX - r.left) / r.width - 0.5) * 0.7;
        st.tiltTX = -((e.clientY - r.top) / r.height - 0.5) * 0.4;
      });
      heroSec.addEventListener("mouseleave", () => {
        st.tiltTX = 0;
        st.tiltTY = 0;
      });
    }
  }

  viewers.push(v);

  const resize = () => {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setPixelRatio(v.basePR * prScale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  v.resize = resize;
  resize();
  new ResizeObserver(resize).observe(stage);

  new IntersectionObserver(
    (entries) => entries.forEach((e) => { v.visible = e.isIntersecting; }),
    { rootMargin: "80px", threshold: 0.02 }
  ).observe(stage);

  return true;
}

/* =========================================================
   6. INIT + boucle de rendu partagée
   - viewers étalés : le hero tout de suite, les autres un à
     un (130 ms d'écart, GLB repoussés d'autant) pour que le
     premier rendu ne soit jamais bloqué ;
   - rendu suspendu pour toute canette hors écran ;
   - résolution adaptative : si les FPS chutent, le pixel
     ratio baisse par paliers (puis remonte si ça respire).
   ========================================================= */
let prScale = 1; /* multiplicateur global de résolution (0.55 → 1) */

function init() {
  const containers = [...document.querySelectorAll(".can3d[data-flavor]")];
  const hero = document.querySelector(".hero .can3d[data-flavor]");

  /* viewer du hero : immédiat (visible d'entrée de jeu) */
  if (hero) { try { createViewer(hero); } catch (err) { console.warn("3D indisponible (hero):", err); } }

  /* autres viewers : créés au chargement mais ÉTALÉS (un toutes les
     130 ms) pour ne jamais bloquer le premier rendu, et leur .glb est
     repoussé d'autant — zéro à-coup, tout est prêt en ~2 s. */
  let k = 0;
  for (const c of containers) {
    if (c === hero) continue;
    k++;
    const rank = k; /* figé pour ce viewer (sinon lu trop tard par le timer) */
    setTimeout(() => {
      try { createViewer(c, { deferGLB: true, delay: rank * 220 }); }
      catch (err) { console.warn("3D indisponible:", err); }
    }, 130 * rank);
  }

  if (!viewers.length) return;

  const applyPR = () => {
    for (const v of viewers) {
      v.renderer.setPixelRatio(v.basePR * prScale);
      if (v.resize) v.resize();
    }
  };

  /* résolution adaptative : EMA des FPS, paliers après période de chauffe */
  let fpsEMA = 60, adaptT = 0, warm = 2.5;

  const t0 = performance.now();
  let last = t0;
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;

    fpsEMA += (1 / Math.max(dt, 1e-4) - fpsEMA) * 0.05;
    adaptT += dt;
    if (adaptT >= 2) {
      adaptT = 0;
      if (warm > 0) warm -= 2; /* laisse finir le chargement initial */
      else if (viewers.some((v) => v.visible && v.ready)) {
        if (fpsEMA < 42 && prScale > 0.55) {
          prScale = Math.max(0.55, prScale - 0.15);
          applyPR();
        } else if (fpsEMA > 57 && prScale < 1) {
          prScale = Math.min(1, prScale + 0.1);
          applyPR();
        }
      }
    }

    for (const v of viewers) {
      if (!v.visible || !v.ready) continue;
      const st = v.state;
      if (!st.drag) {
        st.vel *= 0.955;
        st.ry += st.vel + st.auto * dt;
        st.rx += (0 - st.rx) * 0.08;
      }
      st.auto += (st.autoT - st.auto) * 0.05;
      st.tiltX += (st.tiltTX - st.tiltX) * 0.06;
      st.tiltY += (st.tiltTY - st.tiltY) * 0.06;
      v.can.position.y = -(v.minY + v.maxY) / 2 + (REDUCED ? 0 : Math.sin(t * 1.1 + st.bobPhase) * 0.07);
      v.can.rotation.set(
        st.rx + st.tiltX,
        st.ry + st.tiltY,
        REDUCED ? 0 : Math.sin(t * 0.7 + st.bobPhase) * 0.02
      );
      v.renderer.render(v.scene, v.camera);
    }
  })(t0);
}

init();
