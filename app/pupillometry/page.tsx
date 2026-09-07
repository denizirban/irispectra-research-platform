import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PupilProtocol } from "@/components/pupil-protocol"

export default function PupillometryPage() {
  return <main className="page-shell"><SiteHeader />
    <section className="page-intro"><div><p className="eyebrow">SEPARATE MODALITY · LOCAL PILOT</p><h1>Pupil response over time.</h1></div><p>A still iris cannot measure dynamics. This browser pilot estimates a pupil-width proxy during a timed screen stimulus. It is experimental, device-dependent and not diagnostic.</p></section>
    <PupilProtocol />
    <SiteFooter />
  </main>
}
