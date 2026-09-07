import { NextRequest, NextResponse } from "next/server"
import { db, insert } from "@/lib/supabase-admin"
import { sendReviewRequest } from "@/lib/email"
import { rateLimit, safeText, sameOrigin, validEmail } from "@/lib/security"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 })
  if (!rateLimit(req, 5, 10 * 60_000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  try {
    const body = await req.json(), email = validEmail(body.email), submissionId = String(body.submissionId || ""), note = safeText(body.note, 800)
    if (!email || !note || !/^[0-9a-f-]{36}$/i.test(submissionId)) return NextResponse.json({ error: "Enter a valid submission reference, matching email and a question." }, { status: 400 })
    const found = await db<Array<{ id: string }>>(`submissions?id=eq.${encodeURIComponent(submissionId)}&participant_email=eq.${encodeURIComponent(email)}&select=id&limit=1`)
    if (!found[0]) return NextResponse.json({ error: "No matching active submission was found." }, { status: 404 })
    const images = await db<Array<{ laterality: string; quality_metrics: Record<string, unknown> }>>(`image_objects?submission_id=eq.${encodeURIComponent(submissionId)}&modality=eq.iris_still&select=laterality,quality_metrics`)
    await insert("audit_events", { submission_id: submissionId, actor_type: "participant", event_type: "researcher_review_requested", metadata: { price_usd: 170, notification: "pending", question: note, measurement_method: "annular-orientation-0.2" } })
    let notification: "sent" | "pending" = "pending"
    try {
      notification = await sendReviewRequest({ submissionId, email, note, measurements: images })
      if (notification === "sent") await insert("audit_events", { submission_id: submissionId, actor_type: "system", event_type: "review_notification_sent", metadata: {} })
    } catch (notificationError) {
      console.error("[irispectra] review notification delayed", notificationError)
    }
    return NextResponse.json({ success: true, notification })
  } catch (error) {
    console.error("[irispectra] review request failed", error)
    return NextResponse.json({ error: "The request was not confirmed. Please retry from the same result page." }, { status: 503 })
  }
}
