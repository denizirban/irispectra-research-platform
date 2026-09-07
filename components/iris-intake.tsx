"use client"

import { FormEvent, useMemo, useRef, useState } from "react"

type Quality = { width: number; height: number; brightness: number; glare: number; sharpness: number }
type Side = "left" | "right"

async function inspectImage(file: File): Promise<Quality> {
  const bitmap = await createImageBitmap(file)
  const size = 320
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, size, size)
  const pixels = ctx.getImageData(0, 0, size, size).data
  let luminance = 0, glare = 0, laplace = 0, count = 0
  const gray = new Float32Array(size * size)
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4
    const value = .2126 * pixels[p] + .7152 * pixels[p + 1] + .0722 * pixels[p + 2]
    gray[i] = value
    luminance += value
    if (value > 245) glare++
  }
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = y * size + x
    laplace += Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - size] - gray[i + size])
    count++
  }
  const width = bitmap.width, height = bitmap.height
  bitmap.close()
  return { width, height, brightness: luminance / gray.length, glare: 100 * glare / gray.length, sharpness: laplace / count }
}

function QualityPanel({ value }: { value: Quality | null }) {
  if (!value) return null
  return <div className="quality" aria-label="Local image quality preview">
    <div><small>dimensions</small><strong>{value.width}×{value.height}</strong></div>
    <div><small>glare proxy</small><strong>{value.glare.toFixed(1)}%</strong></div>
    <div><small>sharpness proxy</small><strong>{value.sharpness.toFixed(1)}</strong></div>
  </div>
}

