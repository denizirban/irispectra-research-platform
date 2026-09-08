"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Side = "left" | "right"
type Sample = { t_ms: number; phase: string; diameter_px: number | null; confidence: number; centre_x: number | null; centre_y: number | null }
type Summary = {
  side: Side; sample_count: number; coverage_pct: number; confidence: number; baseline_px: number | null; minimum_px: number | null
  constriction_amplitude_pct: number | null; constriction_latency_ms: number | null; time_to_minimum_ms: number | null
  peak_constriction_velocity_px_s: number | null; recovery_6s_pct: number | null; redilation_velocity_px_s: number | null
  oscillation_cv_pct: number | null; repeatability_delta_pct: number | null; snr_proxy: number | null
}

const totalDuration = 30000
const phases = [
  { name: "baseline", label: "baseline", from: 0, to: 6000, bright: false },
  { name: "light", label: "light 1", from: 6000, to: 10000, bright: true },
  { name: "recovery", label: "recovery", from: 10000, to: 20000, bright: false },
  { name: "light_repeat", label: "light 2", from: 20000, to: 24000, bright: true },
  { name: "recovery_repeat", label: "recovery 2", from: 24000, to: 30000, bright: false },
]
const valid = (sample: Sample) => sample.diameter_px !== null && sample.confidence >= .4
const percentile = (values: number[], p: number) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))]
}
const medianFor = (samples: Sample[], phase: string, offset = 0) => {
  const start = phases.find(item => item.name === phase)?.from || 0
  return percentile(samples.filter(sample => sample.phase === phase && sample.t_ms >= start + offset && valid(sample)).map(sample => sample.diameter_px!), .5)
}

function summarize(samples: Sample[], side: Side): Summary {
  const usable = samples.filter(valid), baseline = medianFor(samples, "baseline", 1500)
  const firstLight = samples.filter(sample => sample.phase === "light" && valid(sample))
  const secondLight = samples.filter(sample => sample.phase === "light_repeat" && valid(sample))
  const minimum = percentile(firstLight.map(sample => sample.diameter_px!), .05)
  const secondMinimum = percentile(secondLight.map(sample => sample.diameter_px!), .05)
  const amplitude = baseline && minimum !== null ? Math.max(0, (baseline - minimum) / baseline * 100) : null
  const secondAmplitude = baseline && secondMinimum !== null ? Math.max(0, (baseline - secondMinimum) / baseline * 100) : null
  const onsetThreshold = baseline ? baseline * .97 : null
  const latencySample = onsetThreshold === null ? undefined : firstLight.find((sample, index) => sample.diameter_px! <= onsetThreshold && firstLight[index + 1]?.diameter_px !== null && (firstLight[index + 1]?.diameter_px || Infinity) <= onsetThreshold)
  const minSample = minimum === null ? undefined : firstLight.reduce<Sample | undefined>((best, sample) => !best || Math.abs(sample.diameter_px! - minimum) < Math.abs(best.diameter_px! - minimum) ? sample : best, undefined)
  const constrictionVelocities: number[] = [], redilationVelocities: number[] = []
  for (let index = 1; index < usable.length; index++) {
    const previous = usable[index - 1], current = usable[index], dt = (current.t_ms - previous.t_ms) / 1000
    if (dt <= 0 || dt > .35) continue
    const velocity = (current.diameter_px! - previous.diameter_px!) / dt
    if (current.phase === "light" && velocity < 0) constrictionVelocities.push(-velocity)
    if (current.phase === "recovery" && velocity > 0) redilationVelocities.push(velocity)
  }
  const recoveryEnd = percentile(samples.filter(sample => sample.phase === "recovery" && sample.t_ms >= 15500 && valid(sample)).map(sample => sample.diameter_px!), .5)
  const recovery = baseline && minimum !== null && recoveryEnd !== null && baseline > minimum ? Math.max(0, Math.min(140, (recoveryEnd - minimum) / (baseline - minimum) * 100)) : null
  const baselineValues = samples.filter(sample => sample.phase === "baseline" && sample.t_ms >= 1500 && valid(sample)).map(sample => sample.diameter_px!)
  const baselineMean = baselineValues.length ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length : null
  const baselineSd = baselineMean === null ? null : Math.sqrt(baselineValues.reduce((sum, value) => sum + (value - baselineMean) ** 2, 0) / baselineValues.length)
  const signal = baseline !== null && minimum !== null ? Math.abs(baseline - minimum) : null
  return {
    side, sample_count: samples.length, coverage_pct: samples.length ? usable.length / samples.length * 100 : 0,
    confidence: usable.length ? usable.reduce((sum, sample) => sum + sample.confidence, 0) / usable.length : 0,
    baseline_px: baseline, minimum_px: minimum, constriction_amplitude_pct: amplitude,
    constriction_latency_ms: latencySample ? latencySample.t_ms - 6000 : null,
    time_to_minimum_ms: minSample ? minSample.t_ms - 6000 : null,
    peak_constriction_velocity_px_s: percentile(constrictionVelocities, .9), recovery_6s_pct: recovery,
    redilation_velocity_px_s: percentile(redilationVelocities, .5),
    oscillation_cv_pct: baselineMean && baselineSd !== null ? baselineSd / baselineMean * 100 : null,
    repeatability_delta_pct: amplitude !== null && secondAmplitude !== null ? Math.abs(amplitude - secondAmplitude) : null,
    snr_proxy: signal !== null && baselineSd && baselineSd > 0 ? signal / baselineSd : null,
  }
}

