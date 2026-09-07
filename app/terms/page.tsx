import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export default function TermsPage() {
  return <main className="page-shell"><SiteHeader /><article className="legal"><p className="eyebrow">PARTICIPATION TERMS · VERSION 2026-09-04</p><h1>Experimental research, not healthcare.</h1>
    <h2>Scope</h2><p>Irispectra provides image-quality checks, experimental structural measurements, a local pupillometry feasibility protocol, and optional discussion of model limitations. It is not a medical device or clinical service.</p>
    <h2>No diagnosis</h2><p>Do not use this platform to diagnose, prevent or treat any condition, or to replace an eye examination. Seek a licensed clinician for pain, vision change, injury or health concerns.</p>
    <h2>Participation</h2><p>You must be at least 18 and submit only images you are authorised to provide. Do not submit another person’s eye, identifying documents or unrelated health records.</p>
    <h2>Optional review</h2><p>The $170 researcher review is one-time, subject to availability and agreed scope. It does not purchase a diagnosis or guaranteed scientific conclusion. Payment terms are provided before purchase.</p>
    <h2>Research uncertainty</h2><p>Model fit is not proof of developmental mechanism. Measurements can be wrong because of focus, occlusion, reflections, segmentation or model assumptions.</p>
  </article><SiteFooter /></main>
}
