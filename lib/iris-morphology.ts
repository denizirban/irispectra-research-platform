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
  minuteIndex: number
  zoneIndex: number
  atlasZoneIndex: number
  rx: number
  ry: number
}

const zoneLabels = ["inner / pupillary", "middle / stromal", "outer / peripheral"]
const atlasZoneLabels = [
  "inner pupillary margin",
  "pupillary field",
  "collarette field",
  "inner ciliary field",
  "outer ciliary field",
  "peripheral rim",
]
const atlasBoundaries = [0, .16, .32, .48, .68, .86, 1]
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
  const minuteSectors = Array.from({ length: 60 }, accumulator)
  const atlasZones = Array.from({ length: 6 }, accumulator)
  const atlasCells = Array.from({ length: 360 }, accumulator)

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
    const minuteIndex = Math.floor(((clockTurn * 60 + 0.5) % 60 + 60) % 60)
    const zoneIndex = Math.min(2, Math.floor(normalizedRadius * 3))
    const atlasZoneIndex = Math.min(5, atlasBoundaries.findIndex((boundary, index) => index > 0 && normalizedRadius < boundary) - 1)
    return {
      irisDistance,
      normalizedRadius,
      sectorIndex,
      minuteIndex,
      zoneIndex,
      atlasZoneIndex: Math.max(0, atlasZoneIndex),
      rx: irisDx / Math.max(1, irisDistance),
      ry: irisDy / Math.max(1, irisDistance),
    }
  }

  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const region = regionFor(x, y)
    if (!region) continue
    const targets = [
      overall,
      zones[region.zoneIndex],
      sectors[region.sectorIndex],
      cells[region.zoneIndex * 12 + region.sectorIndex],
      minuteSectors[region.minuteIndex],
      atlasZones[region.atlasZoneIndex],
      atlasCells[region.atlasZoneIndex * 60 + region.minuteIndex],
    ]
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
    minuteSectors[region.minuteIndex].darkCount++
    atlasZones[region.atlasZoneIndex].darkCount++
    atlasCells[region.atlasZoneIndex * 60 + region.minuteIndex].darkCount++
  }

  // The collarette is estimated independently for every six-degree ray by
  // searching for a locally strong radial luminance transition. The search is
  // deliberately constrained to the central iris and reported as an estimate,
  // not an anatomical ground truth.
  const rawCollarette = Array.from({ length: 60 }, (_, minute) => {
    const angle = 2 * Math.PI * minute / 60
    const ux = Math.sin(angle)
    const uy = -Math.cos(angle)
    const projection = centreOffsetX * ux + centreOffsetY * uy
    const discriminant = projection ** 2 + irisRadius ** 2 - centreOffsetSquared
    const outerDistance = projection + Math.sqrt(Math.max(0, discriminant))
    const radialSpan = outerDistance - pupilRadius
    let bestRadius = .42
    let bestScore = 0
    const sample = (radius: number) => {
      const distance = pupilRadius + radius * radialSpan
      const x = Math.round(pupilX + ux * distance)
      const y = Math.round(pupilY + uy * distance)
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1 || y < upperLimit || y > lowerLimit) return null
      const value = data[y * width + x]
      return value > 245 ? null : value
    }
    for (let radius = .2; radius <= .62; radius += .01) {
      const before = sample(radius - .014)
      const after = sample(radius + .014)
      if (before === null || after === null) continue
      const centralPrior = Math.exp(-((radius - .42) ** 2) / (.19 ** 2))
      const score = Math.abs(after - before) * (.58 + .42 * centralPrior)
      if (score > bestScore) {
        bestScore = score
        bestRadius = radius
      }
    }
    return { minute, radial_fraction: bestRadius, confidence: clamp01(bestScore / 52) }
  })
  const collarette = rawCollarette.map((sample, minute) => {
    const neighbours = [-2, -1, 0, 1, 2].map(offset => rawCollarette[(minute + offset + 60) % 60])
    const weights = [1, 2, 3, 2, 1]
    const radial = neighbours.reduce((sum, neighbour, index) => sum + neighbour.radial_fraction * weights[index], 0) / 9
    const confidence = neighbours.reduce((sum, neighbour, index) => sum + neighbour.confidence * weights[index], 0) / 9
    return { minute: sample.minute, radial_fraction: rounded(radial), confidence_0_1: rounded(confidence) }
  })

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
  const minuteMetrics = minuteSectors.map((sector, minute) => ({
    minute,
    degree_from_12_clockwise: minute * 6,
    ...finalize(sector),
  }))
  const atlasZoneMetrics = atlasZones.map((zone, index) => ({
    id: `atlas-${index + 1}`,
    label: atlasZoneLabels[index],
    radial_range: `${Math.round(atlasBoundaries[index] * 100)}–${Math.round(atlasBoundaries[index + 1] * 100)}%`,
    ...finalize(zone),
  }))
  const atlasCellMetrics = atlasCells.map((cell, index) => ({
    atlas_zone: Math.floor(index / 60) + 1,
    minute: index % 60,
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
    method: "polar-regional-orientation-0.4",
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
      minute_sectors: minuteMetrics,
      atlas_zones: atlasZoneMetrics,
      atlas_cells: atlasCellMetrics,
      collarette: {
        status: "image-derived estimate",
        samples: collarette,
        mean_radial_fraction: rounded(collarette.reduce((sum, sample) => sum + sample.radial_fraction, 0) / collarette.length),
        irregularity_0_1: rounded(clamp01(standardDeviation(collarette.map(sample => sample.radial_fraction)) * 4)),
        confidence_0_1: rounded(collarette.reduce((sum, sample) => sum + sample.confidence_0_1, 0) / collarette.length),
      },
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
