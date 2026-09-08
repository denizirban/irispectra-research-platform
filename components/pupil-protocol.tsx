"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Side = "left" | "right"
type Mode = "reflex" | "effort"
type Phase = { name: string; label: string; from: number; to: number; bright?: boolean }
type Sample = { t_ms: number; phase: string; diameter_px: number | null; confidence: number; centre_x: number | null; centre_y: number | null }
type TaskAnswer = { question_id: string; correct: boolean; response_ms: number; answer: number }
type SessionContext = {
  sleep_hours: string; caffeine: string; medication: string; room_light: string
  stress_0_10: number; sleepiness_0_10: number; eye_discomfort_0_10: number
  screen_brightness_pct: number; perceived_effort_0_10: number
}
type Summary = {
  mode: Mode; side: Side; sample_count: number; coverage_pct: number; confidence: number
  baseline_px: number | null; minimum_px: number | null; constriction_amplitude_pct: number | null
  constriction_latency_ms: number | null; time_to_minimum_ms: number | null
  peak_constriction_velocity_px_s: number | null; recovery_6s_pct: number | null
  redilation_velocity_px_s: number | null; oscillation_cv_pct: number | null
  repeatability_delta_pct: number | null; snr_proxy: number | null
  easy_dilation_pct: number | null; hard_dilation_pct: number | null
  load_modulation_pct: number | null; task_accuracy_pct: number | null; mean_response_ms: number | null
}

const reflexPhases: Phase[] = [
  { name: "baseline", label: "baseline", from: 0, to: 6000 },
  { name: "light", label: "light 1", from: 6000, to: 10000, bright: true },
  { name: "recovery", label: "recovery", from: 10000, to: 20000 },
  { name: "light_repeat", label: "light 2", from: 20000, to: 24000, bright: true },
  { name: "recovery_repeat", label: "recovery 2", from: 24000, to: 30000 },
]
const effortPhases: Phase[] = [
  { name: "baseline", label: "baseline", from: 0, to: 8000 },
  { name: "easy", label: "easy", from: 8000, to: 26000 },
  { name: "rest", label: "rest", from: 26000, to: 32000 },
  { name: "hard", label: "hard", from: 32000, to: 52000 },
  { name: "recovery", label: "recovery", from: 52000, to: 60000 },
]
const effortQuestions = [
  { id: "easy_1", from: 8000, to: 17000, prompt: "8 + 5", options: [12, 13, 14], answer: 13 },
  { id: "easy_2", from: 17000, to: 26000, prompt: "15 - 7", options: [7, 8, 9], answer: 8 },
  { id: "hard_1", from: 32000, to: 42000, prompt: "17 × 4 - 9", options: [58, 59, 61], answer: 59 },
  { id: "hard_2", from: 42000, to: 52000, prompt: "(42 + 18) ÷ 5", options: [10, 12, 14], answer: 12 },
]
const emptyContext: SessionContext = {
  sleep_hours: "", caffeine: "", medication: "", room_light: "",
  stress_0_10: 5, sleepiness_0_10: 5, eye_discomfort_0_10: 0,
  screen_brightness_pct: 50, perceived_effort_0_10: 5,
}

const valid = (sample: Sample) => sample.diameter_px !== null && sample.confidence >= .4
const percentile = (values: number[], p: number) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))]
}
const phaseValues = (samples: Sample[], phase: string, offset: number, phases: Phase[]) => {
  const start = phases.find(item => item.name === phase)?.from || 0
  return samples.filter(sample => sample.phase === phase && sample.t_ms >= start + offset && valid(sample)).map(sample => sample.diameter_px!)
}
const medianFor = (samples: Sample[], phase: string, offset: number, phases: Phase[]) => percentile(phaseValues(samples, phase, offset, phases), .5)

