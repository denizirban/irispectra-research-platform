import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { IrisIntake } from "@/components/iris-intake"

export default function AnalyzePage() {
  return (
    <main className="page-shell">
      <SiteHeader />
      <section className="page-intro">
        <div><p className="eyebrow">FREE PILOT · BILATERAL IRIS STRUCTURE</p><h1>Submit pixels. Receive measurements.</h1></div>
        <p>Two iris photographs enter a private research queue. The pilot measures visible structure and image quality; it does not diagnose health, organs, personality or personal history.</p>
      </section>
      <IrisIntake />
      <SiteFooter />
    </main>
  )
}
