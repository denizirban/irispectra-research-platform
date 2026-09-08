"use client"

import { FormEvent, useMemo, useRef, useState } from "react"

type Quality = { width: number; height: number; brightness: number; glare: number; sharpness: number }
type Side = "left" | "right"
type RegionMetric = {
  id?: string
  label?: string
  radial_range?: string
  zone?: string
  clock?: number
  usable_px: number
  usable_fraction: number
  mean_luminance_0_1: number
  contrast_0_1: number
  entropy_0_1: number
  fine_detail_energy_0_1: number
  radial_structure_0_1: number
  concentric_structure_0_1: number
  dark_discontinuity_fraction_0_1: number
  texture_complexity_0_1: number
}
type RegionalProfile = {
  coordinate_system: string
  dark_threshold_0_255: number
  zones: RegionMetric[]
  sectors: RegionMetric[]
  cells: RegionMetric[]
  minute_sectors?: Array<RegionMetric & { minute: number; degree_from_12_clockwise: number }>
  atlas_zones?: Array<RegionMetric & { id: string; label: string; radial_range: string }>
  atlas_cells?: Array<RegionMetric & { atlas_zone: number; minute: number }>
  collarette?: {
    status: string
    samples: Array<{ minute: number; radial_fraction: number; confidence_0_1: number }>
    mean_radial_fraction: number
    irregularity_0_1: number
    confidence_0_1: number
  }
  summary: {
    angular_heterogeneity_0_1: number
    dominant_texture_sectors: number[]
    inner_outer_luminance_delta: number
    strongest_radial_zone: string
    strongest_concentric_zone: string
  }
}
type IrisMetric = Record<string, unknown> & { laterality: Side; regional_profile?: RegionalProfile }
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
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image decode failed")) }
    image.src = objectUrl
  })
  const size = 320
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, size, size)
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
  const width = source.naturalWidth, height = source.naturalHeight
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

const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const percent = (value: unknown, digits = 0) => `${(numberValue(value) * 100).toFixed(digits)}%`
const zoneName = (value: string) => value === "inner" ? "inner / pupillary" : value === "middle" ? "middle / stromal" : "outer / peripheral"
const clockName = (value: number) => `${value} o’clock`
const minuteName = (value: number) => `${String(value).padStart(2, "0")} min · ${value * 6}° clockwise from 12`

const atlasBandNames = [
  "inner pupillary margin",
  "pupillary field",
  "collarette field",
  "inner ciliary field",
  "outer ciliary field",
  "peripheral rim",
]

function angularAtlasFamily(side: Side, minute: number) {
  if (minute >= 55 || minute < 5) return "cerebral / neuroendocrine reference family"
  if (minute < 10) return "upper-airway / cervical reference family"
  if (minute < 20) return "thoracic / pulmonary reference family"
  if (minute < 30) return side === "left" ? "splenic / abdominal-pelvic reference family" : "hepatic / abdominal-pelvic reference family"
  if (minute < 40) return "urogenital / pelvic reference family"
  if (minute < 50) return side === "left" ? "cardiopulmonary / digestive reference family" : "hepatobiliary / pulmonary reference family"
  return "cranial / ear / medullary reference family"
}

function atlasReference(side: Side, atlasZone: number, minute: number) {
  if (atlasZone === 1) return "inner pupillary border reference"
  if (atlasZone === 2) return "pupillary / gastrointestinal topography"
  if (atlasZone === 3) return "collarette / autonomic-boundary reference"
  if (atlasZone === 5) return `outer ciliary · ${angularAtlasFamily(side, minute)}`
  if (atlasZone === 6) return "peripheral lymphatic / skin reference"
  return angularAtlasFamily(side, minute)
}

function polarPoint(radius: number, minute: number) {
  const angle = minute / 60 * Math.PI * 2 - Math.PI / 2
  return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) }
}

