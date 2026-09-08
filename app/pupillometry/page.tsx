import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PupilProtocol } from "@/components/pupil-protocol"

export default function PupillometryPage() {
  return <main className="page-shell"><SiteHeader />
    <section className="page-intro"><div><p className="eyebrow"><i aria-hidden="true" />SEPARATE MODALITY · LOCAL PROTOTYPE</p><h1>Pupil response<br/><span>over time.</span></h1></div><p>A minimal, passive starting point for observing relative pupil change with iPhone Continuity Camera or a Mac camera under stable visible light. Experimental, device-dependent and non-diagnostic.</p></section>
    <PupilProtocol />
    <SiteFooter />
  </main>
}
