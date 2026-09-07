import { createHash, randomUUID } from "node:crypto"
import sharp from "sharp"
import { NextRequest, NextResponse } from "next/server"
import { db, deletePrivateObject, insert, uploadPrivateObject } from "@/lib/supabase-admin"
import { rateLimit, sameOrigin } from "@/lib/security"

export const runtime = "nodejs"
export const maxDuration = 30

const accepted = new Set(["image/jpeg", "image/png", "image/webp"])

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 })
  if (!rateLimit(req, 8)) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 })
  let storedPath = ""
  try {
    const form = await req.formData()
    const submissionId = String(form.get("submissionId") || "")
    const laterality = String(form.get("laterality") || "")
    const file = form.get("image")
    if (!/^[0-9a-f-]{36}$/i.test(submissionId) || !["left", "right"].includes(laterality) || !(file instanceof File)) {
      return NextResponse.json({ error: "Invalid upload request." }, { status: 400 })
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
    }
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
      quality_metrics: qualityMetrics,
    })
    return NextResponse.json({ imageId: record.id, width: metadata.width, height: metadata.height, quality: qualityMetrics })
  } catch (error) {
    if (storedPath) await deletePrivateObject(storedPath).catch(() => undefined)
    console.error("[irispectra] upload failed", error)
    return NextResponse.json({ error: "The image was not securely stored. Please retry; no success was recorded." }, { status: 503 })
  }
}
