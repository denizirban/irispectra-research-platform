import { NextRequest, NextResponse } from "next/server"
import { db, insert, update } from "@/lib/supabase-admin"
import { sendSubmissionNotice } from "@/lib/email"
import { rateLimit, sameOrigin } from "@/lib/security"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 })
  if (!rateLimit(req)) return NextResponse.json({ error: "Too many attempts." }, { status: 429 })
  try {
    const { submissionId } = await req.json()
    if (!/^[0-9a-f-]{36}$/i.test(submissionId || "")) return NextResponse.json({ error: "Invalid submission." }, { status: 400 })
    const images = await db<Array<{ id: string; laterality: string; quality_metrics: Record<string, number | string> }>>(`image_objects?submission_id=eq.${submissionId}&modality=eq.iris_still&select=id,laterality,quality_metrics`)
    if (!images.some(i => i.laterality === "left") || !images.some(i => i.laterality === "right")) {
      return NextResponse.json({ error: "Both left and right iris images must be securely stored before submission." }, { status: 409 })
    }
    const submissions = await db<Array<{ id: string; first_name: string; participant_email: string; status: string }>>(`submissions?id=eq.${submissionId}&select=id,first_name,participant_email,status`)
    const submission = submissions[0]
    if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 })
    if (submission.status !== "queued") {
      await insert("analysis_runs", { submission_id: submissionId, status: "queued", model_family: "structural-quantification", model_version: "pilot-0.1", pipeline_version: "2026-09-04", diagnostics: {} })
      await update(`submissions?id=eq.${submissionId}`, { status: "queued" })
      await insert("audit_events", { submission_id: submissionId, actor_type: "participant", event_type: "submission_completed", metadata: { image_count: images.length } })
    }
    let notification: "sent" | "pending" = "pending"
    try {
      notification = await sendSubmissionNotice({ id: submissionId, firstName: submission.first_name, email: submission.participant_email, imageCount: images.length })
    } catch (emailError) {
      console.error("[irispectra] notification delayed", emailError)
    }
    return NextResponse.json({ success: true, reference: submissionId, notification, acquisitionMetrics: images.map(image => ({ laterality: image.laterality, ...image.quality_metrics })) })
  } catch (error) {
    console.error("[irispectra] completion failed", error)
    return NextResponse.json({ error: "We could not verify the complete secure submission. Please retry using the same page." }, { status: 503 })
  }
}
