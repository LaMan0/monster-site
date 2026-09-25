/* Mesure l'angle de lacet réel du claw (logo) pour chaque .glb :
   1. extrait la texture étiquette du .glb, détecte la colonne du claw
      (critère couleur par parfum, bande verticale centrale, pic de
      l'histogramme X) -> u_claw = centroïde / largeur ;
   2. lit la table u -> angle du mesh étiquette dans le .glb ;
   3. sort le yaw du pivot pour js/cans3d.js (le viewer démarre à ry=PI).
      À l'exécution le site refait ces deux mesures en direct
      (clawUFromTexture + yawFromLabel) ; ce script sert de vérification
      hors-ligne et fournit les valeurs de secours CLAW_U_FALLBACK.

   Utilisation (dépendances identiques à optimize_glb.mjs) :
     npm i sharp
     node tools/measure_claw_yaw.mjs     (depuis la racine du dépôt) */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const MODELS = path.join(ROOT, "models");

/* critères de détection du claw dans la texture (r,g,b en 0-255) */
const CLAW_IS = {
  original: (r, g, b) => g > 140 && g > r + 30 && g > b + 40,
  ultra: (r, g, b) => r > 55 && r < 115 && Math.abs(r - g) < 14 && Math.abs(g - b) < 16,
  mango: (r, g, b) => r > 205 && g > 125 && b < 95,
  pipeline: (r, g, b) => r >= 238 && g >= 110 && g <= 195 && b >= 120 && b <= 210,
  pacific: (r, g, b) => r > 185 && g < 75 && b < 75,
  assault: (r, g, b) => r > 185 && g < 75 && b < 75,
};

function parseGLB(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  const off = 20 + jsonLen;
  const bin = buf.slice(off + 8, off + 8 + buf.readUInt32LE(off));
  return { json, bin };
}

function accessor(json, bin, idx) {
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const cn = { 5126: 4, 5123: 2, 5125: 4, 5121: 1 }[a.componentType];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  const stride = bv.byteStride || n * cn;
  const dv = new DataView(bin.buffer, bin.byteOffset);
  const rd = {
    5126: (o) => dv.getFloat32(o, true),
    5123: (o) => dv.getUint16(o, true),
    5125: (o) => dv.getUint32(o, true),
    5121: (o) => dv.getUint8(o),
  }[a.componentType];
  const vals = [];
  for (let i = 0; i < a.count; i++) {
    const base = bv.byteOffset + (a.byteOffset || 0) + i * stride;
    const row = [];
    for (let k = 0; k < n; k++) row.push(rd(base + k * cn));
    vals.push(row);
  }
  return vals;
}

function jpegPngDims(b) {
  if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { w: 0, h: 0 };
}

/* monde (translation seulement ici) */
function nodeWorld(json, meshIdx) {
  for (const n of json.nodes) {
    if (n.mesh === meshIdx) return n.translation || [0, 0, 0];
  }
  return [0, 0, 0];
}

