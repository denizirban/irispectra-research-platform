import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>IRISPECTRA</strong>
        <p>Experimental measurement, not medical diagnosis.</p>
      </div>
      <nav aria-label="Legal navigation">
        <Link href="/methods/vision">vision protocol</Link>
        <Link href="/pupillometry">pupil prototype</Link>
        <Link href="/privacy">privacy</Link>
        <Link href="/terms">terms</Link>
        <Link href="/withdraw">withdraw data</Link>
        <a href="mailto:hello@irispectra.com">contact</a>
      </nav>
    </footer>
  )
}
