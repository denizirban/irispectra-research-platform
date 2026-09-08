import Link from "next/link"

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand-lockup" href="/" aria-label="irispectra home">
        <img src="/irispectra-logo.png" alt="" />
        <span>IRISPECTRA</span>
      </Link>
      <nav aria-label="Primary navigation">
        <Link href="/#science">science</Link>
        <Link href="/methods/vision">protocol</Link>
        <Link href="/analyze">iris</Link>
        <Link href="/pupillometry">pupil</Link>
        <Link href="/lab">morphogenesis lab ↗</Link>
      </nav>
      <Link className="header-cta" href="/analyze">Upload photos →</Link>
    </header>
  )
}