function atlasCellPath(zone: number, minute: number) {
  const boundaries = [14, 19.4, 24.9, 30.3, 37.1, 43.2, 48]
  const inner = boundaries[zone - 1]
  const outer = boundaries[zone]
  const start = minute - .5
  const end = minute + .5
  const a = polarPoint(inner, start)
  const b = polarPoint(outer, start)
  const c = polarPoint(outer, end)
  const d = polarPoint(inner, end)
  return `M ${a.x} ${a.y} L ${b.x} ${b.y} A ${outer} ${outer} 0 0 1 ${c.x} ${c.y} L ${d.x} ${d.y} A ${inner} ${inner} 0 0 0 ${a.x} ${a.y} Z`
}

function collarettePath(samples: Array<{ minute: number; radial_fraction: number }>) {
  if (!samples.length) return ""
  return samples.map((sample, index) => {
    const point = polarPoint(14 + sample.radial_fraction * 34, sample.minute)
    return `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  }).join(" ") + " Z"
}

function evidenceConfidence(metric: IrisMetric) {
  const usable = numberValue(metric.usable_annulus_fraction)
  const glare = numberValue(metric.glare_fraction)
  const sharpness = numberValue(metric.laplacian_abs_mean)
  const score = .5 * usable + .25 * Math.max(0, 1 - glare / .16) + .25 * Math.min(1, sharpness / 18)
  return score >= .82 ? { label: "strong image evidence", score } : score >= .62 ? { label: "moderate image evidence", score } : { label: "limited image evidence", score }
}

function RegionalMap({ metric }: { metric: IrisMetric }) {
  const profile = metric.regional_profile
  if (!profile?.cells?.length) return null
  const clocks = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const zones = ["inner", "middle", "outer"]
  return <div className="regional-map-wrap">
    <div className="regional-map-head"><strong>{metric.laterality === "left" ? "LEFT · OS" : "RIGHT · OD"}</strong><span>relative texture complexity · 36 measured regions</span></div>
    <div className="regional-map" role="table" aria-label={`${metric.laterality} iris regional texture map`}>
      <div className="regional-corner" role="columnheader">ZONE / CLOCK</div>
      {clocks.map(clock => <div key={clock} className="regional-clock" role="columnheader">{clock}</div>)}
      {zones.map(zone => <div className="regional-map-row" role="row" key={zone}>
        <div className="regional-zone-label" role="rowheader">{zone}</div>
        {clocks.map(clock => {
          const cell = profile.cells.find(candidate => candidate.zone === zone && candidate.clock === clock)
          const value = cell?.texture_complexity_0_1 ?? 0
          const usable = cell?.usable_fraction ?? 0
          return <div
            key={clock}
            className={`regional-cell ${usable < .2 ? "is-limited" : ""}`}
            role="cell"
            title={`${zoneName(zone)}, ${clockName(clock)}: texture ${percent(value)}, usable ${percent(usable)}`}
            style={{ backgroundColor: `rgba(191,255,39,${Math.max(.06, Math.min(.92, value))})` }}
          ><span>{Math.round(value * 100)}</span></div>
        })}
      </div>)}
    </div>
    <p className="map-caption">Each cell is a pupil-centred radial band × clock sector. Dark hatching means the region has limited unmasked pixels.</p>
  </div>
}

function AndrewsAtlas({ metric, preview, calibration, quality }: { metric: IrisMetric; preview: string | null; calibration: Calibration; quality: Quality | null }) {
  const profile = metric.regional_profile
  const cells = profile?.atlas_cells || []
  const collarette = profile?.collarette
  const strongest = useMemo(() => [...cells]
    .filter(cell => cell.usable_fraction >= .3)
    .sort((a, b) => b.texture_complexity_0_1 - a.texture_complexity_0_1), [cells])
  const [selectedKey, setSelectedKey] = useState("")
  const [mode, setMode] = useState<"morphology" | "atlas" | "combined">("combined")
  if (!cells.length || !collarette?.samples?.length) return null
  const selected = cells.find(cell => `${cell.atlas_zone}-${cell.minute}` === selectedKey) || strongest[0] || cells[0]
  const imageScaleX = 47 / Math.max(1, calibration.irisRadius)
  const irisRadiusY = calibration.irisRadius * ((quality?.width || 1) / (quality?.height || 1))
  const imageScaleY = 47 / Math.max(1, irisRadiusY)
  const imageX = 50 - calibration.irisCenterX * imageScaleX
  const imageY = 50 - calibration.irisCenterY * imageScaleY
  const bandColours = ["#d9f7ff", "#f2d966", "#60d4c1", "#ee8f5d", "#93d36d", "#c8c4ba"]
  const point = polarPoint(14 + ((selected.atlas_zone - .5) / 6) * 34, selected.minute)
  const topFindings = strongest.slice(0, 8)

  return <section className="andrews-atlas" aria-label={`${metric.laterality} iris Andrews reference atlas`}>
    <header className="atlas-head">
      <div><span>ANDREWS REFERENCE LAYER · {metric.laterality === "left" ? "OS" : "OD"}</span><h4>Measured morphology over a 60-minute polar atlas</h4></div>
      <div className="atlas-modes" role="group" aria-label="Atlas display layer">
        {(["morphology", "atlas", "combined"] as const).map(value => <button key={value} type="button" className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>{value}</button>)}
      </div>
    </header>
    <div className="atlas-workspace">
      <div className="atlas-disc-wrap">
        <svg className="atlas-disc" viewBox="0 0 100 100" role="img" aria-label="Normalised iris atlas with measured regional texture">
          <defs><clipPath id={`iris-clip-${metric.laterality}`}><circle cx="50" cy="50" r="48" /></clipPath></defs>
          <circle cx="50" cy="50" r="48" fill="#171815" />
          {preview && <image href={preview} x={imageX} y={imageY} width={100 * imageScaleX} height={100 * imageScaleY} preserveAspectRatio="none" opacity={mode === "atlas" ? .14 : .72} clipPath={`url(#iris-clip-${metric.laterality})`} />}
          {cells.map(cell => {
            const key = `${cell.atlas_zone}-${cell.minute}`
            const active = key === `${selected.atlas_zone}-${selected.minute}`
            const measuredOpacity = mode === "atlas" ? .04 : Math.max(.03, Math.min(.68, cell.texture_complexity_0_1 * .78))
            const fill = mode === "morphology" ? `rgba(191,255,39,${measuredOpacity})` : mode === "atlas" ? bandColours[cell.atlas_zone - 1] : active ? "#bfff27" : `rgba(191,255,39,${measuredOpacity})`
            return <path key={key} d={atlasCellPath(cell.atlas_zone, cell.minute)} fill={fill} fillOpacity={mode === "atlas" ? .2 : 1} stroke={active ? "#bfff27" : "rgba(255,255,255,.12)"} strokeWidth={active ? .38 : .08} onClick={() => setSelectedKey(key)} className="atlas-cell-path"><title>{atlasBandNames[cell.atlas_zone - 1]}, {minuteName(cell.minute)}; texture {percent(cell.texture_complexity_0_1)}</title></path>
          })}
          {(mode === "atlas" || mode === "combined") && [19.4, 24.9, 30.3, 37.1, 43.2, 48].map(radius => <circle key={radius} cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,.42)" strokeWidth=".18" />)}
          {(mode === "atlas" || mode === "combined") && Array.from({ length: 60 }, (_, minute) => {
            const a = polarPoint(minute % 5 === 0 ? 47 : 48, minute)
            const b = polarPoint(49.2, minute)
            return <line key={minute} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={minute % 5 === 0 ? "#f4f2ea" : "rgba(244,242,234,.55)"} strokeWidth={minute % 5 === 0 ? .35 : .14} />
          })}
          <path d={collarettePath(collarette.samples)} fill="none" stroke="#f3d56a" strokeWidth=".55" strokeDasharray="1.2 .7" />
          <circle cx="50" cy="50" r="14" fill="#070807" stroke="#f4f2ea" strokeWidth=".42" />
          <circle cx={point.x} cy={point.y} r=".85" fill="#bfff27" stroke="#111" strokeWidth=".28" />
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(minute => {
            const labelPoint = polarPoint(52, minute)
            return <text key={minute} x={labelPoint.x} y={labelPoint.y} textAnchor="middle" dominantBaseline="middle">{minute}</text>
          })}
        </svg>
        <div className="atlas-legend"><span><i className="collarette-key" />image-derived collarette estimate</span><span><i className="selection-key" />selected measured region</span></div>
      </div>
      <aside className="atlas-inspector">
        <span className="atlas-coordinate">{minuteName(selected.minute)} · BAND {selected.atlas_zone}</span>
        <h5>{atlasBandNames[selected.atlas_zone - 1]}</h5>
        <dl>
          <div><dt>texture complexity</dt><dd>{percent(selected.texture_complexity_0_1)}</dd></div>
          <div><dt>contrast</dt><dd>{selected.contrast_0_1.toFixed(3)}</dd></div>
          <div><dt>dark discontinuity</dt><dd>{percent(selected.dark_discontinuity_fraction_0_1, 1)}</dd></div>
          <div><dt>usable evidence</dt><dd>{percent(selected.usable_fraction)}</dd></div>
        </dl>
        <div className="atlas-reference-note"><small>HISTORICAL ATLAS OVERLAP</small><strong>{atlasReference(metric.laterality, selected.atlas_zone, selected.minute)}</strong><p>This is a coordinate lookup in the Andrews reference chart, not evidence that the named organ or system is abnormal.</p></div>
      </aside>
    </div>
    <div className="atlas-findings"><strong>Highest relative texture regions</strong><div>{topFindings.map(cell => {
      const key = `${cell.atlas_zone}-${cell.minute}`
      return <button key={key} type="button" className={key === `${selected.atlas_zone}-${selected.minute}` ? "is-active" : ""} onClick={() => setSelectedKey(key)}><span>{String(cell.minute).padStart(2, "0")}′</span>{atlasBandNames[cell.atlas_zone - 1]}<b>{Math.round(cell.texture_complexity_0_1 * 100)}</b></button>
    })}</div></div>
    <footer><span>COLLARETTE CONFIDENCE {percent(collarette.confidence_0_1)}</span><span>ANGULAR IRREGULARITY {percent(collarette.irregularity_0_1)}</span><p>The yellow contour is an image-derived hypothesis and remains editable/confirmable in future acquisition versions.</p></footer>
  </section>
}

function ZoneProfile({ metric }: { metric: IrisMetric }) {
  const zones = metric.regional_profile?.zones
  if (!zones?.length) return null
  return <div className="zone-profile">
    {zones.map(zone => <article key={zone.id} className="zone-card">
      <header><span>{zone.radial_range}</span><h4>{zone.label}</h4></header>
      <dl>
        <div><dt>texture complexity</dt><dd>{percent(zone.texture_complexity_0_1)}</dd></div>
        <div><dt>entropy</dt><dd>{zone.entropy_0_1.toFixed(3)}</dd></div>
        <div><dt>contrast</dt><dd>{zone.contrast_0_1.toFixed(3)}</dd></div>
        <div><dt>radial orientation</dt><dd>{zone.radial_structure_0_1.toFixed(3)}</dd></div>
        <div><dt>concentric orientation</dt><dd>{zone.concentric_structure_0_1.toFixed(3)}</dd></div>
        <div><dt>dark discontinuity</dt><dd>{percent(zone.dark_discontinuity_fraction_0_1, 1)}</dd></div>
      </dl>
    </article>)}
  </div>
}

function EyeNarrative({ metric }: { metric: IrisMetric }) {
  const profile = metric.regional_profile
  if (!profile) return null
  const evidence = evidenceConfidence(metric)
  const zones = profile.zones
  const mostComplex = [...zones].sort((a, b) => b.texture_complexity_0_1 - a.texture_complexity_0_1)[0]
  const leastComplex = [...zones].sort((a, b) => a.texture_complexity_0_1 - b.texture_complexity_0_1)[0]
  const darkZone = [...zones].sort((a, b) => b.dark_discontinuity_fraction_0_1 - a.dark_discontinuity_fraction_0_1)[0]
  const dominant = profile.summary.dominant_texture_sectors.map(clockName).join(", ") || "no sufficiently exposed sector"
  const luminanceDirection = profile.summary.inner_outer_luminance_delta > .035
    ? "The outer band is lighter than the inner band in this photograph."
    : profile.summary.inner_outer_luminance_delta < -.035
      ? "The outer band is darker than the inner band in this photograph."
      : "Inner-to-outer mean luminance is comparatively even in this photograph."

  return <article className="narrative-eye">
    <header><span>{metric.laterality === "left" ? "OS / LEFT" : "OD / RIGHT"}</span><strong>{evidence.label} · internal score {Math.round(evidence.score * 100)}/100</strong></header>
    <p><b>Regional distribution.</b> The {mostComplex.label} band carries the strongest combined texture signal; the {leastComplex.label} band is comparatively quieter. This is a within-image comparison, not a population percentile.</p>
    <p><b>Directional organisation.</b> Radial orientation is strongest in the {zoneName(profile.summary.strongest_radial_zone)} band, while concentric orientation is strongest in the {zoneName(profile.summary.strongest_concentric_zone)} band. The most texture-rich clock sectors are {dominant}.</p>
    <p><b>Angular irregularity.</b> Sector-to-sector heterogeneity is {percent(profile.summary.angular_heterogeneity_0_1)} on this exploratory scale. It measures uneven distribution around the annulus; it does not by itself identify a crypt, furrow, vessel or lesion.</p>
    <p><b>Luminance and dark interruptions.</b> {luminanceDirection} The largest fraction of locally dark pixels occurs in the {darkZone.label} band ({percent(darkZone.dark_discontinuity_fraction_0_1, 1)}). Pigment, stromal openings, shadows and residual occlusion can all contribute, so the detector deliberately keeps the label non-specific.</p>
  </article>
}

function BilateralComparison({ metrics }: { metrics: IrisMetric[] }) {
  const left = metrics.find(metric => metric.laterality === "left")
  const right = metrics.find(metric => metric.laterality === "right")
  if (!left?.regional_profile || !right?.regional_profile) return null
  const descriptors = [
    ["Texture entropy", numberValue(left.texture_entropy_0_1), numberValue(right.texture_entropy_0_1)],
    ["Contrast", numberValue(left.luminance_contrast_0_1), numberValue(right.luminance_contrast_0_1)],
    ["Radial structure", numberValue(left.radial_structure_0_1), numberValue(right.radial_structure_0_1)],
    ["Concentric structure", numberValue(left.concentric_structure_0_1), numberValue(right.concentric_structure_0_1)],
    ["Dark discontinuity", numberValue(left.dark_discontinuity_fraction_0_1), numberValue(right.dark_discontinuity_fraction_0_1)],
    ["Angular heterogeneity", left.regional_profile.summary.angular_heterogeneity_0_1, right.regional_profile.summary.angular_heterogeneity_0_1],
  ] as Array<[string, number, number]>
  const mirrorClock = (clock: number) => clock === 12 || clock === 6 ? clock : 12 - clock
  const divergences = left.regional_profile.cells.map(leftCell => {
    const rightCell = right.regional_profile!.cells.find(cell => cell.zone === leftCell.zone && cell.clock === mirrorClock(leftCell.clock ?? 12))
    return { zone: leftCell.zone || "", clock: leftCell.clock || 12, delta: Math.abs(leftCell.texture_complexity_0_1 - (rightCell?.texture_complexity_0_1 ?? 0)) }
  }).sort((a, b) => b.delta - a.delta)
  const usableDivergences = divergences.filter(item => item.delta > 0).slice(0, 5)
  const mirroredSimilarity = 1 - divergences.reduce((sum, item) => sum + item.delta, 0) / Math.max(1, divergences.length)
  const qualityGap = Math.abs(evidenceConfidence(left).score - evidenceConfidence(right).score)

  return <div className="result-section bilateral-result">
    <div className="result-section-head"><div><span>05</span><h3>Bilateral descriptor comparison</h3></div><p>Right-eye sectors are mirrored before regional correspondence is calculated.</p></div>
    <div className="bilateral-summary">
      <div><small>mirrored regional agreement</small><strong>{percent(mirroredSimilarity)}</strong><p>Internal descriptor agreement only—not an identity or health score.</p></div>
      <div><small>acquisition evidence gap</small><strong>{percent(qualityGap)}</strong><p>{qualityGap > .18 ? "Image quality differs enough to weaken direct comparison." : "Image evidence is sufficiently balanced for an exploratory comparison."}</p></div>
    </div>
    <div className="table-scroll"><table className="evidence-table"><thead><tr><th>Descriptor</th><th>Left</th><th>Right</th><th>Absolute Δ</th></tr></thead><tbody>{descriptors.map(([label, a, b]) => <tr key={label}><td>{label}</td><td>{a.toFixed(3)}</td><td>{b.toFixed(3)}</td><td>{Math.abs(a - b).toFixed(3)}</td></tr>)}</tbody></table></div>
    <div className="divergence-list"><strong>Largest mirrored regional differences</strong><div>{usableDivergences.map(item => <span key={`${item.zone}-${item.clock}`}>{zoneName(item.zone)} · {clockName(item.clock)} <b>Δ {item.delta.toFixed(3)}</b></span>)}</div></div>
  </div>
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
  const [result, setResult] = useState<{ reference: string; metrics: IrisMetric[] } | null>(null)
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
      setResult({ reference: completed.reference, metrics: (completed.acquisitionMetrics || []) as IrisMetric[] }); setPhase("done")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Submission failed."); setPhase("idle") }
  }

  if (result) return <div className="form-wrap"><section className="form-section result-card">
    <p className="eyebrow">MEASUREMENT COMPLETE · STORED PRIVATELY</p><h2>Your measurements are ready.</h2>
    <p>No email is required to view this screen. Save the reference below for withdrawal or an optional researcher review.</p>
    <code>{result.reference}</code>

    <div className="result-section">
      <div className="result-section-head"><div><span>01</span><h3>Acquisition quality</h3></div><p>Properties of the photograph—not properties of your body.</p></div>
      <div className="table-scroll"><table className="evidence-table"><thead><tr><th>Eye</th><th>Brightness</th><th>Glare</th><th>Sharpness</th><th>Evidence</th></tr></thead><tbody>{result.metrics.map((metric, index) => <tr key={index}><td>{String(metric.laterality)}</td><td>{String(metric.brightness_mean_0_255 ?? "—")}</td><td>{metric.glare_fraction !== undefined ? `${(Number(metric.glare_fraction) * 100).toFixed(1)}%` : "—"}</td><td>{String(metric.laplacian_abs_mean ?? "—")}</td><td><span className="tag measured">pixel measured</span></td></tr>)}</tbody></table></div>
    </div>

    <div className="result-section structural-result">
      <div className="result-section-head"><div><span>02</span><h3>Immediate structural measurements</h3></div><p>Computed only inside the calibrated, unmasked iris annulus.</p></div>
      <div className="table-scroll"><table className="evidence-table"><thead><tr><th>Eye</th><th>Usable annulus</th><th>Texture entropy</th><th>Contrast</th><th>Radial structure</th><th>Concentric structure</th></tr></thead><tbody>{result.metrics.map((metric, index) => <tr key={index}>
        <td>{String(metric.laterality)}</td>
        <td>{metric.usable_annulus_fraction !== undefined ? `${(Number(metric.usable_annulus_fraction) * 100).toFixed(1)}%` : "—"}</td>
        <td>{metric.texture_entropy_0_1 !== undefined ? Number(metric.texture_entropy_0_1).toFixed(3) : "—"}</td>
        <td>{metric.luminance_contrast_0_1 !== undefined ? Number(metric.luminance_contrast_0_1).toFixed(3) : "—"}</td>
        <td>{metric.radial_structure_0_1 !== undefined ? Number(metric.radial_structure_0_1).toFixed(3) : "—"}</td>
        <td>{metric.concentric_structure_0_1 !== undefined ? Number(metric.concentric_structure_0_1).toFixed(3) : "—"}</td>
      </tr>)}</tbody></table></div>
      <div className="metric-legend">
        <p><strong>Texture entropy</strong><span>Variation of light and dark texture in the annulus.</span></p>
        <p><strong>Radial structure</strong><span>Orientation excess consistent with centre-to-edge streaks.</span></p>
        <p><strong>Concentric structure</strong><span>Orientation excess consistent with ring-like changes.</span></p>
      </div>
    </div>

    {result.metrics.some(metric => metric.regional_profile) && <div className="result-section regional-result">
      <div className="result-section-head"><div><span>03</span><h3>Polar regional morphology</h3></div><p>Three radial bands × twelve clock sectors. Values are computed separately for each eye.</p></div>
      <div className="regional-eyes">
        {result.metrics.map(metric => <section key={metric.laterality} className="regional-eye">
          <RegionalMap metric={metric} />
          <ZoneProfile metric={metric} />
        </section>)}
      </div>
      <div className="metric-legend regional-legend">
        <p><strong>Texture complexity</strong><span>Composite display index from entropy, local contrast, fine-detail energy and directional organisation.</span></p>
        <p><strong>Dark discontinuity</strong><span>Pixels below an image-adaptive luminance threshold. It is deliberately not labelled as pigment, crypt or pathology.</span></p>
        <p><strong>Clock coordinates</strong><span>Image-relative sectors: 12 is superior, 3 is image-right, 6 is inferior and 9 is image-left.</span></p>
      </div>
    </div>}

    {result.metrics.some(metric => metric.regional_profile?.atlas_cells?.length) && <div className="result-section atlas-result">
      <div className="result-section-head"><div><span>04</span><h3>Morphology atlas · Andrews reference layer</h3></div><p>Six normalised radial bands × sixty angular minutes, with an image-derived collarette estimate.</p></div>
      <div className="atlas-eyes">{result.metrics.map(metric => <AndrewsAtlas key={metric.laterality} metric={metric} preview={previews[metric.laterality]} calibration={calibration[metric.laterality]} quality={quality[metric.laterality]} />)}</div>
      <div className="method-boundary atlas-boundary">
        <strong>TWO LAYERS, TWO CLAIM TYPES</strong>
        <p><b>Measured morphology</b> is computed from pixels inside the calibrated iris. <b>Historical atlas overlap</b> is only a coordinate correspondence with the supplied Andrews chart. An overlap does not validate organ mapping, identify disease or establish biological causation.</p>
      </div>
    </div>}

    <BilateralComparison metrics={result.metrics} />

    {result.metrics.some(metric => metric.regional_profile) && <div className="result-section narrative-result">
      <div className="result-section-head"><div><span>06</span><h3>Extended morphology reading</h3></div><p>A deterministic account of measured spatial structure and its uncertainty—not a diagnosis.</p></div>
      <div className="narrative-grid">{result.metrics.map(metric => <EyeNarrative key={metric.laterality} metric={metric} />)}</div>
      <div className="method-boundary">
        <strong>WHAT THIS PIPELINE CAN AND CANNOT SAY</strong>
        <p>It can locate where texture, contrast and directional organisation concentrate in this photograph and map those coordinates onto a historical reference layer. It cannot yet distinguish stromal crypts from pigment/shadow, confirm contraction furrows, reconstruct transient fetal vessels, or infer organs, disease, personality or developmental cause. Those claims require labelled datasets, repeat-image reliability and external validation.</p>
      </div>
    </div>}

    <div className="status success">Immediate image measurement completed. Your original images and calibration remain stored under the consent choices you selected.</div>
    <div className="status">Regional descriptors are complete. Crypt, furrow and vascular-network classification remains a separate validation stage; this report does not invent those anatomical labels from a non-specific image signal.</div>
    <section className="interpretation-cta" aria-labelledby="interpretation-title">
      <div><span>OPTIONAL RESEARCHER REVIEW</span><h3 id="interpretation-title">What could these measurements mean?</h3><p>Send this result and a specific question for a human interpretation of the visible morphology, uncertainty and model limits. No diagnosis or organ mapping.</p></div>
      <a className="btn primary" href={`/review?reference=${encodeURIComponent(result.reference)}`}>Request interpretation · $170</a>
    </section>
    <p className="fine-print">These are experimental image descriptors, not diagnosis, biological age, organ mapping, personality analysis, or proof of a developmental mechanism.</p>
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
