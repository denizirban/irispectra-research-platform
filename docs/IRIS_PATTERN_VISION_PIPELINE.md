# Irispectra iris-pattern vision pipeline

## Scope

This pipeline detects and measures visible iris-surface phenotypes. It does not diagnose disease, infer organ status, personality, trauma, treatment or supplement needs. Historical iridology labels may be displayed only as a separate reference taxonomy and must never be presented as validated medical meaning.

## Why the present descriptors are insufficient

Regional entropy, contrast and radial/concentric orientation can identify where structure is concentrated. They cannot reliably decide whether a dark region is a reflection artefact, pigment, a stromal opening, one deep lacuna, two attached lacunae or three adjacent crypts. Those distinctions require object masks, boundary geometry and relationships between objects.

## Open-source stack

| Stage | Recommended baseline | Purpose |
|---|---|---|
| Iris, pupil and occlusion segmentation | `worldcoin/open-iris`; NISTIR 8516 implementation as an independent benchmark | Locate pupil/limbus and exclude eyelids, eyelashes and glare |
| Interpretable crypt baseline | `CVRL/OpenSourceIrisRecognition` | Morphological crypt extraction, connected components and matching |
| Annotation | CVAT with SAM 2 assistance | Expert polygon/mask annotation, review and adjudication |
| Biomedical segmentation baseline | nnU-Net | Strong self-configuring semantic segmentation benchmark |
| Pattern instances | Mask R-CNN or Mask2Former in PyTorch | Separate every crypt, lacuna, furrow and pigment object |
| Geometry and topology | OpenCV + scikit-image | Contours, region properties, skeletons, holes and adjacency graphs |
| Representation learning | DINOv2 features, evaluated against supervised baselines | Texture embedding and out-of-distribution detection |
| Serving | Python inference service exported to ONNX where practical | Keep GPU/heavy inference outside the Vercel UI |

## Measurement sequence

1. Run acquisition checks: focus, glare, usable iris fraction, scale and repeat-image consistency.
2. Segment the pupil, limbus, eyelids, eyelashes and specular reflections.
3. Produce a polar-normalised iris while preserving a reversible mapping to original pixels.
4. Segment the irregular collarette as its own contour.
5. Instance-segment each candidate crypt, lacuna, furrow and pigment object.
6. Measure every instance: area, perimeter, eccentricity, solidity, convexity, circularity, darkness, radial span, orientation, boundary closure and collarette attachment.
7. Build an adjacency graph: object count, shared/near boundaries, centroid spacing, alignment, nesting, holes and skeleton branch points.
8. Classify shape and topology jointly, then calibrate the class probabilities.
9. Abstain when quality is insufficient or the phenotype is outside the labelled distribution.
10. Store expert corrections as versioned annotations for active learning.

## Initial morphology taxonomy

These definitions describe visible form. Source-specific interpretations remain a separate `HISTORICAL_CLAIM` layer.

| Label | Operational visual definition | Required measurements |
|---|---|---|
| Closed lacuna | One opening whose border converges into a closed contour | closure, holes, contour continuity |
| Asparagus-like lacuna | Solitary opening attached to or emerging from the external collarette with an outward-pointing tip | collarette attachment, tip direction, elongation |
| Three-adjacent / daisy-petal configuration | Three distinct adjacent crypt or small-lacuna instances clustered at the collarette edge | instance count = 3, adjacency graph, collarette distance |
| Double lacuna | Two attached closed instances with comparable size and structural integrity | instance count = 2, attachment, size ratio, closure |
| Leaf-like lacuna | Usually closed, collarette-attached, leaf-shaped opening with possible internal vein-like structure | contour shape, attachment, internal skeleton |
| Circular lacuna | Small encapsulated near-circular opening attached to the collarette | circularity, closure, attachment, scale |
| Contraction furrow | Curvilinear or annular groove with tangential continuity | curve skeleton, arc length, radius consistency |
| Unresolved candidate | Evidence is insufficient or conflicting | quality/OOD trigger and uncertainty |

## Annotation protocol

- Annotate the original image and the normalised strip together.
- Keep separate masks for crypt, lacuna, furrow, pigment, reflection, eyelash and eyelid.
- Record collarette attachment, closure, depth proxy, grouping and pattern subtype as attributes; do not force a subtype when uncertain.
- Double-annotate a stratified subset with two trained raters and adjudicate disagreements.
- Split train/validation/test by participant, never by crop or photograph.
- Hold out cameras, iris colours and broad regions to test domain shift.
- Version the taxonomy, source page and annotator confidence with every label.

## Validation gates

| Task | Primary metrics |
|---|---|
| Iris/pupil/collarette segmentation | Dice, IoU, boundary distance |
| Crypt/lacuna/furrow instances | mask AP per class, precision, recall, count MAE |
| Double/triple grouping | exact group accuracy, graph precision/recall |
| Expert reliability | Cohen/Fleiss kappa and adjudication rate |
| Probability quality | calibration error, reliability diagrams, selective-risk curve |
| Repeatability | same-eye repeat-image ICC and localisation error |
| Domain robustness | performance by camera, colour, glare and occlusion strata |

No pattern subtype should appear as a confident site result until it passes a locked participant-level test set and repeat-image reliability threshold. The first deliverable is therefore an annotation and validation system, not a larger list of deterministic rules.

## Product architecture

The main site presents three related but separate programmes:

1. **Iris structure** — still-image acquisition, segmentation, pattern instances, regional coordinates and evidence status.
2. **Pupil dynamics** — time-series response under a controlled stimulus, reported independently from static iris structure.
3. **Morphogenesis** — hypothesis simulations compared against measured spatial statistics, never presented as causal proof.

The existing scientific evidence ledger, task-specific benchmark values, methods, limitations, consent and withdrawal flows remain shared infrastructure across all three programmes.
