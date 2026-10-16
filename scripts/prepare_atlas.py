#!/usr/bin/env python3
"""Rebuild the browser atlas from the real FreeSurfer fsaverage5 / a2009s files.

Requirements: Python 3.10+, numpy, nibabel. Run from any directory:
    python3 scripts/prepare_atlas.py

Source binaries are pinned by SHA-256 and cached locally. This is a format
conversion, not a synthetic or hand-drawn reconstruction of cortical anatomy.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import nibabel as nib
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
NILEARN_BASE = "https://raw.githubusercontent.com/nilearn/nilearn/0.12.1/nilearn/datasets/data/fsaverage5/"
SOURCES = {
    "pial_left.gii.gz": (NILEARN_BASE + "pial_left.gii.gz", "1e76fe43ac194c15fd272643f7ae7995621e2a496b3102b2d6175f0f8e6d7fc8"),
    "pial_right.gii.gz": (NILEARN_BASE + "pial_right.gii.gz", "fdfae008bc10acf7cba82737ea5db9a7298948c41884a2d3330a785783a60a91"),
    "infl_left.gii.gz": (NILEARN_BASE + "infl_left.gii.gz", "1a571c9d598a476a202c7295c235a709de63360047b92c0e7b75ed18b0f37e74"),
    "infl_right.gii.gz": (NILEARN_BASE + "infl_right.gii.gz", "9f66b009e1da72158d75b4e739c6289aba0c1b08d818b2f0f9f61204aa4ba895"),
    "sulc_left.gii.gz": (NILEARN_BASE + "sulc_left.gii.gz", "bd0f87e0cba153e9d5c5281edc7267f631b1967e5883d4027924766c8430eb62"),
    "sulc_right.gii.gz": (NILEARN_BASE + "sulc_right.gii.gz", "97afe76225903205a16b88f88cd796945f2a27011328e98decaa9128ff063afb"),
    "lh.aparc.a2009s.annot": ("https://www.nitrc.org/frs/download.php/9343/lh.aparc.a2009s.annot", "c2401d6137949f33788283a4926cb61cb3b0bfe5bda1b368c22aa921ea06d38d"),
    "rh.aparc.a2009s.annot": ("https://www.nitrc.org/frs/download.php/9342/rh.aparc.a2009s.annot", "99c028f9f9d8dce617e9f29a5ebdc2f1b187d83650b68128fae53c3669588da7"),
}

# Chinese labels are interface translations; the exact source name remains the
# canonical anatomical label. The atlas's anatomical parcels are not functional
# localizers: for example S_calcarine is not identical to an individual V1 mask.
ZH = {
    "G_and_S_frontomargin": "额缘回与额缘沟",
    "G_and_S_occipital_inf": "枕下回与枕下沟",
    "G_and_S_paracentral": "中央旁小叶与中央旁沟",
    "G_and_S_subcentral": "中央下回与中央下沟",
    "G_and_S_transv_frontopol": "额极横回与额极横沟",
    "G_and_S_cingul-Ant": "前扣带回与沟",
    "G_and_S_cingul-Mid-Ant": "中扣带前部回与沟",
    "G_and_S_cingul-Mid-Post": "中扣带后部回与沟",
    "G_cingul-Post-dorsal": "后扣带回背侧部",
    "G_cingul-Post-ventral": "后扣带回腹侧部",
    "G_cuneus": "楔叶",
    "G_front_inf-Opercular": "额下回盖部",
    "G_front_inf-Orbital": "额下回眶部",
    "G_front_inf-Triangul": "额下回三角部",
    "G_front_middle": "额中回",
    "G_front_sup": "额上回",
    "G_Ins_lg_and_S_cent_ins": "岛长回与岛中央沟",
    "G_insular_short": "岛短回",
    "G_occipital_middle": "枕中回",
    "G_occipital_sup": "枕上回",
    "G_oc-temp_lat-fusifor": "梭状回",
    "G_oc-temp_med-Lingual": "舌回",
    "G_oc-temp_med-Parahip": "海马旁回",
    "G_orbital": "眶回",
    "G_pariet_inf-Angular": "角回",
    "G_pariet_inf-Supramar": "缘上回",
    "G_parietal_sup": "顶上小叶",
    "G_postcentral": "中央后回",
    "G_precentral": "中央前回",
    "G_precuneus": "楔前叶",
    "G_rectus": "直回",
    "G_subcallosal": "胼胝体下回",
    "G_temp_sup-G_T_transv": "颞横回（Heschl 回）",
    "G_temp_sup-Lateral": "颞上回外侧部",
    "G_temp_sup-Plan_polar": "颞极平面",
    "G_temp_sup-Plan_tempo": "颞平面",
    "G_temporal_inf": "颞下回",
    "G_temporal_middle": "颞中回",
    "Lat_Fis-ant-Horizont": "外侧裂前水平支",
    "Lat_Fis-ant-Vertical": "外侧裂前升支",
    "Lat_Fis-post": "外侧裂后支",
    "Pole_occipital": "枕极",
    "Pole_temporal": "颞极",
    "S_calcarine": "距状沟",
    "S_central": "中央沟",
    "S_cingul-Marginalis": "扣带沟缘支",
    "S_circular_insula_ant": "岛环沟前部",
    "S_circular_insula_inf": "岛环沟下部",
    "S_circular_insula_sup": "岛环沟上部",
    "S_collat_transv_ant": "侧副沟前横部",
    "S_collat_transv_post": "侧副沟后横部",
    "S_front_inf": "额下沟",
    "S_front_middle": "额中沟",
    "S_front_sup": "额上沟",
    "S_interm_prim-Jensen": "中间沟（Jensen 沟）",
    "S_intrapariet_and_P_trans": "顶内沟与顶横沟",
    "S_oc_middle_and_Lunatus": "枕中沟与月状沟",
    "S_oc_sup_and_transversal": "枕上沟与枕横沟",
    "S_occipital_ant": "枕前沟",
    "S_oc-temp_lat": "枕颞外侧沟",
    "S_oc-temp_med_and_Lingual": "枕颞内侧沟与舌沟",
    "S_orbital_lateral": "外侧眶沟",
    "S_orbital_med-olfact": "内侧眶沟（嗅沟）",
    "S_orbital-H_Shaped": "H 形眶沟",
    "S_parieto_occipital": "顶枕沟",
    "S_pericallosal": "胼胝体周沟",
    "S_postcentral": "中央后沟",
    "S_precentral-inf-part": "中央前沟下部",
    "S_precentral-sup-part": "中央前沟上部",
    "S_suborbital": "眶下沟",
    "S_subparietal": "顶下沟",
    "S_temporal_inf": "颞下沟",
    "S_temporal_sup": "颞上沟",
    "S_temporal_transverse": "颞横沟",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def download(cache: Path, filename: str) -> Path:
    url, digest = SOURCES[filename]
    path = cache / filename
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"Source checksum mismatch: {filename}")
        path.write_bytes(data)
    if sha256(path) != digest:
        raise ValueError(f"Cached source checksum mismatch: {path}; delete and retry")
    return path


def normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    result = np.zeros_like(vertices, dtype=np.float64)
    triangles = vertices[faces]
    face_normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    for corner in range(3):
        np.add.at(result, faces[:, corner], face_normals)
    lengths = np.linalg.norm(result, axis=1, keepdims=True)
    return result / np.maximum(lengths, 1e-12)


def flat(values: np.ndarray, decimals: int = 4) -> list:
    # Convert to float64 first to avoid verbose float32 decimal serialization.
    return np.round(values.astype(np.float64), decimals).reshape(-1).tolist()


def build(cache: Path, output: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(lambda name: download(cache, name), SOURCES))

    result = {
        "schema_version": 1,
        "name": "Destrieux 2009 · fsaverage5",
        "source": "FreeSurfer aparc.a2009s; fsaverage5 meshes distributed by Nilearn 0.12.1; annotations distributed by NITRC",
        "template": "fsaverage5",
        "atlas": "aparc.a2009s",
        "coordinates": "FreeSurfer surface RAS, millimetres: +x right, +y anterior, +z superior",
        "excluded_labels": [0, 42],
        "precision_mm": 0.0001,
        "hemispheres": {},
        "regions": [],
    }
    for hemi, side in [("lh", "left"), ("rh", "right")]:
        pial, faces = nib.load(cache / f"pial_{side}.gii.gz").agg_data()
        inflated, inflated_faces = nib.load(cache / f"infl_{side}.gii.gz").agg_data()
        sulc = nib.load(cache / f"sulc_{side}.gii.gz").agg_data()
        labels, colors, raw_names = nib.freesurfer.read_annot(cache / f"{hemi}.aparc.a2009s.annot")
        names = [name.decode("utf-8") for name in raw_names]
        assert pial.shape == inflated.shape == (10242, 3)
        assert faces.shape == (20480, 3)
        assert labels.shape == sulc.shape == (10242,)
        assert np.array_equal(faces, inflated_faces)
        assert np.min(faces) == 0 and np.max(faces) == 10241
        assert names[0] == "Unknown" and names[42] == "Medial_wall"
        assert all(np.isfinite(values).all() for values in [pial, inflated, sulc])
        cortical_indices = [i for i, name in enumerate(names) if name not in {"Unknown", "Medial_wall"}]
        assert len(cortical_indices) == 74
        assert set(np.unique(labels)) == set(cortical_indices) | {42}
        result["hemispheres"][hemi] = {
            "positions": flat(pial),
            "normals": flat(normals(pial, faces), 5),
            "indices": faces.reshape(-1).tolist(),
            "labels": labels.tolist(),
            "sulc": flat(sulc),
            "inflated": flat(inflated),
            "inflated_normals": flat(normals(inflated, faces), 5),
        }
        for index in cortical_indices:
            mask = labels == index
            name = names[index]
            assert name in ZH, f"Missing translation: {name}"
            result["regions"].append({
                "id": f"{hemi}_{index}",
                "hemisphere": hemi,
                "label_index": index,
                "name": name,
                "name_zh": ZH[name],
                "color": [int(c) for c in colors[index, :3]],
                "vertex_count": int(mask.sum()),
                "centroid": flat(pial[mask].mean(axis=0), 3),
                "inflated_centroid": flat(inflated[mask].mean(axis=0), 3),
            })

    assert len(result["regions"]) == 148
    assert len({r["id"] for r in result["regions"]}) == 148
    for filename, payload in [("atlas.json", result), ("regions.json", result["regions"])]:
        path = output / filename
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
        print(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}: {path.stat().st_size:,} bytes; SHA-256 {sha256(path)}")
    manifest = {
        "description": "Original FreeSurfer-derived inputs, unmodified. Generated JSON is a modified format conversion with rounded coordinates and Chinese display labels.",
        "sources": [{"filename": name, "url": value[0], "sha256": value[1]} for name, value in SOURCES.items()],
        "outputs": {name: sha256(output / name) for name in ["atlas.json", "regions.json"]},
    }
    (output / "atlas-manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print("Verified: 2 hemispheres × 10,242 vertices × 20,480 triangles; 148 cortical parcels.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache" / "atlas")
    parser.add_argument("--output", type=Path, default=ROOT / "public" / "data")
    args = parser.parse_args()
    build(args.cache.resolve(), args.output.resolve())
