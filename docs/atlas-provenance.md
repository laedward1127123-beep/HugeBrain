# Atlas provenance and interpretation

HugeBrain uses the **real Destrieux 2009 (`aparc.a2009s`) cortical parcellation on FreeSurfer fsaverage5**, not an illustrative substitute. Each hemisphere has 10,242 vertices and 20,480 triangles. The pial and inflated surfaces share vertex indices and triangle topology, so the interface can interpolate between them without changing a region's identity.

The surface files come from the pinned [Nilearn 0.12.1 distribution](https://github.com/nilearn/nilearn/tree/0.12.1/nilearn/datasets/data/fsaverage5). The original a2009s annotations come from the [Nilearn dataset release on NITRC](https://www.nitrc.org/frs/?group_id=728). These are the same source files used by [Nilearn's documented Destrieux surface workflow](https://nilearn.github.io/0.12.1/auto_examples/01_plotting/plot_surf_atlas.html). `public/data/atlas-manifest.json` records every download URL, input SHA-256 and generated output SHA-256.

The atlas reference is Destrieux C, Fischl B, Dale A, Halgren E. **Automatic parcellation of human cortical gyri and sulci using standard anatomical nomenclature.** *NeuroImage*. 2010;53(1):1–15. [doi:10.1016/j.neuroimage.2010.06.010](https://doi.org/10.1016/j.neuroimage.2010.06.010). The association between `aparc.a2009s` and the Destrieux atlas is documented by [FreeSurfer](https://surfer.nmr.mgh.harvard.edu/fswiki/CorticalParcellation).

## Rebuild

```sh
python3 -m pip install -r scripts/atlas-requirements.txt
python3 scripts/prepare_atlas.py
```

The script downloads eight original files into `.cache/atlas`, verifies their pinned SHA-256 values, reads the GIFTI/FreeSurfer files with NiBabel, and exports JSON. No FreeSurfer installation or Nilearn installation is necessary. Cached inputs are verified again on every run. Network access is only needed when an input is absent.

The build checks mesh dimensions, finite coordinates, matching pial/inflated topology, legal triangle indices, source label names, the expected labels in both hemispheres, and unique region IDs. JSON serialization rejects nonfinite numbers. Coordinates and sulcal values are rounded to four decimal places, normals to five, and region centroids to three. The JSON files are therefore **modified format conversions**, with interface translations and derived normals/centroids; they are not original FreeSurfer distribution files.

## Data contract

`public/data/atlas.json` contains `hemispheres.lh` and `hemispheres.rh`. Each contains flattened `positions`, `normals`, `inflated`, `inflated_normals`, triangle `indices`, one anatomical `labels` index per vertex, and one `sulc` value per vertex. Coordinates retain native **FreeSurfer surface RAS millimetres**: positive x points right, positive y anterior, and positive z superior. The display can rotate or scale the surfaces without altering the saved source coordinates. These are **not MNI volumetric coordinates**.

`public/data/regions.json` is an array containing the 148 cortical regions. It is also embedded as `atlas.regions`. IDs are `lh_<label_index>` or `rh_<label_index>`; the integer is the original annotation color-table index, not a contiguous renumbered ID. Every region preserves its exact source `name`, a Chinese interface translation `name_zh`, source RGB color, vertex count, and pial/inflated centroids. Hemisphere values are `lh` and `rh`.

The source color table has 76 entries: `0 = Unknown`, `42 = Medial_wall`, and 74 cortical parcels. Unknown has no vertices in these files. The medial wall remains present in the mesh for a closed surface but is omitted from the selectable registry. The renderer should color it neutrally and exclude it from paper counts and cortical interactions. In particular, **`45 = S_calcarine`; `42` is not the calcarine sulcus**.

## Anatomical limits

This is a cortical anatomical atlas. It does not include hippocampus proper, thalamus, basal ganglia, cerebellum, or subject-specific functional localizers. The parahippocampal gyrus (`G_oc-temp_med-Parahip`) must not be used as a substitute for hippocampus. Similarly, the calcarine sulcus is an anatomical landmark associated with early visual cortex; its atlas parcel is not an exact V1 functional mask. A publication's functional ROI, coordinate, or broad anatomical description needs an explicit, reviewable mapping to an atlas parcel before it is treated as evidence for that parcel. Chinese translations are display aids; source labels are authoritative.

## Licenses and notices

The original FreeSurfer-derived data are covered by the [FreeSurfer Software License Agreement](https://surfer.nmr.mgh.harvard.edu/fswiki/FreeSurferSoftwareLicense). The complete agreement is included in `public/data/licenses/FreeSurfer-LICENSE.txt`. The Nilearn redistribution license is included in `public/data/licenses/Nilearn-LICENSE.txt`. These notices should remain distributed with the generated assets.

All or portions of this licensed product (such portions are the "Software") have been obtained under license from The General Hospital Corporation and are subject to the following terms and conditions: [FreeSurfer Software License Agreement](../public/data/licenses/FreeSurfer-LICENSE.txt).