function summarize(samples: Sample[], side: Side, mode: Mode, answers: TaskAnswer[]): Summary {
  const phases = mode === "reflex" ? reflexPhases : effortPhases
  const usable = samples.filter(valid)
  const baseline = medianFor(samples, "baseline", 1500, phases)
  const baselineValues = phaseValues(samples, "baseline", 1500, phases)
  const baselineMean = baselineValues.length ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length : null
  const baselineSd = baselineMean === null ? null : Math.sqrt(baselineValues.reduce((sum, value) => sum + (value - baselineMean) ** 2, 0) / baselineValues.length)
  const common: Summary = {
    mode, side, sample_count: samples.length, coverage_pct: samples.length ? usable.length / samples.length * 100 : 0,
    confidence: usable.length ? usable.reduce((sum, sample) => sum + sample.confidence, 0) / usable.length : 0,
    baseline_px: baseline, minimum_px: null, constriction_amplitude_pct: null, constriction_latency_ms: null,
    time_to_minimum_ms: null, peak_constriction_velocity_px_s: null, recovery_6s_pct: null,
    redilation_velocity_px_s: null, oscillation_cv_pct: baselineMean && baselineSd !== null ? baselineSd / baselineMean * 100 : null,
    repeatability_delta_pct: null, snr_proxy: null, easy_dilation_pct: null, hard_dilation_pct: null,
    load_modulation_pct: null, task_accuracy_pct: answers.length ? answers.filter(item => item.correct).length / answers.length * 100 : null,
    mean_response_ms: answers.length ? answers.reduce((sum, item) => sum + item.response_ms, 0) / answers.length : null,
  }
  if (mode === "effort") {
    const easy = medianFor(samples, "easy", 1000, phases), hard = medianFor(samples, "hard", 1000, phases)
    const easyDelta = baseline && easy !== null ? (easy - baseline) / baseline * 100 : null
    const hardDelta = baseline && hard !== null ? (hard - baseline) / baseline * 100 : null
    return { ...common, easy_dilation_pct: easyDelta, hard_dilation_pct: hardDelta, load_modulation_pct: easyDelta !== null && hardDelta !== null ? hardDelta - easyDelta : null }
  }

  const firstLight = samples.filter(sample => sample.phase === "light" && valid(sample))
  const secondLight = samples.filter(sample => sample.phase === "light_repeat" && valid(sample))
  const minimum = percentile(firstLight.map(sample => sample.diameter_px!), .05)
  const secondMinimum = percentile(secondLight.map(sample => sample.diameter_px!), .05)
  const amplitude = baseline && minimum !== null ? Math.max(0, (baseline - minimum) / baseline * 100) : null
  const secondAmplitude = baseline && secondMinimum !== null ? Math.max(0, (baseline - secondMinimum) / baseline * 100) : null
  const threshold = baseline ? baseline * .97 : null
  const latency = threshold === null ? undefined : firstLight.find((sample, index) => sample.diameter_px! <= threshold && firstLight[index + 1]?.diameter_px !== null && (firstLight[index + 1]?.diameter_px || Infinity) <= threshold)
  const minimumSample = minimum === null ? undefined : firstLight.reduce<Sample | undefined>((best, sample) => !best || Math.abs(sample.diameter_px! - minimum) < Math.abs(best.diameter_px! - minimum) ? sample : best, undefined)
  const constriction: number[] = [], redilation: number[] = []
  for (let index = 1; index < usable.length; index++) {
    const previous = usable[index - 1], current = usable[index], dt = (current.t_ms - previous.t_ms) / 1000
    if (dt <= 0 || dt > .35) continue
    const velocity = (current.diameter_px! - previous.diameter_px!) / dt
    if (current.phase === "light" && velocity < 0) constriction.push(-velocity)
    if (current.phase === "recovery" && velocity > 0) redilation.push(velocity)
  }
  const recoveryEnd = percentile(samples.filter(sample => sample.phase === "recovery" && sample.t_ms >= 15500 && valid(sample)).map(sample => sample.diameter_px!), .5)
  const recovery = baseline && minimum !== null && recoveryEnd !== null && baseline > minimum ? Math.max(0, Math.min(140, (recoveryEnd - minimum) / (baseline - minimum) * 100)) : null
  const signal = baseline !== null && minimum !== null ? Math.abs(baseline - minimum) : null
  return {
    ...common, minimum_px: minimum, constriction_amplitude_pct: amplitude,
    constriction_latency_ms: latency ? latency.t_ms - 6000 : null,
    time_to_minimum_ms: minimumSample ? minimumSample.t_ms - 6000 : null,
    peak_constriction_velocity_px_s: percentile(constriction, .9), recovery_6s_pct: recovery,
    redilation_velocity_px_s: percentile(redilation, .5),
    repeatability_delta_pct: amplitude !== null && secondAmplitude !== null ? Math.abs(amplitude - secondAmplitude) : null,
    snr_proxy: signal !== null && baselineSd && baselineSd > 0 ? signal / baselineSd : null,
  }
}

