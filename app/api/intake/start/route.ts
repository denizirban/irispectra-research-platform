import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { db, insert, remove } from "@/lib/supabase-admin"
import { rateLimit, safeText, sameOrigin, validEmail } from "@/lib/security"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 })
  if (!rateLimit(req)) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 })
  try {
    const body = await req.json()
    const firstName = safeText(body.firstName, 80)
    const lastName = safeText(body.lastName, 80)
    const email = validEmail(body.email)
    const age = Number(body.age)
    const countryRegion = safeText(body.countryRegion, 120) || null
    const consents = body.consents || {}
    if (!firstName || !lastName || !email || !Number.isInteger(age) || age < 18 || age > 120) {
      return NextResponse.json({ error: "Enter a valid name, email and age of 18 or older." }, { status: 400 })
    }
    if (consents.serviceProcessing !== true) {
      return NextResponse.json({ error: "Service processing consent is required to analyse and store the submission." }, { status: 400 })
    }
    const idempotencyKey = safeText(body.idempotencyKey, 120) || randomUUID()
    const previous = await db<Array<{ id: string; status: string }>>(
      `submissions?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status&limit=1`,
    )
    if (previous[0]) return NextResponse.json({ submissionId: previous[0].id, resumed: true })
    const [submission] = await insert<Array<{ id: string }>>("submissions", {
      first_name: firstName,
      last_name: lastName,
      participant_email: email,
      age_years: age,
      country_region: countryRegion,
      status: "uploading",
      idempotency_key: idempotencyKey,
      retention_policy: "until_withdrawal_or_program_close",
      terms_version: "2026-09-04",
      privacy_version: "2026-09-04",
      consent_form_version: "1.0.0",
    })
    try {
      await insert("consent_events", [
        { submission_id: submission.id, consent_type: "service_processing", granted: true, policy_version: "1.0.0" },
        { submission_id: submission.id, consent_type: "derived_research", granted: consents.derivedResearch === true, policy_version: "1.0.0" },
        { submission_id: submission.id, consent_type: "original_image_research", granted: consents.originalImageResearch === true, policy_version: "1.0.0" },
        { submission_id: submission.id, consent_type: "model_development", granted: consents.modelDevelopment === true, policy_version: "1.0.0" },
      ])
      await insert("audit_events", { submission_id: submission.id, actor_type: "participant", event_type: "intake_started", metadata: { consent_form_version: "1.0.0" } })
    } catch (error) {
      await remove(`submissions?id=eq.${encodeURIComponent(submission.id)}`).catch(() => undefined)
      throw error
    }
    return NextResponse.json({ submissionId: submission.id })
  } catch (error) {
    console.error("[irispectra] intake start failed", error)
    return NextResponse.json({ error: "We could not open a secure submission. No success was recorded. Please try again." }, { status: 503 })
  }
}
