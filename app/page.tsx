import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <section className="hero">
        <div className="hero-copy">
          <div>
            <p className="eyebrow">IRIS MORPHOLOGY · EXPERIMENTAL RESEARCH PLATFORM</p>
            <h1>Measure the pattern. Test the mechanism.</h1>
          </div>
          <div>
            <p className="dek">
              Irispectra separates what an image can measure from what a developmental model can only propose.
              Upload an iris for structural quantification, run a separate pupil-response protocol, or join the
              morphogenesis study.
            </p>
            <div className="button-row">
              <Link className="btn primary" href="/analyze">Start free iris measurement</Link>
              <Link className="btn" href="/pupillometry">Open pupillometry protocol</Link>
            </div>
          </div>
        </div>
        <div className="iris-stage" aria-label="Abstract structural iris diagram">
          <div className="iris-orbit">
            <span className="orbit-label a">annular domain</span>
            <span className="orbit-label b">θ × r field</span>
          </div>
        </div>
      </section>

      <section className="section" id="method">
        <div className="section-head">
          <div>
            <p className="eyebrow">THREE QUESTIONS · THREE DATA TYPES</p>
            <h2>One eye. Three different experiments.</h2>
          </div>
          <p>
            A still iris image, a changing pupil, and a developmental simulation do not answer the same question.
            Keeping them separate is the beginning of scientific honesty.
          </p>
        </div>
        <div className="three-grid">
          <article className="method-card">
            <span className="index">01 / STRUCTURE</span>
            <div><h3>Iris measurement</h3><p>Quantifies visible geometry: radial texture, annular bands, crypt-like openings, pigment topology, occlusion and image quality.</p></div>
            <Link href="/analyze">free measurement →</Link>
          </article>
          <article className="method-card">
            <span className="index">02 / DYNAMICS</span>
            <div><h3>Pupillometry</h3><p>Records change over time under a controlled visual stimulus. It measures response dynamics, not iris personality or organ health.</p></div>
            <Link href="/pupillometry">run protocol →</Link>
          </article>
          <article className="method-card">
            <span className="index">03 / DEVELOPMENT</span>
            <div><h3>Morphogenesis Lab</h3><p>Compares chemical, mechanical, vascular and hybrid generative models against real spatial statistics.</p></div>
            <Link href="/lab">open simulator →</Link>
          </article>
        </div>
      </section>

      <section className="evidence-lab" aria-labelledby="evidence-lab-title">
        <div className="evidence-lab-copy">
          <p className="eyebrow">MEASUREMENT MODEL · EVIDENCE LEDGER</p>
          <h2 id="evidence-lab-title">One eye is not one kind of evidence.</h2>
          <p className="evidence-dek">
            Iris surface morphology, pupil dynamics, external-eye photographs and retinal fundus images are
            different modalities. Irispectra keeps their measurements, datasets and claims separate.
          </p>
          <div className="modality-ledger">
            <div><span>IRIS SURFACE</span><p>Visible crypts, furrows, pigmentation, collarette geometry and texture topology.</p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5808257/" target="_blank" rel="noreferrer">population morphology study ↗</a></div>
            <div><span>EXTERNAL EYE</span><p>Research models have tested disease-associated signals in photographs of the external eye; this is not an iris organ map.</p><a href="https://www.nature.com/articles/s41551-022-00880-8" target="_blank" rel="noreferrer">Nature Biomedical Engineering ↗</a></div>
            <div><span>RETINAL FUNDUS</span><p>Retinal photographs have been used to predict cardiovascular risk factors. A fundus photograph is not an iris photograph.</p><a href="https://www.nature.com/articles/s41551-018-0195-0" target="_blank" rel="noreferrer">Nature Biomedical Engineering ↗</a></div>
          </div>
        </div>
        <div className="benchmark-panel">
          <p className="eyebrow">PUBLISHED PERFORMANCE · TASK-SPECIFIC</p>
          <div className="benchmark-list">
            <div><header><span>NIST iris boundary localisation</span><b>99.3%</b></header><i><span style={{ width: "99.3%" }} /></i><a href="https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8516.pdf" target="_blank" rel="noreferrer">NISTIR 8516 ↗</a></div>
            <div><header><span>Expert crypt agreement</span><b>κ 0.775</b></header><i><span style={{ width: "77.5%" }} /></i><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4277759/" target="_blank" rel="noreferrer">ophthalmic grading study ↗</a></div>
            <div><header><span>Expert furrow agreement</span><b>κ 0.836</b></header><i><span style={{ width: "83.6%" }} /></i><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4277759/" target="_blank" rel="noreferrer">ophthalmic grading study ↗</a></div>
            <div><header><span>Published crypt-frequency classifier</span><b>80.0%</b></header><i><span style={{ width: "80%" }} /></i><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC7505790/" target="_blank" rel="noreferrer">Mask R-CNN + SVM study ↗</a></div>
          </div>
          <div className="evidence-facts">
            <div><strong>60′</strong><span>angular coordinates</span></div>
            <div><strong>6</strong><span>radial bands</span></div>
            <div><strong>OD / OS</strong><span>eyes measured independently</span></div>
            <div><strong>4</strong><span>evidence states</span></div>
          </div>
          <p className="benchmark-boundary">Published values describe the cited task and dataset. They are not automatically the performance of Irispectra.</p>
        </div>
      </section>

      <section className="lab-panel" id="lab">
        <div>
          <p className="eyebrow">IRIS MORPHOGENESIS LAB · OPEN QUESTION</p>
          <h2>How does one developmental grammar produce stable anatomy and individual identity?</h2>
          <div className="button-row"><Link className="btn acid" href="/lab">open hypothesis simulator</Link><Link className="btn" href="/analyze">contribute an iris image</Link></div>
        </div>
        <div className="question">
          <p>
            We do not know the complete answer. The lab tests whether reaction–diffusion fields, tissue mechanics,
            transient vascular networks and developmental history leave distinguishable statistical footprints.
            A visual resemblance is not mechanism proof.
          </p>
          <div className="hypothesis-list">
            <div><span>H₁</span><span>Reaction–diffusion field</span></div>
            <div><span>H₂</span><span>Mechanical growth and folding</span></div>
            <div><span>H₃</span><span>Transient vascular scaffold and regression</span></div>
            <div><span>H₄</span><span>Coupled hybrid developmental history</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div><p className="eyebrow">INTERPRETATION RULES</p><h2>Every result carries its epistemic status.</h2></div>
          <p>We label the strength of each statement so a computer-generated number cannot quietly become a biological claim.</p>
        </div>
        <table className="evidence-table">
          <thead><tr><th>Status</th><th>Meaning</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><span className="tag measured">measured</span></td><td>Directly calculated from the submitted pixels or pupil time series.</td><td>Glare fraction, annular texture orientation.</td></tr>
            <tr><td><span className="tag inferred">inferred</span></td><td>Model-dependent estimate with uncertainty.</td><td>Candidate crypt boundary at a given confidence.</td></tr>
            <tr><td><span className="tag hypothesis">hypothesis</span></td><td>A falsifiable developmental explanation.</td><td>Vascular regression contributed to a topology.</td></tr>
            <tr><td><span className="tag unsupported">unsupported</span></td><td>Not justified by current evidence.</td><td>Diagnosing an organ, disease, personality or personal history from iris zones.</td></tr>
          </tbody>
        </table>
      </section>

      <section className="section">
        <div className="section-head">
          <div><p className="eyebrow">OPTIONAL · HUMAN REVIEW</p><h2>One deeper reading. $170.</h2></div>
          <div><p>A 60-minute research review of image quality, visible morphology and model limitations. No recurring plan and no medical diagnosis.</p><div className="button-row"><Link className="btn" href="/review">request a review</Link></div></div>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}
