"use client"

import { ChangeEvent, useMemo, useState } from "react"

type Analysis = {
  quality: string
  brightness: number
  contrast: number
  edgeDensity: number
  warmth: number
  notes: string[]
}

function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)) }

async function analyzeImage(file: File): Promise<Analysis> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await img.decode()
  const size = 360
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const scale = Math.max(size / img.width, size / img.height)
  const w = img.width * scale, h = img.height * scale
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  const data = ctx.getImageData(0, 0, size, size).data
  let lumSum = 0, lumSq = 0, edge = 0, count = 0, warm = 0
  const lums = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size)
    const dx = x - size / 2, dy = y - size / 2
    if (Math.hypot(dx, dy) > size * .47) continue
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    const l = .2126 * r + .7152 * g + .0722 * b
    lums[i] = l; lumSum += l; lumSq += l * l; warm += (r - b); count++
  }
  for (let y = 1; y < size - 1; y += 2) for (let x = 1; x < size - 1; x += 2) {
    const dx = x - size / 2, dy = y - size / 2
    if (Math.hypot(dx, dy) > size * .45) continue
    const i = y * size + x
    const gx = Math.abs(lums[i + 1] - lums[i - 1])
    const gy = Math.abs(lums[i + size] - lums[i - size])
    if (gx + gy > 34) edge++
  }
  URL.revokeObjectURL(url)
  const mean = lumSum / count
  const sd = Math.sqrt(Math.max(0, lumSq / count - mean * mean))
  const brightness = clamp(mean / 2.55)
  const contrast = clamp(sd / .9)
  const edgeDensity = clamp(edge / 260)
  const warmth = clamp(50 + warm / count / 2)
  const qualityScore = clamp(100 - Math.abs(52 - brightness) * .75 + contrast * .28 + edgeDensity * .2)
  const quality = qualityScore > 74 ? "Good" : qualityScore > 55 ? "Usable" : "Limited"
  const notes = [
    contrast > 35 ? "Strong local texture variation is visible across the iris field." : "Texture variation appears relatively soft in this capture.",
    edgeDensity > 35 ? "Radial and ring-like transitions are visually prominent." : "Radial transitions are present but less sharply resolved.",
    warmth > 56 ? "The visible palette trends toward warmer amber/brown values." : warmth < 44 ? "The visible palette trends toward cooler blue/grey values." : "The visible palette is comparatively balanced between warm and cool values.",
    quality === "Good" ? "Image quality is suitable for exploratory visual analysis." : "Capture quality limits fine-structure interpretation; a sharper macro image would improve the model."
  ]
  return { quality, brightness, contrast, edgeDensity, warmth, notes }
}