function estimate(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const width = 192, height = 144
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(video, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data, gray = new Uint8Array(width * height)
  let darkest = 999, seed = Math.floor(height / 2) * width + Math.floor(width / 2)
  for (let y = 16; y < height - 16; y++) for (let x = 24; x < width - 24; x++) {
    const index = y * width + x, pixel = index * 4
    const value = Math.round(.2126 * rgba[pixel] + .7152 * rgba[pixel + 1] + .0722 * rgba[pixel + 2]); gray[index] = value
    const penalty = Math.hypot((x - width / 2) / width, (y - height / 2) / height) * 80
    if (value + penalty < darkest) { darkest = value + penalty; seed = index }
  }
  const threshold = Math.min(92, gray[seed] + 30), queue = new Int32Array(width * height), seen = new Uint8Array(width * height)
  let head = 0, tail = 0, area = 0, minX = width, maxX = 0, minY = height, maxY = 0, sumX = 0, sumY = 0, perimeter = 0
  queue[tail++] = seed; seen[seed] = 1
  while (head < tail && area < width * height * .22) {
    const index = queue[head++], x = index % width, y = Math.floor(index / width)
    if (gray[index] > threshold || x < 18 || x >= width - 18 || y < 10 || y >= height - 10) continue
    area++; sumX += x; sumY += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    for (const neighbour of [index - 1, index + 1, index - width, index + width]) {
      if (neighbour <= 0 || neighbour >= seen.length || gray[neighbour] > threshold) perimeter++
      else if (!seen[neighbour]) { seen[neighbour] = 1; queue[tail++] = neighbour }
    }
  }
  const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1
  const aspect = area > 0 ? Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight) : 0
  const circularity = area > 0 ? Math.min(1, 4 * Math.PI * area / Math.max(1, perimeter ** 2)) : 0
  const plausible = area > 75 && area < 3300 && boxWidth > 8 && boxWidth < 92 && boxHeight > 8 && boxHeight < 92 && aspect > .48
  const confidence = plausible ? Math.min(1, .38 * aspect + .34 * circularity + .28 * Math.min(1, area / 420)) : 0
  return { diameter: plausible ? 2 * Math.sqrt(area / Math.PI) : null, confidence, centreX: plausible ? sumX / area / width : null, centreY: plausible ? sumY / area / height : null }
}

const display = (value: number | null, unit = "", digits = 1) => value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits) + unit