export function IrisIntake() {
  const [files, setFiles] = useState<Record<Side, File | null>>({ left: null, right: null })
  const [quality, setQuality] = useState<Record<Side, Quality | null>>({ left: null, right: null })
  const [phase, setPhase] = useState<"idle" | "opening" | "uploading" | "finalising" | "done">("idle")
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ reference: string; notification: "sent" | "pending"; metrics: Array<Record<string, string | number>> } | null>(null)
  const idempotency = useRef(crypto.randomUUID())
  const busy = phase !== "idle" && phase !== "done"
  const readiness = useMemo(() => files.left && files.right && quality.left && quality.right, [files, quality])

  async function choose(side: Side, file: File | null) {
    setError("")
    setFiles(v => ({ ...v, [side]: file }))
    setQuality(v => ({ ...v, [side]: null }))
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024) {
      setError("Use JPEG, PNG or WebP files up to 4 MB each.")
      setFiles(v => ({ ...v, [side]: null }))
      return
    }
    try { const inspected = await inspectImage(file); setQuality(v => ({ ...v, [side]: inspected })) }
    catch { setError(`The ${side} image could not be decoded.`); setFiles(v => ({ ...v, [side]: null })) }
  }

  async function json(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || "Secure request failed.")
    return data
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setResult(null)
    if (!readiness) { setError("Add both left and right iris photographs first."); return }
    const form = new FormData(event.currentTarget)
    try {
      setPhase("opening")
      const opened = await json("/api/intake/start", {
        firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), age: form.get("age"), countryRegion: form.get("countryRegion"),
        idempotencyKey: idempotency.current,
        consents: { serviceProcessing: form.get("serviceProcessing") === "on", derivedResearch: form.get("derivedResearch") === "on", originalImageResearch: form.get("originalImageResearch") === "on", modelDevelopment: form.get("modelDevelopment") === "on" },
      })
      setPhase("uploading")
      for (const side of ["left", "right"] as Side[]) {
        const upload = new FormData(); upload.set("submissionId", opened.submissionId); upload.set("laterality", side); upload.set("image", files[side]!)
        const response = await fetch("/api/intake/upload", { method: "POST", body: upload })
        const data = await response.json().catch(() => ({}))
        if (!response.ok && !String(data.error || "").includes("already securely stored")) throw new Error(data.error || `${side} image upload failed.`)
      }
      setPhase("finalising")
      const completed = await json("/api/intake/complete", { submissionId: opened.submissionId })
      setResult({ reference: completed.reference, notification: completed.notification, metrics: completed.acquisitionMetrics || [] }); setPhase("done")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Submission failed."); setPhase("idle") }
  }

  if (result) return <div className="form-wrap"><section className="form-section result-card">
    <p className="eyebrow">SECURE STORAGE CONFIRMED</p><h2>Submission received.</h2>
    <p>Your reference is <code>{result.reference}</code>. Save it for withdrawal or researcher review.</p>
    <table className="evidence-table"><thead><tr><th>Side</th><th>Brightness</th><th>Glare</th><th>Sharpness</th><th>Status</th></tr></thead><tbody>{result.metrics.map((metric, index) => <tr key={index}><td>{String(metric.laterality)}</td><td>{String(metric.brightness_mean_0_255 ?? "—")}</td><td>{metric.glare_fraction !== undefined ? `${(Number(metric.glare_fraction) * 100).toFixed(1)}%` : "—"}</td><td>{String(metric.laplacian_abs_mean ?? "—")}</td><td><span className="tag measured">pixel measured</span></td></tr>)}</tbody></table>
    <div className="status">Structural morphology pipeline: queued experimental analysis. Crypt, furrow and vascular-network claims are not reported until validated.</div>
    <div className={result.notification === "sent" ? "status success" : "status error"}>{result.notification === "sent" ? "Confirmation email sent." : "Images are stored, but email delivery is pending. Keep the reference above."}</div>
    <p className="fine-print">This confirms storage and queueing only—not a scientific finding or medical result.</p>
  </section></div>

  return <form className="form-wrap" onSubmit={submit}>
    <section className="form-section"><p className="eyebrow">01 / PARTICIPANT</p><h2>Who is contributing?</h2><p>Adults 18+. Location is optional and should be broad—not an address.</p>
      <div className="form-grid">
        <div className="field"><label htmlFor="firstName">First name *</label><input id="firstName" name="firstName" maxLength={80} required autoComplete="given-name" /></div>
        <div className="field"><label htmlFor="lastName">Last name *</label><input id="lastName" name="lastName" maxLength={80} required autoComplete="family-name" /></div>
        <div className="field"><label htmlFor="email">Email *</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
        <div className="field"><label htmlFor="age">Age *</label><input id="age" name="age" type="number" min="18" max="120" required /></div>
        <div className="field"><label htmlFor="countryRegion">Country / broad region (optional)</label><input id="countryRegion" name="countryRegion" maxLength={120} autoComplete="country-name" /></div>
      </div>
    </section>
    <section className="form-section"><p className="eyebrow">02 / ACQUISITION</p><h2>Left and right iris.</h2><p>Upload the original image—not CSV. Use even light, sharp focus, no beauty filter, and keep the full iris visible.</p>
      <div className="form-grid">
        {(["left", "right"] as Side[]).map(side => <div key={side}>
          <div className="upload-box"><strong>{side.toUpperCase()} IRIS</strong><input aria-label={`${side} iris image`} type="file" accept="image/jpeg,image/png,image/webp" required onChange={e => choose(side, e.target.files?.[0] || null)} /><small>JPEG / PNG / WebP · max 4 MB</small></div>
          <QualityPanel value={quality[side]} />
        </div>)}
      </div><p className="fine-print">Quality proxies are computed locally in your browser for guidance. They are not biometric findings.</p>
    </section>
    <section className="form-section"><p className="eyebrow">03 / GRANULAR CONSENT</p><h2>You choose each use.</h2>
      <label className="consent"><input type="checkbox" name="serviceProcessing" required /><span><strong>Required: process and privately store my images for this free measurement.</strong><small>Retention: until you withdraw or the research program closes.</small></span></label>
      <label className="consent"><input type="checkbox" name="derivedResearch" /><span>Allow de-identified derived measurements in research.<small>Examples: texture spectra, counts and topology—not your name.</small></span></label>
      <label className="consent"><input type="checkbox" name="originalImageResearch" /><span>Allow authorised researchers to use my original iris images.<small>This is optional because images remain potentially identifying biometric data.</small></span></label>
      <label className="consent"><input type="checkbox" name="modelDevelopment" /><span>Allow consented data to develop and validate future models.<small>No health, organ or personality labels will be inferred from iridology maps.</small></span></label>
      <p className="fine-print">You can later withdraw the submission and request deletion. See <a href="/privacy">privacy</a> and <a href="/withdraw">withdrawal</a>.</p>
    </section>
    {error && <div className="status error" role="alert">{error}</div>}
    <button className="btn primary full" disabled={busy} type="submit">{phase === "idle" ? "Securely submit both irises" : phase === "opening" ? "Opening private submission…" : phase === "uploading" ? "Encrypting transport + storing…" : "Verifying complete submission…"}</button>
  </form>
}
