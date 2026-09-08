export type ManualSegmentation = {
  irisCenterX: number
  irisCenterY: number
  pupilOffsetX: number
  pupilOffsetY: number
  pupilRadius: number
  irisRadius: number
  upperOcclusion: number
  lowerOcclusion: number
}

type Accumulator = {
  candidate: number
  usable: number
  sum: number
  sumSquares: number
  histogram: Uint32Array
  gradientWeight: number
  tangentialWeight: number
  radialWeight: number
  darkCount: number
}

type PixelRegion = {
  irisDistance: number
  normalizedRadius: number
  sectorIndex: number
  zoneIndex: number
  rx: number
  ry: number
}

const zoneLabels = ["inner / pupillary", "middle / stromal", "outer / peripheral"]
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const rounded = (value: number) => Number(value.toFixed(3))

function accumulator(): Accumulator {
  return {
    candidate: 0,
    usable: 0,
    sum: 0,
    sumSquares: 0,
    histogram: new Uint32Array(16),
    gradientWeight: 0,
    tangentialWeight: 0,
    radialWeight: 0,
    darkCount: 0,
  }
}

function addCandidate(target: Accumulator) {
  target.candidate++
}

function addUsable(target: Accumulator, value: number) {
  target.usable++
  target.sum += value
  target.sumSquares += value * value
  target.histogram[Math.min(15, value >> 4)]++
}

function addGradient(target: Accumulator, magnitude: number, radialProjection: number, tangentialProjection: number) {
  target.gradientWeight += magnitude
  target.radialWeight += radialProjection
  target.tangentialWeight += tangentialProjection
}

