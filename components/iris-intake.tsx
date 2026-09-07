"use client"

import { FormEvent, useMemo, useRef, useState } from "react"

type Quality = { width: number; height: number; brightness: number; glare: number; sharpness: number }
type Side = "left" | "right"
type Calibration = {
  irisCenterX: number
  irisCenterY: number
  pupilOffsetX: number
  pupilOffsetY: number
  pupilRadius: number
  irisRadius: number
  upperOcclusion: number
  lowerOcclusion: number
}

const defaultCalibration: Calibration = {
  irisCenterX: 50,
  irisCenterY: 50,
  pupilOffsetX: 0,
  pupilOffsetY: 0,
  pupilRadius: 8,
  irisRadius: 24,
  upperOcclusion: 8,
  lowerOcclusion: 8,
}

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

function qualityStatus(value: Quality) {
  if (value.width < 600 || value.height < 600) return { label: "replace", detail: "Image is below the 600 px acquisition floor." }
  if (value.glare > 16) return { label: "review", detail: "Strong highlights may hide iris texture." }
  if (value.sharpness < 7) return { label: "review", detail: "Focus may be insufficient for fine texture." }
  return { label: "usable", detail: "Local acquisition checks passed. Confirm the geometry below." }
}

function QualityPanel({ value }: { value: Quality }) {
  const gate = qualityStatus(value)
  return <div className="quality-block" aria-label="Local image quality preview">
    <div className="quality-gate"><span>IMAGE GATE</span><strong className={`quality-${gate.label}`}>{gate.label}</strong><p>{gate.detail}</p></div>
    <div className="quality">
      <div><small>dimensions</small><strong>{value.width}×{value.height}</strong></div>
      <div><small>glare proxy</small><strong>{value.glare.toFixed(1)}%</strong></div>
      <div><small>sharpness proxy</small><strong>{value.sharpness.toFixed(1)}</strong></div>
    </div>
  </div>
}

