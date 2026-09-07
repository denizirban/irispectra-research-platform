import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "irispectra — iris morphogenesis research",
  description: "Experimental structural iris measurement and pupillometry research platform.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