function finalize(target: Accumulator) {
  let entropy = 0
  if (target.usable) for (const count of target.histogram) if (count) {
    const probability = count / target.usable
    entropy -= probability * Math.log2(probability)
  }
  const mean = target.usable ? target.sum / target.usable : 0
  const variance = target.usable ? Math.max(0, target.sumSquares / target.usable - mean * mean) : 0
  const isotropicProjection = 2 / Math.PI
  const normalizeOrientation = (projection: number) => clamp01((projection - isotropicProjection) / (1 - isotropicProjection))
  const tangentialProjection = target.gradientWeight ? target.tangentialWeight / target.gradientWeight : isotropicProjection
  const radialProjection = target.gradientWeight ? target.radialWeight / target.gradientWeight : isotropicProjection
  const contrast = Math.sqrt(variance) / 255
  const fineDetail = clamp01(target.gradientWeight / Math.max(1, target.usable) / 255)
  const radialStructure = normalizeOrientation(tangentialProjection)
  const concentricStructure = normalizeOrientation(radialProjection)
  const textureComplexity = clamp01(
    0.42 * (entropy / 4) +
    0.28 * clamp01(contrast / 0.22) +
    0.18 * clamp01(fineDetail / 0.24) +
    0.12 * Math.max(radialStructure, concentricStructure),
  )

  return {
    candidate_px: target.candidate,
    usable_px: target.usable,
    usable_fraction: rounded(target.candidate ? target.usable / target.candidate : 0),
    mean_luminance_0_1: rounded(mean / 255),
    contrast_0_1: rounded(contrast),
    entropy_0_1: rounded(entropy / 4),
    fine_detail_energy_0_1: rounded(fineDetail),
    radial_structure_0_1: rounded(radialStructure),
    concentric_structure_0_1: rounded(concentricStructure),
    dark_discontinuity_fraction_0_1: rounded(target.usable ? target.darkCount / target.usable : 0),
    texture_complexity_0_1: rounded(textureComplexity),
  }
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

export function measureAnnulus(data: Buffer, width: number, height: number, segmentation: ManualSegmentation) {
  const irisX = width * segmentation.irisCenterX / 100
  const irisY = height * segmentation.irisCenterY / 100
  const pupilX = irisX + width * segmentation.pupilOffsetX / 100
  const pupilY = irisY + height * segmentation.pupilOffsetY / 100
  const irisRadius = width * segmentation.irisRadius / 100
  const pupilRadius = width * segmentation.pupilRadius / 100
  const upperLimit = height * segmentation.upperOcclusion / 100
  const lowerLimit = height * (1 - segmentation.lowerOcclusion / 100)
  const centreOffsetX = irisX - pupilX
  const centreOffsetY = irisY - pupilY
  const centreOffsetSquared = centreOffsetX ** 2 + centreOffsetY ** 2
  const overall = accumulator()
  const zones = Array.from({ length: 3 }, accumulator)
  const sectors = Array.from({ length: 12 }, accumulator)
  const cells = Array.from({ length: 36 }, accumulator)

  function regionFor(x: number, y: number): PixelRegion | null {
    const irisDx = x - irisX
    const irisDy = y - irisY
    const pupilDx = x - pupilX
    const pupilDy = y - pupilY
    const irisDistance = Math.hypot(irisDx, irisDy)
    const pupilDistance = Math.hypot(pupilDx, pupilDy)
    if (irisDistance >= irisRadius || pupilDistance <= pupilRadius || pupilDistance < 1) return null

    // Rubber-sheet style radial coordinate. The outer boundary distance is
    // solved along each pupil-centred ray, so mild pupil eccentricity is not
    // mistaken for inner/outer regional change.
    const ux = pupilDx / pupilDistance
    const uy = pupilDy / pupilDistance
    const projection = centreOffsetX * ux + centreOffsetY * uy
    const discriminant = projection ** 2 + irisRadius ** 2 - centreOffsetSquared
    if (discriminant <= 0) return null
    const outerDistance = projection + Math.sqrt(discriminant)
    const radialSpan = outerDistance - pupilRadius
    if (radialSpan <= 1) return null
    const normalizedRadius = (pupilDistance - pupilRadius) / radialSpan
    if (normalizedRadius < 0 || normalizedRadius >= 1) return null

    // 0 is 12 o'clock; sector numbers then advance clockwise in the image.
    const clockTurn = Math.atan2(pupilDx, -pupilDy) / (2 * Math.PI)
    const sectorIndex = Math.floor(((clockTurn * 12 + 0.5) % 12 + 12) % 12)
    const zoneIndex = Math.min(2, Math.floor(normalizedRadius * 3))
    return {
      irisDistance,
      normalizedRadius,
      sectorIndex,
      zoneIndex,
      rx: irisDx / Math.max(1, irisDistance),
      ry: irisDy / Math.max(1, irisDistance),
    }
  }

  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const region = regionFor(x, y)
    if (!region) continue
    const targets = [overall, zones[region.zoneIndex], sectors[region.sectorIndex], cells[region.zoneIndex * 12 + region.sectorIndex]]
    targets.forEach(addCandidate)
    const value = data[y * width + x]
    if (y < upperLimit || y > lowerLimit || value > 245) continue
    targets.forEach(target => addUsable(target, value))

    if (region.irisDistance < 2 || region.irisDistance > irisRadius - 2) continue
    const gx = data[y * width + x + 1] - data[y * width + x - 1]
    const gy = data[(y + 1) * width + x] - data[(y - 1) * width + x]
    const magnitude = Math.hypot(gx, gy)
    if (magnitude < 2) continue
    const radialProjection = Math.abs(gx * region.rx + gy * region.ry)
    const tangentialProjection = Math.abs(gx * -region.ry + gy * region.rx)
    targets.forEach(target => addGradient(target, magnitude, radialProjection, tangentialProjection))
  }

  const overallMean = overall.usable ? overall.sum / overall.usable : 0
  const overallVariance = overall.usable ? Math.max(0, overall.sumSquares / overall.usable - overallMean ** 2) : 0
  const darkThreshold = Math.max(18, Math.min(180, overallMean - 0.85 * Math.sqrt(overallVariance)))
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const region = regionFor(x, y)
    if (!region || y < upperLimit || y > lowerLimit) continue
    const value = data[y * width + x]
    if (value > 245 || value >= darkThreshold) continue
    overall.darkCount++
    zones[region.zoneIndex].darkCount++
    sectors[region.sectorIndex].darkCount++
    cells[region.zoneIndex * 12 + region.sectorIndex].darkCount++
  }

  const overallMetrics = finalize(overall)
  const zoneMetrics = zones.map((zone, index) => ({
    id: ["inner", "middle", "outer"][index],
    label: zoneLabels[index],
    radial_range: index === 0 ? "0–33%" : index === 1 ? "33–67%" : "67–100%",
    ...finalize(zone),
  }))
  const sectorMetrics = sectors.map((sector, index) => ({
    clock: index === 0 ? 12 : index,
    label: `${index === 0 ? 12 : index} o'clock`,
    ...finalize(sector),
  }))
  const cellMetrics = cells.map((cell, index) => ({
    zone: ["inner", "middle", "outer"][Math.floor(index / 12)],
    clock: index % 12 === 0 ? 12 : index % 12,
    ...finalize(cell),
  }))
  const complexities = sectorMetrics.filter(sector => sector.usable_px > 0).map(sector => sector.texture_complexity_0_1)
  const dominantSectors = [...sectorMetrics]
    .filter(sector => sector.usable_fraction >= 0.2)
    .sort((a, b) => b.texture_complexity_0_1 - a.texture_complexity_0_1)
    .slice(0, 3)
    .map(sector => sector.clock)
  const strongestRadialZone = [...zoneMetrics].sort((a, b) => b.radial_structure_0_1 - a.radial_structure_0_1)[0]
  const strongestConcentricZone = [...zoneMetrics].sort((a, b) => b.concentric_structure_0_1 - a.concentric_structure_0_1)[0]

  return {
    method: "polar-regional-orientation-0.3",
    analysis_width_px: width,
    analysis_height_px: height,
    usable_annulus_fraction: overallMetrics.usable_fraction,
    texture_entropy_0_1: overallMetrics.entropy_0_1,
    luminance_contrast_0_1: overallMetrics.contrast_0_1,
    fine_detail_energy_0_1: overallMetrics.fine_detail_energy_0_1,
    radial_structure_0_1: overallMetrics.radial_structure_0_1,
    concentric_structure_0_1: overallMetrics.concentric_structure_0_1,
    dark_discontinuity_fraction_0_1: overallMetrics.dark_discontinuity_fraction_0_1,
    regional_profile: {
      coordinate_system: "pupil-centred polar; clock sectors advance clockwise in displayed image",
      dark_threshold_0_255: rounded(darkThreshold),
      zones: zoneMetrics,
      sectors: sectorMetrics,
      cells: cellMetrics,
      summary: {
        angular_heterogeneity_0_1: rounded(clamp01(standardDeviation(complexities) * 3.2)),
        dominant_texture_sectors: dominantSectors,
        inner_outer_luminance_delta: rounded(zoneMetrics[2].mean_luminance_0_1 - zoneMetrics[0].mean_luminance_0_1),
        strongest_radial_zone: strongestRadialZone.id,
        strongest_concentric_zone: strongestConcentricZone.id,
      },
    },
  }
}
