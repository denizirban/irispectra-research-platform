"use client"

import { useEffect, useRef, useState } from "react"

type Sample = { t_ms: number; phase: string; diameter_px: number | null; confidence: number }
const phases = [
  { name: "baseline", from: 0, to: 5000, bright: false },
  { name: "light", from: 5000, to: 10000, bright: true },
  { name: "recovery", from: 10000, to: 15000, bright: false },
  { name: "light_repeat", from: 15000, to: 20000, bright: true },
]

function estimate(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const w = 192, h = 144
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(video, 0, 0, w, h)
  const rgba = ctx.getImageData(0, 0, w, h).data
  const gray = new Uint8Array(w * h)
  let darkest = 255, seed = Math.floor(h / 2) * w + Math.floor(w / 2)
  for (let y = 20; y < h - 20; y++) for (let x = 28; x < w - 28; x++) {
    const i = y * w + x, p = i * 4
    const g = Math.round(.2126 * rgba[p] + .7152 * rgba[p + 1] + .0722 * rgba[p + 2]); gray[i] = g
    const centerPenalty = Math.hypot(x - w / 2, y - h / 2) * .38
    if (g + centerPenalty < darkest) { darkest = g + centerPenalty; seed = i }
  }
  const threshold = Math.min(85, gray[seed] + 28)
  const queue = new Int32Array(w * h); const seen = new Uint8Array(w * h)
  let head = 0, tail = 0, area = 0, minX = w, maxX = 0, minY = h, maxY = 0
  queue[tail++] = seed; seen[seed] = 1
  while (head < tail && area < w * h * .25) {
    const i = queue[head++], x = i % w, y = Math.floor(i / w)
    if (gray[i] > threshold || x < 20 || x >= w - 20 || y < 12 || y >= h - 12) continue
    area++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    for (const n of [i - 1, i + 1, i - w, i + w]) if (n > 0 && n < seen.length && !seen[n]) { seen[n] = 1; queue[tail++] = n }
  }
  const width = maxX - minX + 1, height = maxY - minY + 1
  const circularity = area > 0 ? Math.min(width, height) / Math.max(width, height) : 0
  const plausible = area > 80 && width > 8 && width < 100 && height > 8 && height < 100
  return { diameter: plausible ? 2 * Math.sqrt(area / Math.PI) : null, confidence: plausible ? Math.min(1, circularity * Math.min(1, area / 500)) : 0 }
}

export function PupilProtocol() {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), stream = useRef<MediaStream | null>(null)
  const [camera, setCamera] = useState<"off" | "ready" | "error">("off")
  const [running, setRunning] = useState(false), [elapsed, setElapsed] = useState(0), [samples, setSamples] = useState<Sample[]>([])
  const [message, setMessage] = useState("")
  const phase = phases.find(p => elapsed >= p.from && elapsed < p.to) || phases[phases.length - 1]

  useEffect(() => () => stream.current?.getTracks().forEach(track => track.stop()), [])

  async function enable() {
    setMessage("")
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      stream.current = media; if (video.current) { video.current.srcObject = media; await video.current.play() }; setCamera("ready")
    } catch { setCamera("error"); setMessage("Camera access failed. Check browser permission and use HTTPS.") }
  }

  function run() {
    if (camera !== "ready" || !video.current || !canvas.current) return
    setSamples([]); setElapsed(0); setRunning(true); setMessage("")
    const start = performance.now()
    const timer = window.setInterval(() => {
      const t = performance.now() - start
      if (t >= 20000) { window.clearInterval(timer); setElapsed(20000); setRunning(false); setMessage("Protocol complete. Inspect tracking confidence before exporting."); return }
      setElapsed(t)
      const current = phases.find(p => t >= p.from && t < p.to) || phases[3]
      const reading = estimate(video.current!, canvas.current!)
      setSamples(old => [...old, { t_ms: Math.round(t), phase: current.name, diameter_px: reading.diameter ? Number(reading.diameter.toFixed(2)) : null, confidence: Number(reading.confidence.toFixed(3)) }])
    }, 250)
  }

  function download() {
    const csv = ["t_ms,phase,estimated_diameter_px,tracking_confidence", ...samples.map(s => `${s.t_ms},${s.phase},${s.diameter_px ?? ""},${s.confidence}`)].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = `irispectra-pupil-pilot-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const usable = samples.filter(s => s.diameter_px !== null && s.confidence >= .35)
  const median = usable.length ? [...usable].sort((a,b) => (a.diameter_px! - b.diameter_px!))[Math.floor(usable.length / 2)].diameter_px : null
  return <div className="form-wrap">
    <section className="form-section"><p className="eyebrow">PROTOCOL CONDITIONS</p><h2>Control what you can.</h2><div className="three-grid compact"><div className="method-card"><span className="index">01</span><p>Use a laptop, stable stand and dim, constant room light.</p></div><div className="method-card"><span className="index">02</span><p>Keep one eye centered and the same distance from the camera.</p></div><div className="method-card"><span className="index">03</span><p>Do not run if flashing or changing light is unsafe or uncomfortable for you.</p></div></div></section>
    <section className="pupil-grid">
      <div className="camera-stage"><video ref={video} muted playsInline /><div className="eye-guide" aria-hidden="true" /><canvas ref={canvas} hidden /><span className="timer">CAMERA · {camera.toUpperCase()}</span></div>
      <div className={`protocol-stage ${phase.bright && running ? "" : "dark"}`}><div className="stimulus" /><span className="timer">{running ? `${phase.name.toUpperCase()} · ${(elapsed / 1000).toFixed(1)} / 20.0 s` : "STIMULUS IDLE"}</span></div>
    </section>
    <section className="form-section"><div className="button-row"><button className="btn" type="button" onClick={enable} disabled={camera === "ready" || running}>Enable camera</button><button className="btn primary" type="button" onClick={run} disabled={camera !== "ready" || running}>{running ? "Protocol running…" : "Run 20-second pilot"}</button><button className="btn" type="button" onClick={download} disabled={!samples.length || running}>Export CSV</button></div>
      {message && <div className="status success">{message}</div>}
      <div className="quality"><div><small>samples</small><strong>{samples.length}</strong></div><div><small>usable ≥ .35</small><strong>{usable.length}</strong></div><div><small>median proxy</small><strong>{median ?? "—"} px</strong></div></div>
      <p className="fine-print"><span className="tag measured">measured</span> Timing and camera pixels. <span className="tag inferred">inferred</span> Dark-region diameter proxy. Millimetres, latency and clinical interpretation are not reported without calibrated hardware and validated segmentation. Data stays in this browser unless you export it.</p>
    </section>
  </div>
}
