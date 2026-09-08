import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PupilProtocol } from "@/components/pupil-protocol"

export default function PupillometryPage() {
  return <main className="page-shell"><SiteHeader />
    <section className="page-intro"><div><p className="eyebrow">AYRI MODALİTE · YEREL PROTOTİP</p><h1>Zaman içinde pupil takibi.</h1></div><p>iPhone Continuity Camera veya Mac kamerasıyla, sabit görünür ışık altında göreli pupil değişimini izleyen en basit güvenli başlangıç. Deneyseldir, cihaza bağlıdır ve tanı amaçlı değildir.</p></section>
    <PupilProtocol />
    <SiteFooter />
  </main>
}