export function PupilProtocol() {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), stream = useRef<MediaStream | null>(null), timer = useRef<number | null>(null)
  const [camera, setCamera] = useState<"off" | "ready" | "error">("off")
  const [running, setRunning] = useState(false), [elapsed, setElapsed] = useState(0), [samples, setSamples] = useState<Sample[]>([])
  const [mode, setMode] = useState<Mode>("reflex"), [side, setSide] = useState<Side>("left"), [answers, setAnswers] = useState<TaskAnswer[]>([])
  const [runs, setRuns] = useState<Record<string, Summary>>({}), [message, setMessage] = useState("")
  const [context, setContext] = useState<SessionContext>(emptyContext)
  const phases = mode === "reflex" ? reflexPhases : effortPhases
  const totalDuration = phases[phases.length - 1].to
  const phase = phases.find(item => elapsed >= item.from && elapsed < item.to) || phases[phases.length - 1]
  const activeQuestion = mode === "effort" ? effortQuestions.find(item => elapsed >= item.from && elapsed < item.to) : undefined
  const summary = useMemo(() => summarize(samples, side, mode, answers), [samples, side, mode, answers])
  const contextComplete = Boolean(context.sleep_hours && context.caffeine && context.medication && context.room_light)
  const updateContext = <K extends keyof SessionContext>(key: K, value: SessionContext[K]) => setContext(old => ({ ...old, [key]: value }))

  useEffect(() => () => { stream.current?.getTracks().forEach(track => track.stop()); if (timer.current) window.clearInterval(timer.current) }, [])
  async function enable() {
    setMessage("")
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false })
      stream.current = media; if (video.current) { video.current.srcObject = media; await video.current.play() }; setCamera("ready")
    } catch { setCamera("error"); setMessage("Camera access failed. Check browser permission and use HTTPS.") }
  }
  function resetCapture(nextMode = mode, nextSide = side) { setMode(nextMode); setSide(nextSide); setSamples([]); setAnswers([]); setElapsed(0); setMessage("") }
  function run() {
    if (camera !== "ready" || !video.current || !canvas.current || !contextComplete) return
    setSamples([]); setAnswers([]); setElapsed(0); setRunning(true); setMessage("")
    const start = performance.now()
    timer.current = window.setInterval(() => {
      const time = performance.now() - start
      if (time >= totalDuration) {
        if (timer.current) window.clearInterval(timer.current)
        timer.current = null; setElapsed(totalDuration); setRunning(false)
        setMessage("Capture complete. Add the post-run effort rating, then save or export the session.")
        return
      }
      setElapsed(time)
      const current = phases.find(item => time >= item.from && time < item.to) || phases[phases.length - 1]
      const reading = estimate(video.current!, canvas.current!)
      setSamples(old => [...old, { t_ms: Math.round(time), phase: current.name, diameter_px: reading.diameter === null ? null : Number(reading.diameter.toFixed(2)), confidence: Number(reading.confidence.toFixed(3)), centre_x: reading.centreX === null ? null : Number(reading.centreX.toFixed(3)), centre_y: reading.centreY === null ? null : Number(reading.centreY.toFixed(3)) }])
    }, 80)
  }
  function answerTask(value: number) {
    if (!activeQuestion || answers.some(item => item.question_id === activeQuestion.id)) return
    setAnswers(old => [...old, { question_id: activeQuestion.id, answer: value, correct: value === activeQuestion.answer, response_ms: Math.max(0, Math.round(elapsed - activeQuestion.from)) }])
  }
  function saveRun() {
    if (!samples.length || running) return
    setRuns(value => ({ ...value, [mode + "-" + side]: summary }))
    setMessage((mode === "reflex" ? "Light-response" : "Cognitive-effort") + " run stored locally for this session.")
  }
  function download() {
    const metadata = [["record_type", "session_context"], ["created_at", new Date().toISOString()], ["mode", mode], ["eye", side], ...Object.entries(context), ...Object.entries(summary), ["task_answers_json", JSON.stringify(answers)]]
      .map(row => "# " + row[0] + "," + JSON.stringify(row[1])).join("\n")
    const rows = ["t_ms,phase,estimated_diameter_px,tracking_confidence,centre_x_0_1,centre_y_0_1", ...samples.map(sample => [sample.t_ms, sample.phase, sample.diameter_px ?? "", sample.confidence, sample.centre_x ?? "", sample.centre_y ?? ""].join(","))].join("\n")
    const url = URL.createObjectURL(new Blob([metadata + "\n" + rows], { type: "text/csv" }))
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "irispectra-pupil-" + mode + "-" + side + "-" + Date.now() + ".csv"; anchor.click(); URL.revokeObjectURL(url)
  }
  const rangeField = (label: string, key: "stress_0_10" | "sleepiness_0_10" | "eye_discomfort_0_10" | "perceived_effort_0_10") => <label className="context-range"><span>{label}<b>{context[key]}/10</b></span><input type="range" min="0" max="10" value={context[key]} onChange={event => updateContext(key, Number(event.target.value))} /></label>

  const usable = samples.filter(valid), diameters = usable.map(sample => sample.diameter_px!)
  const low = diameters.length ? Math.min(...diameters) : 0, high = diameters.length ? Math.max(...diameters) : 1, range = Math.max(.01, high - low)
  const trace = usable.map(sample => Math.max(0, Math.min(100, sample.t_ms / totalDuration * 100)) + "," + (40 - ((sample.diameter_px! - low) / range) * 32)).join(" ")
  const left = runs["reflex-left"], right = runs["reflex-right"]
  const bilateral = left && right ? {
    amplitude: left.constriction_amplitude_pct !== null && right.constriction_amplitude_pct !== null ? Math.abs(left.constriction_amplitude_pct - right.constriction_amplitude_pct) : null,
    latency: left.constriction_latency_ms !== null && right.constriction_latency_ms !== null ? Math.abs(left.constriction_latency_ms - right.constriction_latency_ms) : null,
  } : null
  const answeredCurrent = activeQuestion && answers.some(item => item.question_id === activeQuestion.id)

  return <div className="form-wrap pupil-prototype">
    <section className="pupil-brief"><span>N-OF-1 · LOCAL RESEARCH SESSION</span><h2>Give every pupil trace a condition and a task.</h2><p>Record the conditions that alter pupil size. Then run either the light-reflex sequence or a constant-luminance cognitive challenge. Results are meaningful only as repeatable within-person measurements.</p></section>

    <section className="session-context" aria-labelledby="session-context-title">
      <header><div><span>01 / SESSION CONTEXT</span><h3 id="session-context-title">What could change today&apos;s response?</h3></div><p>Required fields travel with the raw CSV. They are measurement context, not diagnoses.</p></header>
      <div className="context-grid">
        <label><span>Sleep last night</span><select value={context.sleep_hours} onChange={event => updateContext("sleep_hours", event.target.value)}><option value="">Select</option><option value="under_5">Under 5 h</option><option value="5_to_7">5–7 h</option><option value="7_to_9">7–9 h</option><option value="over_9">Over 9 h</option></select></label>
        <label><span>Last caffeine</span><select value={context.caffeine} onChange={event => updateContext("caffeine", event.target.value)}><option value="">Select</option><option value="none">None today</option><option value="under_2h">Under 2 h</option><option value="2_to_6h">2–6 h</option><option value="over_6h">Over 6 h</option></select></label>
        <label><span>Medication or pupil-affecting substance</span><select value={context.medication} onChange={event => updateContext("medication", event.target.value)}><option value="">Select</option><option value="none">None known</option><option value="yes_recorded_elsewhere">Yes</option><option value="unsure">Unsure</option></select></label>
        <label><span>Room light</span><select value={context.room_light} onChange={event => updateContext("room_light", event.target.value)}><option value="">Select</option><option value="dim">Dim</option><option value="moderate">Moderate</option><option value="bright">Bright</option></select></label>
        {rangeField("Stress now", "stress_0_10")}{rangeField("Sleepiness now", "sleepiness_0_10")}{rangeField("Eye discomfort", "eye_discomfort_0_10")}
        <label className="context-range"><span>Screen brightness<b>{context.screen_brightness_pct}%</b></span><input type="range" min="10" max="100" step="5" value={context.screen_brightness_pct} onChange={event => updateContext("screen_brightness_pct", Number(event.target.value))} /></label>
      </div>
      {!contextComplete && <p className="context-hint">Complete the four selection fields before starting a run.</p>}
    </section>

    <section className="pupil-runbar">
      <div className="segmented-control" role="group" aria-label="Protocol mode"><button type="button" className={mode === "reflex" ? "is-active" : ""} onClick={() => !running && resetCapture("reflex", side)}>Light response</button><button type="button" className={mode === "effort" ? "is-active" : ""} onClick={() => !running && resetCapture("effort", side)}>Cognitive effort</button></div>
      <div className="segmented-control" role="group" aria-label="Eye laterality">{(["left", "right"] as Side[]).map(value => <button key={value} type="button" className={side === value ? "is-active" : ""} onClick={() => !running && resetCapture(mode, value)} disabled={running}>{value} eye {runs[mode + "-" + value] ? "✓" : ""}</button>)}</div>
      <div className="button-row"><button className="btn" type="button" onClick={enable} disabled={camera === "ready" || running}>Enable camera</button><button className="btn primary" type="button" onClick={run} disabled={camera !== "ready" || running || !contextComplete}>{running ? "Measuring…" : "Start " + (mode === "reflex" ? "30 s" : "60 s") + " run"}</button></div>
    </section>

    <section className="pupil-grid">
      <div className="camera-stage"><video ref={video} muted playsInline /><div className="eye-guide" aria-hidden="true" /><canvas ref={canvas} hidden /><span className="timer">{side.toUpperCase()} EYE · CAMERA {camera.toUpperCase()}</span></div>
      <div className={"protocol-stage " + (mode === "effort" ? "cognitive" : phase.bright && running ? "" : "dark")}>
        {mode === "reflex" ? <div className="stimulus" /> : <div className="task-stage">{!running ? <><small>CONSTANT-LUMINANCE TASK</small><strong>Fixate here</strong><p>Easy and hard arithmetic blocks create time-locked cognitive conditions.</p></> : activeQuestion ? <><small>{phase.label.toUpperCase()} QUESTION</small><strong>{activeQuestion.prompt}</strong><div>{activeQuestion.options.map(option => <button key={option} type="button" disabled={Boolean(answeredCurrent)} onClick={() => answerTask(option)}>{option}</button>)}</div>{answeredCurrent && <p>Response recorded. Keep looking at the centre.</p>}</> : <><small>{phase.label.toUpperCase()}</small><strong>+</strong><p>Keep your gaze steady and breathe normally.</p></>}</div>}
        <span className="timer">{running ? phase.label.toUpperCase() + " · " + (elapsed / 1000).toFixed(1) + " / " + (totalDuration / 1000).toFixed(0) + " s" : "STIMULUS IDLE"}</span>
      </div>
    </section>

    <section className="pupil-results">
      <div className="pupil-trace" aria-label="Pupil diameter pixel proxy over the protocol">
        <header><div><span>DIAMETER TRACE · PIXEL PROXY</span><strong>{running ? phase.label : samples.length ? "capture complete" : "awaiting measurement"}</strong></div><span>{summary.coverage_pct ? summary.coverage_pct.toFixed(0) + "% tracked" : (totalDuration / 1000).toFixed(0) + ".0 s protocol"}</span></header>
        <svg viewBox="0 0 100 44" role="img" aria-label="Tracked pupil diameter across protocol phases">
          {phases.map(item => <rect key={item.name} x={item.from / totalDuration * 100} y="0" width={(item.to - item.from) / totalDuration * 100} height="44" className={item.bright ? "phase-light" : "phase-dark"} />)}
          {[8, 24, 40].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} />)}{trace && <polyline points={trace} />}
        </svg>
        <footer>{phases.map(item => <span key={item.name} style={{ width: (item.to - item.from) / totalDuration * 100 + "%" }}>{item.label}</span>)}</footer>
      </div>

      {mode === "reflex" ? <div className="pupil-metrics detailed">
        <div><small>baseline diameter</small><strong>{display(summary.baseline_px, " px")}</strong></div><div><small>minimum diameter</small><strong>{display(summary.minimum_px, " px")}</strong></div>
        <div><small>constriction amplitude</small><strong>{display(summary.constriction_amplitude_pct, "%")}</strong></div><div><small>response latency</small><strong>{display(summary.constriction_latency_ms, " ms", 0)}</strong></div>
        <div><small>time to minimum</small><strong>{display(summary.time_to_minimum_ms, " ms", 0)}</strong></div><div><small>peak constriction velocity</small><strong>{display(summary.peak_constriction_velocity_px_s, " px/s")}</strong></div>
        <div><small>6 s recovery</small><strong>{display(summary.recovery_6s_pct, "%")}</strong></div><div><small>redilation velocity</small><strong>{display(summary.redilation_velocity_px_s, " px/s")}</strong></div>
        <div><small>baseline oscillation CV</small><strong>{display(summary.oscillation_cv_pct, "%", 2)}</strong></div><div><small>repeatability delta</small><strong>{display(summary.repeatability_delta_pct, "%")}</strong></div>
        <div><small>valid frames</small><strong>{summary.sample_count ? summary.coverage_pct.toFixed(0) + "%" : "—"}</strong></div><div><small>SNR proxy</small><strong>{display(summary.snr_proxy, "", 2)}</strong></div>
      </div> : <div className="pupil-metrics detailed effort-metrics">
        <div><small>baseline diameter</small><strong>{display(summary.baseline_px, " px")}</strong></div><div><small>easy-block dilation</small><strong>{display(summary.easy_dilation_pct, "%")}</strong></div>
        <div><small>hard-block dilation</small><strong>{display(summary.hard_dilation_pct, "%")}</strong></div><div><small>hard minus easy</small><strong>{display(summary.load_modulation_pct, "%")}</strong></div>
        <div><small>task accuracy</small><strong>{display(summary.task_accuracy_pct, "%", 0)}</strong></div><div><small>mean response time</small><strong>{display(summary.mean_response_ms, " ms", 0)}</strong></div>
        <div><small>valid frames</small><strong>{summary.sample_count ? summary.coverage_pct.toFixed(0) + "%" : "—"}</strong></div><div><small>baseline oscillation CV</small><strong>{display(summary.oscillation_cv_pct, "%", 2)}</strong></div>
      </div>}

      {samples.length > 0 && !running && <div className="post-run-rating">{rangeField("Perceived effort after this run", "perceived_effort_0_10")}</div>}
      <div className="button-row result-actions"><button className="btn" type="button" onClick={saveRun} disabled={!samples.length || running}>Save {side} run</button><button className="btn" type="button" onClick={download} disabled={!samples.length || running}>Export session CSV</button></div>
      {bilateral && <div className="bilateral-pupil"><div><small>inter-eye amplitude difference</small><strong>{display(bilateral.amplitude, "%")}</strong></div><div><small>inter-eye latency difference</small><strong>{display(bilateral.latency, " ms", 0)}</strong></div><p>Within-session comparison of sequential browser runs. It is sensitive to camera exposure, distance, screen luminance and alignment.</p></div>}
      {message && <div className="status success">{message}</div>}
      <p className="fine-print"><span className="tag measured">measured</span> Frame timing, dark-region area, centre, task response and tracking confidence. <span className="tag inferred">derived</span> Reflex and effort proxies from a relative pixel trace. Absolute millimetres, neurological scores and diagnoses remain disabled. Reflective questions in the Irispectra concept belong to separate CALM / SEED modules; they are not pupil biomarkers.</p>
    </section>
    <style jsx global>{`
      .session-context{margin-bottom:16px;padding:24px;border:1px solid var(--line);border-radius:20px;background:#fff}
      .session-context header{display:grid;grid-template-columns:1fr minmax(240px,.6fr);gap:36px;align-items:end;padding-bottom:22px;border-bottom:1px solid var(--line)}
      .session-context header span{color:var(--muted);font:10px "Irispectra Mono",ui-monospace,monospace;letter-spacing:.1em}
      .session-context header h3{margin:9px 0 0;font-size:24px;font-weight:520;letter-spacing:-.025em}
      .session-context header p{margin:0;color:#77777c;font-size:13px;line-height:1.5}
      .context-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:22px;border:1px solid var(--line);background:var(--line)}
      .context-grid>label,.post-run-rating{min-width:0;padding:16px;background:#f8f8fa}
      .context-grid label>span,.context-range>span{display:flex;justify-content:space-between;gap:12px;min-height:30px;color:#6e6e73;font-size:11px;line-height:1.35}
      .context-grid select{width:100%;min-height:40px;border:0;border-bottom:1px solid #c7c7cb;border-radius:0;background:transparent;color:#111}
      .context-range b{color:#111;font:500 10px "Irispectra Mono",ui-monospace,monospace;white-space:nowrap}
      .context-range input{width:100%;accent-color:#111}
      .context-hint{margin:16px 0 0;color:#9b3228;font:11px "Irispectra Mono",ui-monospace,monospace}
      .protocol-stage.cognitive{background:#d8d8d8;color:#111}
      .task-stage{width:min(84%,440px);min-height:250px;display:grid;place-items:center;align-content:center;gap:17px;padding:28px;border-radius:24px;background:#e7e7e7;text-align:center}
      .task-stage small{color:#777;font:10px "Irispectra Mono",ui-monospace,monospace;letter-spacing:.08em}
      .task-stage strong{font-size:clamp(34px,5vw,58px);font-weight:500;letter-spacing:-.04em}
      .task-stage p{max-width:320px;margin:0;color:#707075;font-size:12px;line-height:1.45}
      .task-stage>div{display:flex;gap:8px}.task-stage button{min-width:70px;min-height:44px;border:1px solid #aaa;border-radius:999px;background:#f7f7f7;color:#111;cursor:pointer}
      .task-stage button:disabled{opacity:.45}.post-run-rating{margin-top:14px;border:1px solid var(--line);border-radius:14px}
      @media(max-width:900px){.context-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:560px){.session-context header,.context-grid{grid-template-columns:1fr}}
    `}</style>
  </div>
}