export function Iris3DDemo() {
  const [src, setSrc] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [tiltX, setTiltX] = useState(-7)
  const [tiltY, setTiltY] = useState(10)
  const [depth, setDepth] = useState(18)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setAnalysis(null)
    if (src) URL.revokeObjectURL(src)
    const next = URL.createObjectURL(file); setSrc(next)
    try { setAnalysis(await analyzeImage(file)) } finally { setBusy(false) }
  }

  const insight = useMemo(() => analysis ? `${analysis.quality} capture · ${Math.round(analysis.contrast)} texture contrast · ${Math.round(analysis.edgeDensity)} visible edge density` : "", [analysis])

  return <section className="iris3d-wrap">
    <div className="iris3d-head">
      <div><p className="eyebrow">IRISPECTRA · 3D EXPLORER</p><h2>Upload an iris. Explore its visible structure.</h2></div>
      <p>Single-image, AI-ready visual reconstruction. The current demo derives image-level signals locally in your browser; it is not a clinical 3D measurement or diagnosis.</p>
    </div>

    <div className="iris3d-grid">
      <div className="iris3d-card upload-card">
        <label className="dropzone">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
          {src ? <img src={src} alt="Uploaded iris" /> : <div><strong>DROP IRIS IMAGE</strong><span>JPG · PNG · WEBP</span><small>Front-facing, sharp, low-reflection macro images work best.</small></div>}
        </label>
        <div className="microcopy">Your image is processed in-browser for this demo.</div>
      </div>

      <div className="iris3d-card viewer-card">
        <div className="viewer-top"><span>ESTIMATED 3D VIEW</span><span>{busy ? "ANALYZING…" : analysis ? "READY" : "WAITING FOR IMAGE"}</span></div>
        <div className="stage">
          {src ? <div className="iris-disc" style={{ transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(${depth/3}px)`, boxShadow: `0 ${18+depth}px ${50+depth*2}px rgba(0,0,0,.22), inset 0 0 ${20+depth}px rgba(255,255,255,.14)` }}><img src={src} alt="Estimated iris 3D view"/><div className="iris-gloss"/></div> : <div className="empty-orbit">IRIS</div>}
        </div>
        <div className="controls">
          <label>TILT X<input type="range" min="-25" max="25" value={tiltX} onChange={e=>setTiltX(+e.target.value)}/></label>
          <label>TILT Y<input type="range" min="-25" max="25" value={tiltY} onChange={e=>setTiltY(+e.target.value)}/></label>
          <label>RELIEF<input type="range" min="0" max="40" value={depth} onChange={e=>setDepth(+e.target.value)}/></label>
        </div>
      </div>
    </div>

    {analysis && <div className="analysis-panel">
      <div className="analysis-title"><div><p className="eyebrow">VISUAL READOUT</p><h3>{insight}</h3></div><span className={`quality q-${analysis.quality.toLowerCase()}`}>{analysis.quality}</span></div>
      <div className="metrics">
        <Metric label="Brightness" value={analysis.brightness}/><Metric label="Texture contrast" value={analysis.contrast}/><Metric label="Edge density" value={analysis.edgeDensity}/><Metric label="Warm / cool balance" value={analysis.warmth}/>
      </div>
      <div className="notes">{analysis.notes.map((n,i)=><p key={i}><span>0{i+1}</span>{n}</p>)}</div>
      <div className="research-note"><strong>Interpretation boundary</strong><p>These values describe visible pixels, not measured iris depth. Crypts, furrows, collarette geometry and true surface topography require validated segmentation and ophthalmic ground-truth imaging before they can be reported as anatomical measurements.</p></div>
    </div>}

    <style jsx>{`
      .iris3d-wrap{margin:28px 0 80px}.iris3d-head{display:grid;grid-template-columns:1.2fr .8fr;gap:36px;align-items:end;margin:0 0 22px}.iris3d-head h2{font-size:clamp(34px,5vw,72px);line-height:.96;letter-spacing:-.055em;margin:6px 0 0;max-width:850px}.iris3d-head>p{max-width:520px;line-height:1.5;opacity:.72}.iris3d-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:14px}.iris3d-card,.analysis-panel{border:1px solid rgba(20,20,20,.14);background:rgba(255,255,255,.38);border-radius:18px;overflow:hidden}.upload-card{padding:14px}.dropzone{display:flex;min-height:530px;border:1px dashed rgba(20,20,20,.22);border-radius:12px;overflow:hidden;cursor:pointer;align-items:center;justify-content:center;text-align:center}.dropzone input{display:none}.dropzone img{width:100%;height:100%;min-height:530px;object-fit:cover}.dropzone div{display:flex;flex-direction:column;gap:9px;padding:30px}.dropzone strong{font-size:13px;letter-spacing:.08em}.dropzone span{font-size:12px;opacity:.55}.dropzone small{max-width:260px;line-height:1.4;opacity:.55}.microcopy{font-size:11px;opacity:.5;padding:11px 3px 0}.viewer-card{min-height:572px}.viewer-top{display:flex;justify-content:space-between;padding:16px 18px;font-size:11px;letter-spacing:.08em;border-bottom:1px solid rgba(20,20,20,.09)}.stage{height:440px;display:grid;place-items:center;perspective:900px;background:radial-gradient(circle at 50% 45%,rgba(255,255,255,.85),rgba(235,235,235,.4) 48%,rgba(210,210,210,.18))}.iris-disc{position:relative;width:min(58vw,340px);aspect-ratio:1;border-radius:50%;overflow:hidden;transition:transform .18s ease,box-shadow .18s ease;transform-style:preserve-3d}.iris-disc img{width:100%;height:100%;object-fit:cover;transform:scale(1.28)}.iris-disc:after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.45),inset 0 0 45px rgba(0,0,0,.34)}.iris-gloss{position:absolute;inset:0;background:radial-gradient(circle at 34% 26%,rgba(255,255,255,.28),transparent 23%,transparent 60%,rgba(0,0,0,.13));mix-blend-mode:screen}.empty-orbit{width:220px;aspect-ratio:1;border-radius:50%;border:1px solid rgba(20,20,20,.15);display:grid;place-items:center;font-size:11px;letter-spacing:.2em;opacity:.35}.controls{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px 18px 18px;border-top:1px solid rgba(20,20,20,.09)}.controls label{font-size:10px;letter-spacing:.08em;display:flex;flex-direction:column;gap:6px}.controls input{width:100%}.analysis-panel{margin-top:14px;padding:22px}.analysis-title{display:flex;justify-content:space-between;gap:20px;align-items:start}.analysis-title h3{margin:4px 0 0;font-size:24px;letter-spacing:-.025em}.quality{border:1px solid rgba(20,20,20,.16);padding:8px 11px;border-radius:999px;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:22px 0}.metric{border-top:1px solid rgba(20,20,20,.15);padding-top:10px}.metric b{display:block;font-size:28px;font-weight:500}.metric span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.55}.bar{height:3px;background:rgba(0,0,0,.08);margin-top:10px}.bar i{display:block;height:100%;background:currentColor}.notes{display:grid;grid-template-columns:repeat(2,1fr);gap:0 22px;border-top:1px solid rgba(20,20,20,.12);padding-top:8px}.notes p{display:grid;grid-template-columns:28px 1fr;gap:8px;line-height:1.5;font-size:14px}.notes span{font-size:10px;opacity:.4;padding-top:4px}.research-note{margin-top:18px;padding:16px;border-radius:12px;background:rgba(0,0,0,.035)}.research-note strong{font-size:11px;text-transform:uppercase;letter-spacing:.08em}.research-note p{font-size:13px;line-height:1.5;opacity:.68;margin:8px 0 0}@media(max-width:800px){.iris3d-head,.iris3d-grid{grid-template-columns:1fr}.iris3d-head{gap:12px}.dropzone,.dropzone img{min-height:360px}.stage{height:360px}.metrics{grid-template-columns:1fr 1fr}.notes{grid-template-columns:1fr}.controls{grid-template-columns:1fr}.viewer-card{min-height:unset}}
    `}</style>
  </section>
}

function Metric({label,value}:{label:string,value:number}){return <div className="metric"><b>{Math.round(value)}</b><span>{label}</span><div className="bar"><i style={{width:`${clamp(value)}%`}}/></div></div>}
