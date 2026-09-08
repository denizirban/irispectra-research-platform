import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PupilProtocol } from "@/components/pupil-protocol"

export default function PupillometryPage() {
  return <main className="page-shell"><SiteHeader />
    <section className="page-intro"><div><p className="eyebrow"><span className="status-dot" />PUPIL LIGHT RESPONSE · BROWSER PILOT</p><h1>A response curve, not a decorative tracker.</h1></div><p>Two standardised screen-light steps produce a 30-second diameter trace. The prototype derives baseline, amplitude, latency, velocity, recovery, repeatability, valid-frame rate and SNR proxies—without turning them into a diagnosis.</p></section>
    <PupilProtocol />
    <section className="method-document pupil-roadmap">
      <header><p className="eyebrow">RESEARCH-GRADE DIRECTION</p><h2>From a browser proof to a controlled instrument.</h2></header>
      <div className="pipeline-grid four-up">
        <article><span>01</span><h3>Infrared acquisition</h3><p>Fixed camera geometry, eye-safe illumination, repeatable distance and exposure metadata.</p></article>
        <article><span>02</span><h3>2–3 minute sequence</h3><p>Calibration, baseline, repeated light reflex, recovery and an optional cognitive condition.</p></article>
        <article><span>03</span><h3>Dynamic outputs</h3><p>Amplitude, latency, constriction and dilation velocity, recovery, repeatability, signal quality and inter-eye asymmetry.</p></article>
        <article><span>04</span><h3>Validation</h3><p>Blink handling, tracking loss, device repeatability, test–retest reliability and held-out participants.</p></article>
      </div>
      <div className="method-boundary"><strong>RESEARCH STATUS</strong><p>Pupillometry is the serious physiological measurement track, but this prototype is not a diagnostic test. Millimetres, clinical thresholds and disease inference remain disabled until calibrated hardware and external validation exist.</p></div>
    </section>
    <SiteFooter />
  </main>
}
