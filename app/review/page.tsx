"use client"

import { FormEvent, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export default function ReviewPage() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle"), [message, setMessage] = useState("")
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setState("busy"); setMessage("")
    const form = new FormData(e.currentTarget)
    const response = await fetch("/api/review/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setMessage(data.error || "Request failed."); setState("idle"); return }
    setState("done"); setMessage(data.notification === "sent" ? "Request sent. Scope and availability will be confirmed before any payment link." : "Request recorded, but email delivery is pending. Contact hello@irispectra.com with your reference.")
  }
  return <main className="page-shell"><SiteHeader /><section className="page-intro"><div><p className="eyebrow">OPTIONAL · ONE-TO-ONE</p><h1>Researcher review. $170.</h1></div><p>A 60-minute review of acquisition quality, visible morphology, uncertainty and model limitations. No subscription. No diagnosis. Payment is requested only after scope and availability are confirmed.</p></section>
    <form className="form-wrap narrow" onSubmit={submit}><section className="form-section"><h2>Request a review</h2><p>First complete the free bilateral submission, then enter the reference you received.</p>
      <div className="field"><label htmlFor="submissionId">Submission reference *</label><input id="submissionId" name="submissionId" required pattern="[0-9a-fA-F-]{36}" /></div>
      <div className="field"><label htmlFor="email">Matching email *</label><input id="email" name="email" type="email" required /></div>
      <div className="field"><label htmlFor="note">Research question (optional)</label><textarea id="note" name="note" maxLength={800} rows={5} /></div>
      {message && <div className={state === "done" ? "status success" : "status error"}>{message}</div>}
      <button className="btn primary full" disabled={state !== "idle"} type="submit">{state === "busy" ? "Verifying…" : state === "done" ? "Request recorded" : "Request optional review"}</button>
    </section></form><SiteFooter /></main>
}
