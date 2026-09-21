#!/usr/bin/env python3
"""Convertit les modèles Blender de "3D textures/" en .glb pour le site web.

Chaque fichier .blend (Blender 5.x) contient une canette (Monster_Can_Body,
Monster_Can_Lid, Monster_Can_Bottom) texturée par les images du même dossier.
Ce script exporte uniquement les pièces de la canette, textures embarquées,
au format glTF binaire (.glb) dans models/.

Utilisation — au choix :

  1. Avec Blender (sur ton PC) :
       blender --background --python tools/export_blend_to_glb.py

  2. Avec le module Python bpy (pip install "bpy>=5.0") :
       python3 tools/export_blend_to_glb.py

Le site charge ensuite models/can-<parfum>.glb via GLTFLoader (js/cans3d.js).
Après une modification d'un .blend (forme, UV, texture), relance ce script
pour régénérer les .glb — pas besoin de toucher au HTML/JS.
"""

import os
import sys

import bpy

# dossier du script -> racine du dépôt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "3D textures")
OUT = os.path.join(ROOT, "models")

# parfum du site  ->  fichier .blend source
MODELS = {
    "original": "monster classic.blend",
    "ultra": "monster ultra white.blend",
    "mango": "monster mango loco.blend",
    "pipeline": "monster pipeline punch.blend",
    "assault": "monster assault.blend",
    "pacific": "monster pacific punch.blend",
}


def export_one(blend_path, glb_path):
    bpy.ops.wm.open_mainfile(filepath=blend_path)
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH" and obj.name.startswith("Monster_Can"))
        if obj.select_get():
            bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    print("écrit", glb_path, os.path.getsize(glb_path), "octets")


def main():
    os.makedirs(OUT, exist_ok=True)
    for flavor, blend_name in MODELS.items():
        blend_path = os.path.join(SRC, blend_name)
        if not os.path.exists(blend_path):
            print("manquant:", blend_path)
            continue
        export_one(blend_path, os.path.join(OUT, f"can-{flavor}.glb"))
    print("terminé.")


if __name__ == "__main__":
    main()
