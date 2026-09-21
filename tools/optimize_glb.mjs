#!/usr/bin/env node
/* =========================================================
   Optimise les .glb de models/ pour le web :
   - étiquette (gros JPEG Blender) : redimensionnée à 1024px
     de large, ré-encodée en JPEG mozjpeg q82 ;
   - textures haut/bas de cannette (PNG quasi-photo) :
     ré-encodées en JPEG q88 quand elles sont opaques ;
   - la géométrie n'est PAS touchée (déjà très léger).
   La qualité visuelle des canettes reste identique à
   l'écran, mais les fichiers passent de ~5,4 Mo à ~1 Mo.

   Utilisation (une fois les dépendances installées) :
     npm i @gltf-transform/core @gltf-transform/functions sharp
     node tools/optimize_glb.mjs
   À relancer après tools/export_blend_to_glb.py.
   ========================================================= */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { dedup, prune } from "@gltf-transform/functions";
import { KHRMaterialsClearcoat } from "@gltf-transform/extensions";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS = path.join(ROOT, "models");

const io = new NodeIO().registerExtensions([KHRMaterialsClearcoat]);
const LABEL_MAX_W = 1024; /* largeur max étiquette (1600px ~ inutile à l'écran) */
const SMALL_MAX_W = 512;  /* garde-fou pour les petites textures métal */

async function processFile(file) {
  const src = path.join(MODELS, file);
  const originalBytes = fs.statSync(src).size;
  const doc = await io.read(src);

  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const meta = await sharp(image).metadata();
    const name = (texture.getName() || "").toLowerCase();
    const isLabel = meta.width >= 700; /* étiquette = grande texture */

    if (isLabel) {
      const targetW = Math.min(meta.width, LABEL_MAX_W);
      const out = await sharp(image)
        .resize({ width: targetW, withoutEnlargement: true })
        .flatten({ background: "#808080" }) /* drop alpha inutile (matériau opaque) */
        .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: "4:2:0" })
        .toBuffer();
      texture.setImage(new Uint8Array(out));
      texture.setMimeType("image/jpeg");
    } else {
      /* petites textures métal : ré-encodage léger, dimensions gardées */
      const targetW = Math.min(meta.width, SMALL_MAX_W);
      const stats = await sharp(image).stats();
      const opaque = !meta.hasAlpha || (stats.channels[3].min === 255 && stats.channels[3].max === 255);
      let out, mime;
      if (opaque) {
        out = await sharp(image)
          .resize({ width: targetW, withoutEnlargement: true })
          .flatten({ background: "#808080" })
          .jpeg({ quality: 88, mozjpeg: true })
          .toBuffer();
        mime = "image/jpeg";
      } else {
        out = await sharp(image)
          .resize({ width: targetW, withoutEnlargement: true })
          .png({ palette: true, quality: 90, compressionLevel: 9 })
          .toBuffer();
        mime = "image/png";
      }
      texture.setImage(new Uint8Array(out));
      texture.setMimeType(mime);
    }
  }

  await doc.transform(
    dedup(),
    prune({ keepAttributes: false, keepLeaves: false }),
  );

  /* garder l'extension .glb sur le fichier temporaire (sinon NodeIO
     écrit du glTF JSON + ressources externes au lieu d'un GLB) */
  const tmp = src.replace(/\.glb$/, ".opt.glb");
  await io.write(tmp, doc);
  fs.renameSync(tmp, src);
  const newBytes = fs.statSync(src).size;
  console.log(
    file.padEnd(22),
    (originalBytes / 1024).toFixed(0).padStart(5), "Ko →",
    (newBytes / 1024).toFixed(0).padStart(5), "Ko",
    "(" + Math.round((1 - newBytes / originalBytes) * 100) + "% plus léger)"
  );
}

const files = fs.readdirSync(MODELS).filter((f) => f.endsWith(".glb"));
for (const f of files) await processFile(f);
console.log("Terminé —", files.length, "fichiers optimisés.");
