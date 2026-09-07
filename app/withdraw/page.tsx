"use client"

import { FormEvent, useEffect, useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"

export default function WithdrawPage() {
  const [token, setToken] = useState(""), [state, setState] = useState<"idle" | "busy" | "done">("idle"), [message, setMessage] = useState("")
  useEffect(() => setToken(new URLSearchParams(location.search).get("token") || ""), [])
  async function send(body: unknown) {
    setState("busy"); setMessage("")
    const response = await fetch("/api/withdraw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json().catch(() => ({}))
    if (!response.ok) { setMessage(data.error || "Request failed."); setState("idle"); return }
    setState("done"); setMessage(token ? "Deletion completed for the verified submission." : "If the reference and email matched, a one-time confirmation link was sent.")
  }
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = new FormData(e.currentTarget); send({ submissionId: form.get("submissionId"), email: form.get("email") }) }
  return <main className="page-shell"><SiteHeader /><section className="page-intro"><div><p className="eyebrow">PARTICIPANT CONTROL</p><h1>Withdraw and delete.</h1></div><p>Deletion uses an email-verified two-step process so someone who merely knows a reference cannot erase your data.</p></section><div className="form-wrap narrow"><section className="form-section">
    {token ? <><h2>Confirm permanent deletion</h2><p>This removes the private images, linked measurements and active participant record for the verified submission. This cannot be undone.</p><button className="btn primary full" disabled={state !== "idle"} onClick={() => send({ token, confirm: true })}>{state === "busy" ? "Deleting…" : "Permanently delete verified submission"}</button></> : <form onSubmit={submit}><h2>Request a deletion link</h2><div className="field"><label htmlFor="submissionId">Submission reference</label><input id="submissionId" name="submissionId" required pattern="[0-9a-fA-F-]{36}" /></div><div className="field"><label htmlFor="email">Matching email</label><input id="email" name="email" type="email" required /></div><button className="btn primary full" disabled={state !== "idle"}>{state === "busy" ? "Verifying…" : "Email secure deletion link"}</button></form>}
    {message && <div className={state === "done" ? "status success" : "status error"}>{message}</div>}
  </section></div><SiteFooter /></main>
}
