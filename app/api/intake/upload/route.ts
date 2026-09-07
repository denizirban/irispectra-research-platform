import { createHash, randomUUID } from "node:crypto"
import sharp from "sharp"
import { NextRequest, NextResponse } from "next/server"
import { db, deletePrivateObject, insert, uploadPrivateObject } from "@/lib/supabase-admin"
import { rateLimit, sameOrigin } from "@/lib/security"

export const runtime = "nodejs"
export const maxDuration = 30

const accepted = new Set(["image/jpeg", "image/png", "image/webp"])

type ManualSegmentation = {
  irisCenterX: number
  irisCenterY: number
  pupilOffsetX: number
  pupilOffsetY: number
  pupilRadius: number
  irisRadius: number
  upperOcclusion: number
  lowerOcclusion: number
}

function parseSegmentation(value: FormDataEntryValue | null): ManualSegmentation | null {
  if (typeof value !== "string" || value.length > 1000) return null
  try {
    const candidate = JSON.parse(value) as Record<string, unknown>
    const rules: Array<[keyof ManualSegmentation, number, number]> = [
      ["irisCenterX", 20, 80], ["irisCenterY", 20, 80],
      ["pupilOffsetX", -15, 15], ["pupilOffsetY", -15, 15],
      ["pupilRadius", 3, 20], ["irisRadius", 14, 46],
      ["upperOcclusion", 0, 35], ["lowerOcclusion", 0, 35],
    ]
    const parsed = {} as ManualSegmentation
    for (const [key, min, max] of rules) {
      const number = Number(candidate[key])
      if (!Number.isFinite(number) || number < min || number > max) return null
      parsed[key] = number
    }
    return parsed
  } catch {
    return null
  }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const rounded = (value: number) => Number(value.toFixed(3))

function measureAnnulus(data: Buffer, width: number, height: number, segmentation: ManualSegmentation) {
  const irisX = width * segmentation.irisCenterX / 100
  const irisY = height * segmentation.irisCenterY / 100
  const pupilX = irisX + width * segmentation.pupilOffsetX / 100
  const pupilY = irisY + height * segmentation.pupilOffsetY / 100
  const irisRadius = width * segmentation.irisRadius / 100
  const pupilRadius = width * segmentation.pupilRadius / 100
  const upperLimit = height * segmentation.upperOcclusion / 100
  const lowerLimit = height * (1 - segmentation.lowerOcclusion / 100)
  const histogram = new Uint32Array(16)
  const isotropicProjection = 2 / Math.PI
  let candidate = 0, usable = 0, sum = 0, sumSquares = 0
  let gradientWeight = 0, tangentialWeight = 0, radialWeight = 0

  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const irisDx = x - irisX, irisDy = y - irisY
    const pupilDx = x - pupilX, pupilDy = y - pupilY
    const irisDistance = Math.hypot(irisDx, irisDy)
    const pupilDistance = Math.hypot(pupilDx, pupilDy)
    if (irisDistance >= irisRadius || pupilDistance <= pupilRadius) continue
    candidate++
    const value = data[y * width + x]
    if (y < upperLimit || y > lowerLimit || value > 245) continue
    usable++; sum += value; sumSquares += value * value; histogram[Math.min(15, value >> 4)]++
    if (irisDistance < 2 || irisDistance > irisRadius - 2 || pupilDistance < pupilRadius + 2) continue
    const gx = data[y * width + x + 1] - data[y * width + x - 1]
    const gy = data[(y + 1) * width + x] - data[(y - 1) * width + x]
    const magnitude = Math.hypot(gx, gy)
    if (magnitude < 2) continue
    const rx = irisDx / irisDistance, ry = irisDy / irisDistance
    gradientWeight += magnitude
    radialWeight += Math.abs(gx * rx + gy * ry)
    tangentialWeight += Math.abs(gx * -ry + gy * rx)
  }

  let entropy = 0
  if (usable) for (const count of histogram) if (count) {
    const probability = count / usable
    entropy -= probability * Math.log2(probability)
  }
  const mean = usable ? sum / usable : 0
  const variance = usable ? Math.max(0, sumSquares / usable - mean * mean) : 0
  const normalizeOrientation = (projection: number) => clamp01((projection - isotropicProjection) / (1 - isotropicProjection))
  const tangentialProjection = gradientWeight ? tangentialWeight / gradientWeight : isotropicProjection
  const radialProjection = gradientWeight ? radialWeight / gradientWeight : isotropicProjection

  return {
    method: "annular-orientation-0.2",
    analysis_width_px: width,
    analysis_height_px: height,
    usable_annulus_fraction: rounded(candidate ? usable / candidate : 0),
    texture_entropy_0_1: rounded(entropy / 4),
    luminance_contrast_0_1: rounded(Math.sqrt(variance) / 255),
    fine_detail_energy_0_1: rounded(clamp01(gradientWeight / Math.max(1, usable) / 255)),
    radial_structure_0_1: rounded(normalizeOrientation(tangentialProjection)),
    concentric_structure_0_1: rounded(normalizeOrientation(radialProjection)),
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 })
  if (!rateLimit(req, 8)) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 })
  let storedPath = ""
  try {
    const form = await req.formData()
    const submissionId = String(form.get("submissionId") || "")
    const laterality = String(form.get("laterality") || "")
    const file = form.get("image")
    const manualSegmentation = parseSegmentation(form.get("calibration"))
    if (!/^[0-9a-f-]{36}$/i.test(submissionId) || !["left", "right"].includes(laterality) || !(file instanceof File)) {
      return NextResponse.json({ error: "Invalid upload request." }, { status: 400 })
    }
    if (!manualSegmentation) {
      return NextResponse.json({ error: "Confirm valid pupil, iris and exclusion geometry before upload." }, { status: 400 })
    }
    const submissions = await db<Array<{ id: string; status: string }>>(
      `submissions?id=eq.${encodeURIComponent(submissionId)}&select=id,status&limit=1`,
    )
    if (!submissions[0] || submissions[0].status !== "uploading") {
      return NextResponse.json({ error: "This secure upload session is not active." }, { status: 409 })
    }
    const existing = await db<Array<{ id: string }>>(
      `image_objects?submission_id=eq.${encodeURIComponent(submissionId)}&modality=eq.iris_still&laterality=eq.${laterality}&select=id&limit=1`,
    )
    if (existing[0]) return NextResponse.json({ error: `A ${laterality} image is already securely stored for this submission.` }, { status: 409 })
    if (!accepted.has(file.type) || file.size <= 0 || file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Use a JPEG, PNG or WebP image up to 4 MB." }, { status: 400 })
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const metadata = await sharp(bytes, { failOn: "error" }).metadata()
    const decodedType = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : ""
    if (!decodedType || decodedType !== file.type) return NextResponse.json({ error: "The file content does not match its declared image type." }, { status: 400 })
    if (!metadata.width || !metadata.height || metadata.width < 600 || metadata.height < 600 || metadata.width > 12000 || metadata.height > 12000) {
      return NextResponse.json({ error: "Image dimensions must be between 600 and 12,000 pixels per side." }, { status: 400 })
    }
    const preview = await sharp(bytes).resize(256, 256, { fit: "fill" }).greyscale().raw().toBuffer()
    let brightness = 0, glare = 0, sharpness = 0, laplaceCount = 0
    for (const value of preview) { brightness += value; if (value > 245) glare++ }
    for (let y = 1; y < 255; y++) for (let x = 1; x < 255; x++) {
      const i = y * 256 + x
      sharpness += Math.abs(4 * preview[i] - preview[i - 1] - preview[i + 1] - preview[i - 256] - preview[i + 256])
      laplaceCount++
    }
    const qualityMetrics = {
      algorithm: "pixel-quality-0.1",
      brightness_mean_0_255: Number((brightness / preview.length).toFixed(2)),
      glare_fraction: Number((glare / preview.length).toFixed(4)),
      laplacian_abs_mean: Number((sharpness / laplaceCount).toFixed(2)),
      manual_segmentation: { ...manualSegmentation, coordinate_unit: "percent_of_image" },
    }
    const analysed = await sharp(bytes)
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const structuralMetrics = measureAnnulus(analysed.data, analysed.info.width, analysed.info.height, manualSegmentation)
    const extension = metadata.format === "jpeg" ? "jpg" : metadata.format
    storedPath = `${submissionId}/${randomUUID()}.${extension}`
    await uploadPrivateObject(storedPath, bytes, decodedType)
    const checksum = createHash("sha256").update(bytes).digest("hex")
    const [record] = await insert<Array<{ id: string }>>("image_objects", {
      submission_id: submissionId,
      modality: "iris_still",
      laterality,
      storage_path: storedPath,
      content_type: decodedType,
      byte_size: bytes.length,
      checksum_sha256: checksum,
      width_px: metadata.width,
      height_px: metadata.height,
      quality_metrics: { ...qualityMetrics, ...structuralMetrics },
    })
    return NextResponse.json({ imageId: record.id, width: metadata.width, height: metadata.height, quality: qualityMetrics, structure: structuralMetrics })
  } catch (error) {
    if (storedPath) await deletePrivateObject(storedPath).catch(() => undefined)
    console.error("[irispectra] upload failed", error)
    return NextResponse.json({ error: "The image was not securely stored. Please retry; no success was recorded." }, { status: 503 })
  }
}
