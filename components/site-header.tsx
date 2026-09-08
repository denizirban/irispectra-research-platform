import Link from "next/link"

export function SiteHeader() {
  return (
    <div className="site-chrome">
      <div className="research-strip">IRIS · PUPIL · MORPHOGENESIS — NON-DIAGNOSTIC RESEARCH</div>
      <header className="site-header">
        <Link className="brand-lockup" href="/" aria-label="irispectra home">
          <img src="/irispectra-logo.png" alt="" />
          <span>IRISPECTRA</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/analyze">iris structure</Link>
          <Link href="/pupillometry">pupil dynamics</Link>
          <Link href="/lab">morphogenesis</Link>
          <Link href="/review">researcher review</Link>
        </nav>
      </header>
    </div>
  )
}