function Control({ label, value, min, max, unit = "%", onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="calibration-control">
    <span>{label}<output>{value > 0 && label.includes("offset") ? "+" : ""}{value}{unit}</output></span>
    <input type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>
}

function EyeCalibrator({ side, file, preview, quality, calibration, confirmed, error, onChoose, onCalibration, onConfirm, inputRef }: {
  side: Side
  file: File | null
  preview: string | null
  quality: Quality | null
  calibration: Calibration
  confirmed: boolean
  error: string
  onChoose: (file: File | null) => void
  onCalibration: (value: Calibration) => void
  onConfirm: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const title = side === "left" ? "LEFT IRIS · OS" : "RIGHT IRIS · OD"
  const update = (key: keyof Calibration, value: number) => onCalibration({ ...calibration, [key]: value })
  const pupilX = calibration.irisCenterX + calibration.pupilOffsetX
  const pupilY = calibration.irisCenterY + calibration.pupilOffsetY

  return <article className={`calibration-card ${confirmed ? "is-confirmed" : ""}`}>
    <header className="calibration-card-head">
      <div><span>{title}</span><strong>{confirmed ? "geometry confirmed" : file ? "alignment required" : "awaiting image"}</strong></div>
      {file && <button type="button" className="text-action" onClick={() => inputRef.current?.click()}>replace image</button>}
    </header>
    <input ref={inputRef} className="file-input" aria-label={`${side} iris image`} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => onChoose(event.target.files?.[0] || null)} />
    {!file || !preview || !quality ? <button className="image-drop" type="button" onClick={() => inputRef.current?.click()}>
      <span className="drop-index">+</span><strong>Select {side} eye photograph</strong><small>JPEG / PNG / WebP · maximum 4 MB</small>
    </button> : <>
      <div className="calibration-stage" style={{ aspectRatio: `${quality.width} / ${quality.height}` }}>
        <img src={preview} alt={`${side} eye alignment preview`} />
        <div className="upper-exclusion" style={{ height: `${calibration.upperOcclusion}%` }} />
        <div className="lower-exclusion" style={{ height: `${calibration.lowerOcclusion}%` }} />
        <div className="iris-guide" style={{ left: `${calibration.irisCenterX}%`, top: `${calibration.irisCenterY}%`, width: `${calibration.irisRadius * 2}%` }} />
        <div className="pupil-guide" style={{ left: `${pupilX}%`, top: `${pupilY}%`, width: `${calibration.pupilRadius * 2}%` }} />
        <div className="center-guide" style={{ left: `${calibration.irisCenterX}%`, top: `${calibration.irisCenterY}%` }} />
        <div className="stage-key"><span className="key-iris">iris boundary</span><span className="key-pupil">pupil boundary</span><span className="key-mask">excluded</span></div>
      </div>
      <QualityPanel value={quality} />
      <div className="calibration-controls">
        <Control label="Iris center X" value={calibration.irisCenterX} min={20} max={80} onChange={value => update("irisCenterX", value)} />
        <Control label="Iris center Y" value={calibration.irisCenterY} min={20} max={80} onChange={value => update("irisCenterY", value)} />
        <Control label="Pupil offset X" value={calibration.pupilOffsetX} min={-15} max={15} onChange={value => update("pupilOffsetX", value)} />
        <Control label="Pupil offset Y" value={calibration.pupilOffsetY} min={-15} max={15} onChange={value => update("pupilOffsetY", value)} />
        <Control label="Pupil radius" value={calibration.pupilRadius} min={3} max={20} onChange={value => update("pupilRadius", value)} />
        <Control label="Iris radius" value={calibration.irisRadius} min={14} max={46} onChange={value => update("irisRadius", value)} />
        <Control label="Upper exclusion" value={calibration.upperOcclusion} min={0} max={35} onChange={value => update("upperOcclusion", value)} />
        <Control label="Lower exclusion" value={calibration.lowerOcclusion} min={0} max={35} onChange={value => update("lowerOcclusion", value)} />
      </div>
      <button type="button" className={`btn calibration-confirm ${confirmed ? "confirmed" : ""}`} onClick={onConfirm}>
        {confirmed ? "✓ alignment confirmed" : `confirm ${side} iris geometry`}
      </button>
    </>}
    {error && <div className="side-error" role="alert">{error}</div>}
  </article>
}

export function IrisIntake() {
  const [files, setFiles] = useState<Record<Side, File | null>>({ left: null, right: null })
  const [previews, setPreviews] = useState<Record<Side, string | null>>({ left: null, right: null })
  const [quality, setQuality] = useState<Record<Side, Quality | null>>({ left: null, right: null })
  const [calibration, setCalibration] = useState<Record<Side, Calibration>>({ left: { ...defaultCalibration }, right: { ...defaultCalibration } })
  const [confirmed, setConfirmed] = useState<Record<Side, boolean>>({ left: false, right: false })
  const [sideErrors, setSideErrors] = useState<Record<Side, string>>({ left: "", right: "" })
  const [phase, setPhase] = useState<"idle" | "opening" | "uploading" | "finalising" | "done">("idle")
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ reference: string; notification: "sent" | "pending"; metrics: Array<Record<string, string | number>> } | null>(null)
  const idempotency = useRef(crypto.randomUUID())
  const inputRefs = { left: useRef<HTMLInputElement>(null), right: useRef<HTMLInputElement>(null) }
  const busy = phase !== "idle" && phase !== "done"
  const readiness = useMemo(() => Boolean(files.left && files.right && quality.left && quality.right && confirmed.left && confirmed.right), [files, quality, confirmed])

  async function choose(side: Side, file: File | null) {
    setError("")
    setSideErrors(value => ({ ...value, [side]: "" }))
    setQuality(value => ({ ...value, [side]: null }))
    setConfirmed(value => ({ ...value, [side]: false }))
    setFiles(value => ({ ...value, [side]: file }))
    setPreviews(value => {
      if (value[side]) URL.revokeObjectURL(value[side]!)
      return { ...value, [side]: file ? URL.createObjectURL(file) : null }
    })
    if (!file) return
    const invalidType = !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    const invalidSize = file.size > 4 * 1024 * 1024
    if (invalidType || invalidSize) {
      const message = invalidType ? "This file is not a JPEG, PNG or WebP image." : `This image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The secure pilot currently accepts up to 4 MB.`
      setSideErrors(value => ({ ...value, [side]: message }))
      setFiles(value => ({ ...value, [side]: null }))
      setPreviews(value => {
        if (value[side]) URL.revokeObjectURL(value[side]!)
        return { ...value, [side]: null }
      })
      if (inputRefs[side].current) inputRefs[side].current!.value = ""
      return
    }
    try {
      const inspected = await inspectImage(file)
      setQuality(value => ({ ...value, [side]: inspected }))
    } catch {
      setSideErrors(value => ({ ...value, [side]: `The ${side} image could not be decoded. Please export it as JPEG or PNG and try again.` }))
      setFiles(value => ({ ...value, [side]: null }))
      setPreviews(value => {
        if (value[side]) URL.revokeObjectURL(value[side]!)
        return { ...value, [side]: null }
      })
      if (inputRefs[side].current) inputRefs[side].current!.value = ""
    }
  }

  async function json(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || "Secure request failed.")
    return data
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setResult(null)
    if (!files.left || !files.right || !quality.left || !quality.right) { setError("Add a valid photograph for each eye before submission."); return }
    if (!confirmed.left || !confirmed.right) { setError("Confirm the pupil and iris geometry for both eyes before submission."); return }
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
        const upload = new FormData(); upload.set("submissionId", opened.submissionId); upload.set("laterality", side); upload.set("image", files[side]!); upload.set("calibration", JSON.stringify(calibration[side]))
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
    <section className="form-section acquisition-section"><p className="eyebrow">02 / ACQUISITION + SEGMENTATION</p><h2>Place the anatomy before measuring the pattern.</h2><p>Select each original photograph, then align the dashed boundaries with the pupil and outer iris. Dark bands exclude eyelid, eyelash and reflection regions from later measurements.</p>
      <div className="calibration-grid">
        {(["left", "right"] as Side[]).map(side => <EyeCalibrator key={side} side={side} file={files[side]} preview={previews[side]} quality={quality[side]} calibration={calibration[side]} confirmed={confirmed[side]} error={sideErrors[side]} inputRef={inputRefs[side]} onChoose={file => choose(side, file)} onCalibration={value => { setCalibration(current => ({ ...current, [side]: value })); setConfirmed(current => ({ ...current, [side]: false })) }} onConfirm={() => setConfirmed(current => ({ ...current, [side]: true }))} />)}
      </div>
      <div className="measurement-note"><span>MEASUREMENT RULE</span><p>Only the confirmed annulus and unmasked pixels enter structural feature extraction. Alignment is stored as acquisition metadata, not as a biological finding.</p></div>
    </section>
    <section className="form-section"><p className="eyebrow">03 / GRANULAR CONSENT</p><h2>You choose each use.</h2>
      <label className="consent"><input type="checkbox" name="serviceProcessing" required /><span><strong>Required: process and privately store my images for this free measurement.</strong><small>Retention: until you withdraw or the research program closes.</small></span></label>
      <label className="consent"><input type="checkbox" name="derivedResearch" /><span>Allow de-identified derived measurements in research.<small>Examples: texture spectra, counts and topology—not your name.</small></span></label>
      <label className="consent"><input type="checkbox" name="originalImageResearch" /><span>Allow authorised researchers to use my original iris images.<small>This is optional because images remain potentially identifying biometric data.</small></span></label>
      <label className="consent"><input type="checkbox" name="modelDevelopment" /><span>Allow consented data to develop and validate future models.<small>No health, organ or personality labels will be inferred from iridology maps.</small></span></label>
      <p className="fine-print">You can later withdraw the submission and request deletion. See <a href="/privacy">privacy</a> and <a href="/withdraw">withdrawal</a>.</p>
    </section>
    {error && <div className="status error" role="alert">{error}</div>}
    <button className="btn primary full" disabled={busy || !readiness} type="submit">{phase === "idle" ? readiness ? "Securely submit calibrated irises" : "Confirm both iris geometries to continue" : phase === "opening" ? "Opening private submission…" : phase === "uploading" ? "Encrypting transport + storing…" : "Verifying complete submission…"}</button>
  </form>
}