function estimate(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const w = 192, h = 144
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(video, 0, 0, w, h)
  const rgba = ctx.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h)
  let darkest = 999, seed = Math.floor(h / 2) * w + Math.floor(w / 2)
  for (let y = 16; y < h - 16; y++) for (let x = 24; x < w - 24; x++) {
    const index = y * w + x, pixel = index * 4
    const value = Math.round(.2126 * rgba[pixel] + .7152 * rgba[pixel + 1] + .0722 * rgba[pixel + 2]); gray[index] = value
    const penalty = Math.hypot((x - w / 2) / w, (y - h / 2) / h) * 80
    if (value + penalty < darkest) { darkest = value + penalty; seed = index }
  }
  const threshold = Math.min(92, gray[seed] + 30), queue = new Int32Array(w * h), seen = new Uint8Array(w * h)
  let head = 0, tail = 0, area = 0, minX = w, maxX = 0, minY = h, maxY = 0, sumX = 0, sumY = 0, perimeter = 0
  queue[tail++] = seed; seen[seed] = 1
  while (head < tail && area < w * h * .22) {
    const index = queue[head++], x = index % w, y = Math.floor(index / w)
    if (gray[index] > threshold || x < 18 || x >= w - 18 || y < 10 || y >= h - 10) continue
    area++; sumX += x; sumY += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    for (const neighbour of [index - 1, index + 1, index - w, index + w]) {
      if (neighbour <= 0 || neighbour >= seen.length || gray[neighbour] > threshold) perimeter++
      else if (!seen[neighbour]) { seen[neighbour] = 1; queue[tail++] = neighbour }
    }
  }
  const width = maxX - minX + 1, height = maxY - minY + 1
  const aspect = area > 0 ? Math.min(width, height) / Math.max(width, height) : 0
  const circularity = area > 0 ? Math.min(1, 4 * Math.PI * area / Math.max(1, perimeter ** 2)) : 0
  const plausible = area > 75 && area < 3300 && width > 8 && width < 92 && height > 8 && height < 92 && aspect > .48
  const confidence = plausible ? Math.min(1, .38 * aspect + .34 * circularity + .28 * Math.min(1, area / 420)) : 0
  return { diameter: plausible ? 2 * Math.sqrt(area / Math.PI) : null, confidence, centreX: plausible ? sumX / area / w : null, centreY: plausible ? sumY / area / h : null }
}

