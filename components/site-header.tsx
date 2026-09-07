import Link from "next/link"

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand-lockup" href="/" aria-label="irispectra home">
        <img src="/irispectra-logo.png" alt="" />
        <span>irispectra</span>
      </Link>
      <nav aria-label="Primary navigation">
        <Link href="/analyze">iris measurement</Link>
        <Link href="/pupillometry">pupillometry</Link>
        <Link href="/lab">morphogenesis lab</Link>
        <Link href="/review">researcher review</Link>
      </nav>
    </header>
  )
}
