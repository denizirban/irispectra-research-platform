import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { MorphogenesisLab } from "@/components/morphogenesis-lab"

export default function LabPage() {
  return <main className="page-shell"><SiteHeader />
    <section className="page-intro dark-intro"><div><p className="eyebrow">IRIS MORPHOGENESIS LAB · HYPOTHESIS SIMULATOR</p><h1>Competing generative footprints.</h1></div><p>Can chemical instability, tissue mechanics and transient networks generate distinguishable spatial statistics? This remains an open research question. The simulator tests consequences of assumptions; it does not reconstruct an individual embryo.</p></section>
    <MorphogenesisLab />
    <SiteFooter />
  </main>
}