for (const file of fs.readdirSync(MODELS).filter((f) => f.endsWith(".glb"))) {
  const flavor = file.replace(/^can-/, "").replace(/\.glb$/, "");
  const { json, bin } = parseGLB(fs.readFileSync(path.join(MODELS, file)));

  /* texture étiquette = la plus grande image du glb */
  let imgIdx = -1, bestW = 0;
  json.images.forEach((img, i) => {
    const bv = json.bufferViews[img.bufferView];
    const { w } = jpegPngDims(bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength));
    if (w > bestW) { bestW = w; imgIdx = i; }
  });
  const imgBV = json.bufferViews[json.images[imgIdx].bufferView];
  const imgBuf = bin.slice(imgBV.byteOffset, imgBV.byteOffset + imgBV.byteLength);

  /* 1. centroid du claw dans l'image (bande y 25-72%, pic d'histogramme X) */
  const { data, info } = await sharp(imgBuf).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const y0 = Math.floor(H * 0.25), y1 = Math.floor(H * 0.72);
  const isClaw = CLAW_IS[flavor];
  const hist = new Float64Array(W);
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * C;
      if (isClaw(data[o], data[o + 1], data[o + 2])) hist[x]++;
    }
  }
  const total = hist.reduce((a, b) => a + b, 0);
  let peak = 0;
  for (let x = 0; x < W; x++) if (hist[x] > hist[peak]) peak = x;
  /* centroid dans une fenêtre ±12% autour du pic (ignore les petites taches) */
  const win = Math.floor(W * 0.12);
  let sw = 0, sx = 0;
  for (let x = Math.max(0, peak - win); x < Math.min(W, peak + win); x++) { sw += hist[x]; sx += x * hist[x]; }
  const uClaw = sx / sw / W;
  console.log(`\n== ${file}  (img ${W}x${H}, px claw: ${Math.round(total)}, pic x=${peak} (${(100 * peak / W).toFixed(1)}%), u_claw=${uClaw.toFixed(4)})`);

  /* 2. mesh étiquette = primitive avec la texture la plus grande */
  /*    (matériau dont baseColorTexture.source === imgIdx) */
  const labelMats = new Set();
  json.materials.forEach((m, mi) => {
    const t = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture;
    if (t != null) {
      const src = json.textures[t.index].source;
      if (src === imgIdx) labelMats.add(mi);
    }
  });

  let found = false;
  const walk = (ni, parentT) => {
    const n = json.nodes[ni];
    const t = [parentT[0] + (n.translation?.[0] || 0), parentT[1] + (n.translation?.[1] || 0), parentT[2] + (n.translation?.[2] || 0)];
    if (n.mesh != null && !found) {
      const mesh = json.meshes[n.mesh];
      for (const prim of mesh.primitives) {
        if (!labelMats.has(prim.material)) continue;
        const uv = accessor(json, bin, prim.attributes.TEXCOORD_0);
        const pos = accessor(json, bin, prim.attributes.POSITION);
        const idxA = prim.indices != null ? accessor(json, bin, prim.indices) : null;
        const count = idxA ? idxA.length : pos.length;
        /* table u (arrondi 1e-3) -> angle moyen */
        const cols = new Map();
        for (let i = 0; i < count; i++) {
          const vi = idxA ? idxA[i][0] : i;
          const u = Math.round(uv[vi][0] * 1000) / 1000;
          const x = pos[vi][0], z = pos[vi][2];
          const th = Math.atan2(z, x);
          if (!cols.has(u)) cols.set(u, []);
          cols.get(u).push(th);
        }
        const rows = [...cols.entries()].map(([u, ths]) => {
          let ca = 0, sa = 0;
          for (const a of ths) { ca += Math.cos(a); sa += Math.sin(a); }
          return [u, Math.atan2(sa, ca)];
        }).sort((a, b) => a[0] - b[0]);
        /* theta(uClaw) par interpolation sur le cercle (wrap) */
        let thetaClaw = null;
        for (let i = 0; i < rows.length - 1; i++) {
          const [u0, t0] = rows[i], [u1, t1] = rows[i + 1];
          if (u0 <= uClaw && uClaw <= u1) {
            let d = t1 - t0;
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            const f = (uClaw - u0) / (u1 - u0);
            thetaClaw = t0 + f * d;
            break;
          }
        }
        if (thetaClaw == null && rows.length > 1) {
          /* wrap : entre la dernière colonne (u≈1) et la première (u≈0+2π) */
          const [u0, t0] = rows[rows.length - 1];
          const [u1, t1] = [rows[0][0] + 1, rows[0][1]];
          if (u0 <= uClaw && uClaw <= u1) {
            let d = t1 - t0;
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            const f = (uClaw - u0) / (u1 - u0);
            thetaClaw = t0 + f * d;
          }
        }
        if (thetaClaw != null) {
          const yaw = thetaClaw - 3 * Math.PI / 2;
          console.log(`   theta_claw = ${thetaClaw.toFixed(4)} rad (${(thetaClaw * 180 / Math.PI).toFixed(1)}°)`);
          console.log(`   => PIVOT (ry=PI) : ${yaw.toFixed(4)}`);
          found = true;
        }
        break;
      }
    }
    for (const c of n.children || []) walk(c, t);
  };
  for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, [0, 0, 0]);
}
