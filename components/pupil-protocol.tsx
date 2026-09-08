"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Sample = { t_ms: number; diameter_px: number | null; confidence: number; brightness: number; flag: string }
type Reading = Omit<Sample, "t_ms">

const RECORDING_MS = 15_000
const SAMPLE_INTERVAL_MS = 100

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function estimate(video: HTMLVideoElement, canvas: HTMLCanvasElement, percentile: number): Reading {
  const width = 240, height = 160
  const sourceWidth = video.videoWidth, sourceHeight = video.videoHeight
  if (!sourceWidth || !sourceHeight) return { diameter_px: null, confidence: 0, brightness: 0, flag: "video_not_ready" }

  canvas.width = width; canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })!
  context.drawImage(video, sourceWidth * .22, sourceHeight * .29, sourceWidth * .56, sourceHeight * .42, 0, 0, width, height)
  const image = context.getImageData(0, 0, width, height)
  const gray = new Uint8Array(width * height), histogram = new Uint32Array(256)
  let brightnessSum = 0
  for (let index = 0; index < gray.length; index++) {
    const pixel = index * 4
    const value = Math.round(image.data[pixel] * .2126 + image.data[pixel + 1] * .7152 + image.data[pixel + 2] * .0722)
    gray[index] = value; histogram[value]++; brightnessSum += value
  }

  const target = gray.length * (percentile / 100)
  let count = 0, threshold = 0
  for (; threshold < 255; threshold++) { count += histogram[threshold]; if (count >= target) break }

  const seen = new Uint8Array(gray.length), queue = new Int32Array(gray.length)
  let best: { area: number; minX: number; maxX: number; minY: number; maxY: number; score: number } | null = null
  for (let y = 10; y < height - 10; y++) for (let x = 12; x < width - 12; x++) {
    const seed = y * width + x
    if (seen[seed] || gray[seed] > threshold) continue
    let head = 0, tail = 0, area = 0, sumX = 0, sumY = 0, minX = width, maxX = 0, minY = height, maxY = 0
    queue[tail++] = seed; seen[seed] = 1
    while (head < tail) {
      const index = queue[head++], px = index % width, py = Math.floor(index / width)
      if (gray[index] > threshold || px < 8 || px >= width - 8 || py < 8 || py >= height - 8) continue
      area++; sumX += px; sumY += py
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py)
      for (const neighbour of [index - 1, index + 1, index - width, index + width]) {
        if (neighbour > 0 && neighbour < seen.length && !seen[neighbour]) { seen[neighbour] = 1; queue[tail++] = neighbour }
      }
    }
    if (area < 70 || area > 6500) continue
    const componentWidth = maxX - minX + 1, componentHeight = maxY - minY + 1
    const aspect = Math.min(componentWidth, componentHeight) / Math.max(componentWidth, componentHeight)
    const centreDistance = Math.hypot(sumX / area - width / 2, sumY / area - height / 2)
    const score = area * aspect * Math.max(.05, 1 - centreDistance / 125)
    if (!best || score > best.score) best = { area, minX, maxX, minY, maxY, score }
  }

  context.putImageData(image, 0, 0)
  const brightness = brightnessSum / gray.length
  if (!best) return { diameter_px: null, confidence: 0, brightness: Number(brightness.toFixed(1)), flag: "pupil_not_found" }
  const componentWidth = best.maxX - best.minX + 1, componentHeight = best.maxY - best.minY + 1
  const aspect = Math.min(componentWidth, componentHeight) / Math.max(componentWidth, componentHeight)
  const fill = best.area / (componentWidth * componentHeight)
  const plausibleSize = componentWidth >= 10 && componentWidth <= 105 && componentHeight >= 8 && componentHeight <= 85
  const confidence = plausibleSize ? Math.min(1, aspect * .65 + Math.min(fill, .8) * .35) : 0
  context.strokeStyle = confidence >= .55 ? "#4caf7d" : "#c77b62"; context.lineWidth = 3
  context.strokeRect(best.minX, best.minY, componentWidth, componentHeight)
  return {
    diameter_px: plausibleSize ? Number((2 * Math.sqrt(best.area / Math.PI)).toFixed(2)) : null,
    confidence: Number(confidence.toFixed(3)), brightness: Number(brightness.toFixed(1)),
    flag: !plausibleSize ? "implausible_shape" : confidence < .55 ? "low_confidence" : "ok",
  }
}

