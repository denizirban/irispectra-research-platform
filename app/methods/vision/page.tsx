import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

const stages = [
  ["01", "Acquisition gate", "Focus, glare, visible annulus, scale, camera metadata and repeat-image consistency."],
  ["02", "Anatomy segmentation", "Separate pupil, limbus, eyelids, eyelashes and specular reflections before texture analysis."],
  ["03", "Coordinate model", "Create a polar iris strip while preserving a reversible map to the original pixels."],
  ["04", "Collarette contour", "Estimate the irregular collarette independently rather than assuming a perfect circle."],
  ["05", "Pattern instances", "Give each crypt, lacuna, furrow and pigment candidate its own mask and confidence."],
  ["06", "Shape + topology", "Measure closure, area, circularity, elongation, skeleton branches, adjacency and collarette attachment."],
  ["07", "Calibrated inference", "Report class probabilities, model version and an unresolved state for weak or unfamiliar evidence."],
  ["08", "Locked validation", "Evaluate on unseen participants, cameras and acquisition conditions before releasing a label."],
]

const phenotypes = [
  ["Closed lacuna", "One opening whose contour converges and closes.", "closure · contour continuity · hole count"],
  ["Asparagus-like", "Solitary, collarette-attached and elongated with an outward-pointing tip.", "attachment · tip direction · elongation"],
  ["Three-adjacent configuration", "Three distinct neighbouring crypt or small-lacuna instances at the collarette edge.", "instance count · adjacency graph · collarette distance"],
  ["Double lacuna", "Two attached closed instances with comparable size.", "count · attachment · closure · size ratio"],
  ["Leaf-like", "Usually closed and collarette-attached with a leaf contour and possible internal branches.", "shape · attachment · internal skeleton"],
  ["Circular lacuna", "A small encapsulated near-circular opening associated with the collarette.", "circularity · closure · scale · attachment"],
  ["Contraction furrow", "A curvilinear or annular groove with tangential continuity.", "arc length · skeleton · radius consistency"],
  ["Unresolved", "Quality is insufficient, evidence conflicts, or the phenotype is outside training data.", "quality gate · OOD score · uncertainty"],
]

const validation = [
  ["Iris / pupil / collarette", "Dice · IoU · boundary distance"],
  ["Crypt / lacuna / furrow instances", "mask AP by class · precision · recall · count MAE"],
  ["Double / triple grouping", "exact group accuracy · graph precision / recall"],
  ["Expert reliability", "Cohen/Fleiss κ · adjudication rate"],
  ["Probability quality", "calibration error · selective-risk curve"],
  ["Repeatability", "same-eye repeat ICC · localisation error"],
  ["Domain robustness", "camera · iris colour · glare · occlusion strata"],
]

export default function VisionProtocolPage() {
  return <main className="page-shell"><SiteHeader />
    <section className="methods-hero">
      <p className="eyebrow"><span className="status-dot" />IRIS COMPUTER VISION · PROTOCOL 0.2</p>
      <h1>Measure the object before naming the pattern.</h1>
      <div className="methods-hero-foot"><p>A professional detector must know where a structure begins, whether its boundary closes, what it touches and how certain it is. Regional darkness alone cannot distinguish a crypt, lacuna, pigment mark or shadow.</p><Link className="btn primary" href="/analyze">Open iris measurement</Link></div>
    </section>

    <section className="method-document">
      <header><p className="eyebrow">00 / CURRENT LIVE BASELINE</p><h2>Object candidates are now explicit.</h2></header>
      <div className="pipeline-grid four-up">
        <article><span>MASK</span><h3>Adaptive local contrast</h3><p>A pixel must differ from its own neighbourhood inside the calibrated, unmasked iris annulus.</p></article>
        <article><span>INSTANCE</span><h3>Connected components</h3><p>Each surviving region becomes a separate object with its own centre, area and contour proxy.</p></article>
        <article><span>SHAPE</span><h3>Geometry vector</h3><p>Elongation, circularity, radial alignment and collarette distance support a provisional shape family.</p></article>
        <article><span>ABSTAIN</span><h3>Confidence ceiling</h3><p>Confidence is capped and weak evidence remains unresolved because pigment, shadow and tissue depth are not fully separated.</p></article>
      </div>
      <div className="method-boundary"><strong>LIVE MODEL 0.5</strong><p>This is an interpretable classical computer-vision baseline, not a trained clinical classifier. Its purpose is to create inspectable candidate masks and measurable features for the expert-labelled dataset that the later instance model will require.</p></div>
    </section>

    <section className="method-document">
      <header><p className="eyebrow">01 / PROCESS</p><h2>Eight validation gates.</h2></header>
      <div className="pipeline-grid">{stages.map(([index, title, text]) => <article key={index}><span>{index}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="method-document split-document">
      <header><p className="eyebrow">02 / PHENOTYPE TAXONOMY</p><h2>Shape is measured. Meaning is separated.</h2></header>
      <div className="document-note"><span className="tag measured">observed</span><p>Pattern names describe visible form. Interpretations inherited from historical iris maps remain a separate <b>historical claim</b> layer; they are not diagnoses or validated organ findings.</p></div>
      <div className="protocol-table-wrap"><table className="protocol-table"><thead><tr><th>Candidate</th><th>Operational definition</th><th>Required evidence</th></tr></thead><tbody>{phenotypes.map(row => <tr key={row[0]}>{row.map(cell => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>
    </section>

    <section className="method-document dark-document">
      <header><p className="eyebrow">03 / MODEL STACK</p><h2>Interpretable before impressive.</h2></header>
      <div className="stack-grid">
        <article><span>SEGMENT</span><h3>open-iris + independent NIST benchmark</h3><p>Iris, pupil and occlusion geometry; visible-light domain validation is required.</p></article>
        <article><span>ANNOTATE</span><h3>CVAT + SAM 2 assistance</h3><p>Expert masks, attributes, review states and adjudicated corrections.</p></article>
        <article><span>DETECT</span><h3>nnU-Net + instance segmentation</h3><p>Semantic benchmark plus separate crypt, lacuna, furrow and pigment instances.</p></article>
        <article><span>MEASURE</span><h3>OpenCV + scikit-image</h3><p>Contours, region properties, skeletons, holes and adjacency graphs.</p></article>
      </div>
    </section>

    <section className="method-document">
      <header><p className="eyebrow">04 / RELEASE CRITERIA</p><h2>A label is not released because it looks plausible.</h2></header>
      <div className="validation-list">{validation.map(([task, metrics]) => <div key={task}><strong>{task}</strong><span>{metrics}</span></div>)}</div>
      <div className="method-boundary"><strong>METHOD BOUNDARY</strong><p>A two-dimensional photograph can provide a photometric depth proxy, not true anatomical depth. Confident pattern subtypes require a locked participant-level test set, repeat-image reliability and calibrated uncertainty. The system abstains when those conditions are not met.</p></div>
    </section>
    <SiteFooter />
  </main>
}
