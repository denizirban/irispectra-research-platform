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

export type PatternCandidate = {
  id: string
  class_name: string
  confidence_0_1: number
  centre_x_0_1: number
  centre_y_0_1: number
  width_0_1: number
  height_0_1: number
  radial_fraction: number
  minute: number
  area_fraction_of_iris: number
  darkness_0_1: number
  elongation: number
  circularity_0_1: number
  radial_alignment_0_1: number
  collarette_distance_0_1: number
  configuration_size: number
}

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

  // Experimental object-level baseline. A local-contrast mask is built only
  // inside the manually calibrated, unoccluded annulus; connected components
  // then provide explicit candidate instances rather than assigning a label to
  // a whole clock region. These remain photometric candidates, not anatomy.
  const integralWidth = width + 1
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += data[y * width + x]
      integral[(y + 1) * integralWidth + x + 1] = integral[y * integralWidth + x + 1] + row
    }
  }
  const localMean = (x: number, y: number, radius = 6) => {
    const x0 = Math.max(0, x - radius), x1 = Math.min(width - 1, x + radius)
    const y0 = Math.max(0, y - radius), y1 = Math.min(height - 1, y + radius)
    const sum = integral[(y1 + 1) * integralWidth + x1 + 1] - integral[y0 * integralWidth + x1 + 1] - integral[(y1 + 1) * integralWidth + x0] + integral[y0 * integralWidth + x0]
    return sum / ((x1 - x0 + 1) * (y1 - y0 + 1))
  }
  const objectMask = new Uint8Array(width * height)
  const globalDeviation = Math.sqrt(overallVariance)
  const localDrop = Math.max(9, Math.min(28, globalDeviation * .48))
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const region = regionFor(x, y)
    if (!region || y < upperLimit || y > lowerLimit || region.normalizedRadius < .05 || region.normalizedRadius > .97) continue
    const value = data[y * width + x]
    if (value > 238) continue
    const mean = localMean(x, y)
    if (mean - value >= localDrop && value < overallMean - globalDeviation * .18) objectMask[y * width + x] = 1
  }

  type RawCandidate = PatternCandidate & { score: number }
  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  const rawCandidates: RawCandidate[] = []
  const minArea = Math.max(7, Math.round(irisRadius * irisRadius * .00022))
  const maxArea = Math.max(120, Math.round(irisRadius * irisRadius * .055))
  for (let start = 0; start < objectMask.length; start++) {
    if (!objectMask[start] || visited[start]) continue
    let head = 0, tail = 0
    queue[tail++] = start
    visited[start] = 1
    let area = 0, perimeter = 0, sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0, sumValue = 0
    let minX = width, maxX = 0, minY = height, maxY = 0
    while (head < tail) {
      const index = queue[head++]
      const x = index % width, y = Math.floor(index / width)
      area++; sumX += x; sumY += y; sumXX += x * x; sumYY += y * y; sumXY += x * y; sumValue += data[index]
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      const neighbours = [index - 1, index + 1, index - width, index + width]
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= objectMask.length || !objectMask[neighbour]) { perimeter++; continue }
        if (!visited[neighbour]) { visited[neighbour] = 1; queue[tail++] = neighbour }
      }
    }
    if (area < minArea || area > maxArea) continue
    const centreX = sumX / area, centreY = sumY / area
    const region = regionFor(Math.round(centreX), Math.round(centreY))
    if (!region) continue
    const covarianceX = Math.max(0, sumXX / area - centreX ** 2)
    const covarianceY = Math.max(0, sumYY / area - centreY ** 2)
    const covarianceXY = sumXY / area - centreX * centreY
    const trace = covarianceX + covarianceY
    const discriminant = Math.sqrt(Math.max(0, (covarianceX - covarianceY) ** 2 + 4 * covarianceXY ** 2))
    const lambdaMajor = Math.max(.01, (trace + discriminant) / 2)
    const lambdaMinor = Math.max(.01, (trace - discriminant) / 2)
    const elongation = Math.sqrt(lambdaMajor / lambdaMinor)
    const principalAngle = .5 * Math.atan2(2 * covarianceXY, covarianceX - covarianceY)
    const principalX = Math.cos(principalAngle), principalY = Math.sin(principalAngle)
    const radialAlignment = Math.abs(principalX * region.rx + principalY * region.ry)
    const circularity = clamp01(4 * Math.PI * area / Math.max(1, perimeter ** 2))
    const collaretteRadius = collarette[region.minuteIndex]?.radial_fraction ?? .42
    const collaretteDistance = Math.abs(region.normalizedRadius - collaretteRadius)
    const darkness = clamp01((localMean(Math.round(centreX), Math.round(centreY), 10) - sumValue / area) / 80)
    const areaFraction = area / Math.max(1, Math.PI * irisRadius ** 2)
    let className = "irregular dark-discontinuity candidate"
    if (elongation >= 4 && radialAlignment >= .68) className = "radial furrow-like candidate"
    else if (collaretteDistance <= .075 && elongation >= 1.7) className = "collarette-attached opening candidate"
    else if (circularity >= .48 && elongation < 1.9) className = "rounded crypt-like opening candidate"
    else if (elongation >= 2.15) className = "elongated lacuna-like opening candidate"
    else if (areaFraction < .0035) className = "small crypt-like opening candidate"
    const shapeEvidence = clamp01(.42 * darkness + .24 * Math.min(1, area / (minArea * 4)) + .18 * (className.includes("radial") ? radialAlignment : circularity) + .16 * (1 - Math.min(1, collaretteDistance)))
    rawCandidates.push({
      id: `candidate-${rawCandidates.length + 1}`,
      class_name: className,
      confidence_0_1: rounded(Math.min(.82, .32 + shapeEvidence * .52)),
      centre_x_0_1: rounded(centreX / width), centre_y_0_1: rounded(centreY / height),
      width_0_1: rounded((maxX - minX + 1) / width), height_0_1: rounded((maxY - minY + 1) / height),
      radial_fraction: rounded(region.normalizedRadius), minute: region.minuteIndex,
      area_fraction_of_iris: rounded(areaFraction), darkness_0_1: rounded(darkness),
      elongation: rounded(elongation), circularity_0_1: rounded(circularity), radial_alignment_0_1: rounded(radialAlignment),
      collarette_distance_0_1: rounded(collaretteDistance), configuration_size: 1,
      score: shapeEvidence * Math.sqrt(area),
    })
  }
  const patternCandidates = rawCandidates.sort((a, b) => b.score - a.score).slice(0, 36)
  for (const candidate of patternCandidates) {
    const neighbours = patternCandidates.filter(other => {
      if (other === candidate) return false
      const radialGap = Math.abs(other.radial_fraction - candidate.radial_fraction)
      const minuteGap = Math.min(Math.abs(other.minute - candidate.minute), 60 - Math.abs(other.minute - candidate.minute))
      return radialGap <= .13 && minuteGap <= 4
    })
    candidate.configuration_size = Math.min(3, 1 + neighbours.length)
    if (candidate.configuration_size === 3 && candidate.class_name.includes("opening")) candidate.class_name = "clustered triple opening candidate"
    else if (candidate.configuration_size === 2 && candidate.class_name.includes("opening")) candidate.class_name = "paired opening candidate"
  }
  const publicCandidates = patternCandidates.map(({ score: _score, ...candidate }) => candidate)

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
    method: "polar-regional-orientation-plus-instance-mask-0.5",
    analysis_width_px: width,
    analysis_height_px: height,
    usable_annulus_fraction: overallMetrics.usable_fraction,
    texture_entropy_0_1: overallMetrics.entropy_0_1,
    luminance_contrast_0_1: overallMetrics.contrast_0_1,
    fine_detail_energy_0_1: overallMetrics.fine_detail_energy_0_1,
    radial_structure_0_1: overallMetrics.radial_structure_0_1,
    concentric_structure_0_1: overallMetrics.concentric_structure_0_1,
    dark_discontinuity_fraction_0_1: overallMetrics.dark_discontinuity_fraction_0_1,
    pattern_candidates: publicCandidates,
    pattern_candidate_summary: {
      count: publicCandidates.length,
      mask_method: "local-contrast connected components",
      confidence_ceiling: .82,
      limitation: "2D photometric candidates; crypt, lacuna, pigment and shadow are not ground-truth separated",
    },
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