const display = (value: number | null, unit = "", digits = 1) => value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}${unit}`

export function PupilProtocol() {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), stream = useRef<MediaStream | null>(null), timer = useRef<number | null>(null)
  const [camera, setCamera] = useState<"off" | "ready" | "error">("off")
  const [running, setRunning] = useState(false), [elapsed, setElapsed] = useState(0), [samples, setSamples] = useState<Sample[]>([])
  const [side, setSide] = useState<Side>("left"), [runs, setRuns] = useState<Partial<Record<Side, Summary>>>({}), [message, setMessage] = useState("")
  const phase = phases.find(item => elapsed >= item.from && elapsed < item.to) || phases[phases.length - 1]
  const summary = useMemo(() => summarize(samples, side), [samples, side])

  useEffect(() => () => { stream.current?.getTracks().forEach(track => track.stop()); if (timer.current) window.clearInterval(timer.current) }, [])
  async function enable() {
    setMessage("")
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false })
      stream.current = media; if (video.current) { video.current.srcObject = media; await video.current.play() }; setCamera("ready")
    } catch { setCamera("error"); setMessage("Camera access failed. Check browser permission and use HTTPS.") }
  }
  function run() {
    if (camera !== "ready" || !video.current || !canvas.current) return
    setSamples([]); setElapsed(0); setRunning(true); setMessage("")
    const start = performance.now()
    timer.current = window.setInterval(() => {
      const t = performance.now() - start
      if (t >= totalDuration) { if (timer.current) window.clearInterval(timer.current); timer.current = null; setElapsed(totalDuration); setRunning(false); setMessage("Capture complete. Review coverage and confidence before interpreting response proxies."); return }
      setElapsed(t)
      const current = phases.find(item => t >= item.from && t < item.to) || phases[phases.length - 1], reading = estimate(video.current!, canvas.current!)
      setSamples(old => [...old, { t_ms: Math.round(t), phase: current.name, diameter_px: reading.diameter === null ? null : Number(reading.diameter.toFixed(2)), confidence: Number(reading.confidence.toFixed(3)), centre_x: reading.centreX === null ? null : Number(reading.centreX.toFixed(3)), centre_y: reading.centreY === null ? null : Number(reading.centreY.toFixed(3)) }])
    }, 80)
  }
  function saveRun() { if (!samples.length || running) return; setRuns(value => ({ ...value, [side]: summary })); setMessage(`${side === "left" ? "Left" : "Right"} run stored in this browser. Switch eye to capture bilateral asymmetry.`) }
  function download() {
    const csv = ["t_ms,phase,estimated_diameter_px,tracking_confidence,centre_x_0_1,centre_y_0_1", ...samples.map(sample => `${sample.t_ms},${sample.phase},${sample.diameter_px ?? ""},${sample.confidence},${sample.centre_x ?? ""},${sample.centre_y ?? ""}`)].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })), anchor = document.createElement("a"); anchor.href = url; anchor.download = `irispectra-pupil-${side}-${Date.now()}.csv`; anchor.click(); URL.revokeObjectURL(url)
  }
  const usable = samples.filter(valid), diameters = usable.map(sample => sample.diameter_px!)
  const low = diameters.length ? Math.min(...diameters) : 0, high = diameters.length ? Math.max(...diameters) : 1, range = Math.max(.01, high - low)
  const trace = usable.map(sample => `${Math.max(0, Math.min(100, sample.t_ms / totalDuration * 100))},${40 - ((sample.diameter_px! - low) / range) * 32}`).join(" ")
  const bilateral = runs.left && runs.right ? {
    amplitude: runs.left.constriction_amplitude_pct !== null && runs.right.constriction_amplitude_pct !== null ? Math.abs(runs.left.constriction_amplitude_pct - runs.right.constriction_amplitude_pct) : null,
    latency: runs.left.constriction_latency_ms !== null && runs.right.constriction_latency_ms !== null ? Math.abs(runs.left.constriction_latency_ms - runs.right.constriction_latency_ms) : null,
  } : null

  return <div className="form-wrap pupil-prototype">
    <section className="pupil-brief"><span>30 SEC · MONOCULAR SCREEN-STIMULUS PROTOCOL</span><h2>Measure the response, not just the pupil.</h2><p>The browser follows diameter through baseline, two light steps and recovery. Run each eye separately to unlock bilateral comparison.</p></section>
    <section className="pupil-runbar">
      <div className="segmented-control" role="group" aria-label="Eye laterality">{(["left", "right"] as Side[]).map(value => <button key={value} type="button" className={side === value ? "is-active" : ""} onClick={() => { if (!running) { setSide(value); setSamples([]); setElapsed(0); setMessage("") } }} disabled={running}>{value} eye {runs[value] ? "✓" : ""}</button>)}</div>
      <div className="button-row"><button className="btn" type="button" onClick={enable} disabled={camera === "ready" || running}>Enable camera</button><button className="btn primary" type="button" onClick={run} disabled={camera !== "ready" || running}>{running ? "Measuring…" : `Measure ${side} eye`}</button></div>
    </section>
    <section className="pupil-grid">
      <div className="camera-stage"><video ref={video} muted playsInline /><div className="eye-guide" aria-hidden="true" /><canvas ref={canvas} hidden /><span className="timer">{side.toUpperCase()} EYE · CAMERA {camera.toUpperCase()}</span></div>
      <div className={`protocol-stage ${phase.bright && running ? "" : "dark"}`}><div className="stimulus" /><span className="timer">{running ? `${phase.label.toUpperCase()} · ${(elapsed / 1000).toFixed(1)} / 30.0 s` : "STIMULUS IDLE"}</span></div>
    </section>
    <section className="pupil-results">
      <div className="pupil-trace" aria-label="Pupil diameter pixel proxy over the protocol">
        <header><div><span>DIAMETER TRACE · PIXEL PROXY</span><strong>{running ? phase.label : samples.length ? "capture complete" : "awaiting measurement"}</strong></div><span>{summary.coverage_pct ? `${summary.coverage_pct.toFixed(0)}% tracked` : "30.0 s protocol"}</span></header>
        <svg viewBox="0 0 100 44" role="img" aria-label="Tracked pupil diameter across five protocol phases">
          {phases.map(item => <rect key={item.name} x={item.from / totalDuration * 100} y="0" width={(item.to - item.from) / totalDuration * 100} height="44" className={item.bright ? "phase-light" : "phase-dark"} />)}
          {[8, 24, 40].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} />)}{trace && <polyline points={trace} />}
        </svg>
        <footer>{phases.map(item => <span key={item.name} style={{ width: `${(item.to - item.from) / totalDuration * 100}%` }}>{item.label}</span>)}</footer>
      </div>
      <div className="pupil-metrics detailed">
        <div><small>baseline diameter</small><strong>{display(summary.baseline_px, " px")}</strong></div><div><small>minimum diameter</small><strong>{display(summary.minimum_px, " px")}</strong></div>
        <div><small>constriction amplitude</small><strong>{display(summary.constriction_amplitude_pct, "%")}</strong></div><div><small>response latency</small><strong>{display(summary.constriction_latency_ms, " ms", 0)}</strong></div>
        <div><small>time to minimum</small><strong>{display(summary.time_to_minimum_ms, " ms", 0)}</strong></div><div><small>peak constriction velocity</small><strong>{display(summary.peak_constriction_velocity_px_s, " px/s")}</strong></div>
        <div><small>6 s recovery</small><strong>{display(summary.recovery_6s_pct, "%")}</strong></div><div><small>redilation velocity</small><strong>{display(summary.redilation_velocity_px_s, " px/s")}</strong></div>
        <div><small>baseline oscillation CV</small><strong>{display(summary.oscillation_cv_pct, "%", 2)}</strong></div><div><small>repeatability delta</small><strong>{display(summary.repeatability_delta_pct, "%")}</strong></div>
        <div><small>valid frames</small><strong>{summary.sample_count ? `${summary.coverage_pct.toFixed(0)}%` : "—"}</strong></div><div><small>SNR proxy</small><strong>{display(summary.snr_proxy, "", 2)}</strong></div>
      </div>
      <div className="button-row result-actions"><button className="btn" type="button" onClick={saveRun} disabled={!samples.length || running}>Save {side} run</button><button className="btn" type="button" onClick={download} disabled={!samples.length || running}>Export raw CSV</button></div>
      {bilateral && <div className="bilateral-pupil"><div><small>inter-eye amplitude difference</small><strong>{display(bilateral.amplitude, "%")}</strong></div><div><small>inter-eye latency difference</small><strong>{display(bilateral.latency, " ms", 0)}</strong></div><p>Within-session comparison of two sequential browser runs. It is sensitive to camera exposure, distance, screen luminance and alignment.</p></div>}
      {message && <div className="status success">{message}</div>}
      <p className="fine-print"><span className="tag measured">measured</span> Frame time, dark-region area, centre and tracking confidence. <span className="tag inferred">derived</span> Latency, amplitude, velocity, recovery, oscillation, repeatability and SNR from the pixel trace. This RGB screen test is a research prototype—not calibrated infrared pupillometry, millimetres, a neurological score or a diagnosis. Auto-exposure can distort the signal.</p>
    </section>
  </div>
}