function SignalChart({ samples }: { samples: Sample[] }) {
  const usable = samples.filter((sample) => sample.diameter_px !== null && sample.confidence >= .55)
  const baseline = median(usable.filter((sample) => sample.t_ms <= 3000).map((sample) => sample.diameter_px!))
  if (!baseline || usable.length < 2) return <div className="signal-empty">The relative pupil trace will appear here once recording begins.</div>
  const points = usable.map((sample) => {
    const x = 12 + (sample.t_ms / RECORDING_MS) * 576
    const relative = ((sample.diameter_px! - baseline) / baseline) * 100
    const y = 82 - Math.max(-18, Math.min(18, relative)) * 2.7
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
  return <svg className="signal-chart" viewBox="0 0 600 164" role="img" aria-label="Relative pupil change over time">
    <line x1="12" y1="82" x2="588" y2="82" /><polyline points={points} />
    <text x="12" y="154">0 s</text><text x="548" y="154">15 s</text><text x="18" y="74">0%</text>
  </svg>
}

export function PupilProtocol() {
  const videoRef = useRef<HTMLVideoElement>(null), analysisRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null), recordingStartRef = useRef<number | null>(null)
  const lastSampleRef = useRef(0), animationRef = useRef<number | null>(null)
  const [camera, setCamera] = useState<"off" | "ready" | "error">("off")
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [deviceId, setDeviceId] = useState("")
  const [percentile, setPercentile] = useState(10), [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0), [samples, setSamples] = useState<Sample[]>([])
  const [reading, setReading] = useState<Reading | null>(null), [safetyConfirmed, setSafetyConfirmed] = useState(false)
  const [message, setMessage] = useState("")

  async function openCamera(requestedDeviceId?: string) {
    setMessage(""); streamRef.current?.getTracks().forEach((track) => track.stop())
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: requestedDeviceId
          ? { deviceId: { exact: requestedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false,
      })
      streamRef.current = media
      if (videoRef.current) { videoRef.current.srcObject = media; await videoRef.current.play() }
      const available = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput")
      setDevices(available); setDeviceId(media.getVideoTracks()[0]?.getSettings().deviceId || requestedDeviceId || ""); setCamera("ready")
    } catch { setCamera("error"); setMessage("The camera could not be opened. Check browser permission and use HTTPS or localhost.") }
  }

  useEffect(() => {
    if (camera !== "ready") return
    const tick = (now: number) => {
      const video = videoRef.current, canvas = analysisRef.current
      if (video && canvas && now - lastSampleRef.current >= SAMPLE_INTERVAL_MS) {
        lastSampleRef.current = now
        const next = estimate(video, canvas, percentile); setReading(next)
        if (recordingStartRef.current !== null) {
          const t = now - recordingStartRef.current
          if (t >= RECORDING_MS) {
            recordingStartRef.current = null; setElapsed(RECORDING_MS); setRecording(false)
            setMessage("The 15-second recording is complete. Review signal quality before exporting the CSV.")
          } else { setElapsed(t); setSamples((current) => [...current, { t_ms: Math.round(t), ...next }]) }
        }
      }
      animationRef.current = requestAnimationFrame(tick)
    }
    animationRef.current = requestAnimationFrame(tick)
    return () => { if (animationRef.current !== null) cancelAnimationFrame(animationRef.current) }
  }, [camera, percentile])

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])

  function beginRecording() {
    if (camera !== "ready" || !safetyConfirmed) return
    setSamples([]); setElapsed(0); setMessage(""); recordingStartRef.current = performance.now(); setRecording(true)
  }

  function stopCamera() {
    recordingStartRef.current = null; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null
    setRecording(false); setCamera("off"); setReading(null)
  }

  function download() {
    const valid = samples.filter((sample) => sample.diameter_px !== null && sample.confidence >= .55)
    const baseline = median(valid.filter((sample) => sample.t_ms <= 3000).map((sample) => sample.diameter_px!))
    const rows = samples.map((sample) => {
      const relative = baseline && sample.diameter_px !== null ? ((sample.diameter_px - baseline) / baseline) * 100 : null
      return `${sample.t_ms},${sample.diameter_px ?? ""},${relative?.toFixed(3) ?? ""},${sample.confidence},${sample.brightness},${sample.flag}`
    })
    const label = devices.find((device) => device.deviceId === deviceId)?.label || "camera"
    const csv = `# device=${label}\n# mode=visible-light-passive-observation\n# diagnostic=false\nt_ms,estimated_diameter_px,relative_change_percent,tracking_confidence,brightness,quality_flag\n${rows.join("\n")}`
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), anchor = document.createElement("a")
    anchor.href = url; anchor.download = `irispectra-pupil-prototype-${Date.now()}.csv`; anchor.click(); URL.revokeObjectURL(url)
  }

  const summary = useMemo(() => {
    const usable = samples.filter((sample) => sample.diameter_px !== null && sample.confidence >= .55)
    const brightnesses = usable.map((sample) => sample.brightness)
    const meanBrightness = brightnesses.length ? brightnesses.reduce((sum, value) => sum + value, 0) / brightnesses.length : 0
    const brightnessRange = brightnesses.length ? Math.max(...brightnesses) - Math.min(...brightnesses) : 0
    return { usable: usable.length, coverage: samples.length ? Math.round((usable.length / samples.length) * 100) : 0, lightStable: meanBrightness ? brightnessRange / meanBrightness < .16 : false }
  }, [samples])

  return <div className="form-wrap pupil-prototype">
    <section className="prototype-banner"><span><i aria-hidden="true" />PASSIVE MODE · NO IR · NO FLASH</span><p>This version observes relative change under stable visible light. It does not direct an infrared LED or screen flash toward the eye.</p></section>
    <section className="form-section"><p className="eyebrow">01 · CAMERA</p><h2>Select iPhone Camera or your Mac camera.</h2>
      <p>If the iPhone is connected through Continuity Camera, enable camera access first and then select iPhone Camera from the list. Keep the phone fixed and let one eye fill the oval guide.</p>
      <div className="camera-controls"><button className="btn primary" type="button" onClick={() => openCamera()} disabled={camera === "ready"}>Enable camera</button>
        <label className="camera-select"><span>Camera source</span><select value={deviceId} onChange={(event) => { setDeviceId(event.target.value); void openCamera(event.target.value) }} disabled={camera !== "ready" || recording}>
          {devices.length ? devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>) : <option>Available after camera permission</option>}
        </select></label><button className="btn" type="button" onClick={stopCamera} disabled={camera === "off"}>Stop camera</button></div>
      {message && <div className="status success">{message}</div>}
    </section>
    <section className="pupil-grid">
      <div className="camera-stage"><video ref={videoRef} muted playsInline /><div className="eye-guide" aria-hidden="true" /><span className="timer">LIVE · {camera.toUpperCase()}</span></div>
      <div className="analysis-stage"><canvas ref={analysisRef} /><span className="timer">CENTRE CROP · {reading?.flag.replaceAll("_", " ").toUpperCase() || "WAITING"}</span></div>
    </section>
    <section className="form-section"><p className="eyebrow">02 · FOCUS + THRESHOLD</p><h2>Adjust until the green box follows the pupil.</h2>
      <label className="threshold-control"><span>Dark-region percentile <output>{percentile}%</output></span><input type="range" min="4" max="22" value={percentile} onChange={(event) => setPercentile(Number(event.target.value))} /></label>
      <div className="quality live-quality"><div><small>live confidence</small><strong>{reading ? `${Math.round(reading.confidence * 100)}%` : "—"}</strong></div><div><small>light level</small><strong>{reading?.brightness ?? "—"}</strong></div><div><small>status</small><strong>{reading?.confidence && reading.confidence >= .55 ? "tracking" : "adjust"}</strong></div></div>
    </section>
    <section className="form-section"><p className="eyebrow">03 · 15-SECOND STABLE-LIGHT RECORDING</p><h2>No light stimulus is applied in this first version.</h2>
      <label className="consent"><input type="checkbox" checked={safetyConfirmed} onChange={(event) => setSafetyConfirmed(event.target.checked)} /><span>Room light is stable and there is no screen flash. I will stop immediately if I notice discomfort, pain or a change in vision.<small>This is a research prototype, not a medical device or diagnostic tool.</small></span></label>
      <div className="button-row"><button className="btn primary" type="button" onClick={beginRecording} disabled={camera !== "ready" || recording || !safetyConfirmed || (reading?.confidence ?? 0) < .55}>{recording ? `Recording · ${(elapsed / 1000).toFixed(1)} s` : "Record 15 seconds"}</button><button className="btn" type="button" onClick={download} disabled={!samples.length || recording}>Export CSV</button></div>
      <SignalChart samples={samples} />
      <div className="quality"><div><small>usable samples</small><strong>{summary.usable}</strong></div><div><small>tracking coverage</small><strong>{summary.coverage}%</strong></div><div><small>light stability</small><strong>{samples.length ? (summary.lightStable ? "stable" : "variable") : "—"}</strong></div></div>
      <p className="fine-print"><span className="tag measured">measured</span> Time, camera pixels and mean brightness. <span className="tag inferred">inferred</span> Dark-region pupil-diameter proxy and percentage change relative to the first three seconds. Video frames are processed on this page and are not uploaded to the server. Millimetres, PLR and clinical interpretation are not reported without calibration and validated segmentation.</p>
    </section>
  </div>
}
