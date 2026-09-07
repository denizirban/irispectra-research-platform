import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export default function PrivacyPage() {
  return <main className="page-shell"><SiteHeader /><article className="legal"><p className="eyebrow">PRIVACY NOTICE · VERSION 2026-09-04</p><h1>Biometric images require restraint.</h1>
    <h2>What we collect</h2><p>Name, email, age, optional broad location, separate consent decisions, two iris photographs, technical image metadata, derived structural measurements, request logs and audit events.</p>
    <h2>Why</h2><p>To provide the requested experimental measurement, operate the Morphogenesis Lab, protect system integrity, and—only where separately permitted—conduct research or model development. We do not use iridology maps to infer organs, disease, personality or personal history.</p>
    <h2>Storage and access</h2><p>Original images are stored in a private object bucket and are not linked publicly. Access is limited to authorised project operators through server-side credentials. Images are transferred over HTTPS; no image is attached to notification email.</p>
    <h2>Retention</h2><p>The default research retention is until you withdraw or the research program closes. Operational logs may be retained only as needed for security, legal obligations and deletion evidence. De-identified aggregate results that can no longer be linked back may not be reversible.</p>
    <h2>Your choices</h2><p>The service-processing permission is required to submit. Research use of derived measurements, original-image research, and model development are independent optional choices. Use the withdrawal page with your reference and matching email, or contact <a href="mailto:hello@irispectra.com">hello@irispectra.com</a>.</p>
    <h2>Processors</h2><p>The platform uses hosting, private database/object storage and transactional email providers to operate the service. Provider and regional details should be finalised in the production data-processing register before launch.</p>
  </article><SiteFooter /></main>
}
