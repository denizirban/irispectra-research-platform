import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PupilProtocol } from "@/components/pupil-protocol"

export default function PupillometryPage() {
  return <main className="page-shell"><SiteHeader />
    <section className="page-intro"><div><p className="eyebrow"><span className="status-dot" />PUPIL DYNAMICS · N-OF-1 BROWSER PILOT</p><h1>Measure the response to a known condition.</h1></div><p>Record sleep, caffeine, medication, room light and self-rated state; then run a light-reflex or cognitive-effort sequence. Every diameter trace is paired with its stimulus, task performance and measurement context.</p></section>
    <PupilProtocol />
    <section className="method-document pupil-roadmap">
      <header><p className="eyebrow">RESEARCH-GRADE DIRECTION</p><h2>From a browser proof to a controlled instrument.</h2></header>
      <div className="pipeline-grid four-up">
        <article><span>01</span><h3>Infrared acquisition</h3><p>Fixed camera geometry, eye-safe illumination, repeatable distance and exposure metadata.</p></article>
        <article><span>02</span><h3>Protocol blocks</h3><p>Session context, baseline, repeated light reflex, recovery and a separate constant-luminance cognitive condition.</p></article>
        <article><span>03</span><h3>Dynamic outputs</h3><p>Amplitude, latency, constriction and dilation velocity, recovery, repeatability, signal quality and inter-eye asymmetry.</p></article>
        <article><span>04</span><h3>Validation</h3><p>Blink handling, tracking loss, device repeatability, test–retest reliability and held-out participants.</p></article>
      </div>
      <div className="method-boundary"><strong>RESEARCH STATUS</strong><p>Repeated self-measurement can debug the protocol and estimate within-person repeatability. It cannot establish population norms, diagnostic accuracy or clinical validity. Millimetres, clinical thresholds and disease inference remain disabled until calibrated hardware and external validation exist.</p></div>
    </section>
    <SiteFooter />
  </main>
}
