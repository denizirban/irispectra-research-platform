import { createHash, randomBytes } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { sendWithdrawalLink } from "@/lib/email"
import { db, deletePrivateObject, insert, remove, update } from "@/lib/supabase-admin"
import { rateLimit, sameOrigin, validEmail } from "@/lib/security"

export const runtime = "nodejs"

const hash = (token: string) => createHash("sha256").update(token).digest("hex")

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Request origin rejected." }, { status: 403 })
  if (!rateLimit(req, 5, 10 * 60_000)) return NextResponse.json({ error: "Too many withdrawal attempts." }, { status: 429 })
  try {
    const body = await req.json()
    if (body.token && body.confirm === true) {
      const tokenHash = hash(String(body.token))
      const requests = await db<Array<{ id: string; submission_id: string }>>(`deletion_requests?request_token_hash=eq.${tokenHash}&status=eq.requested&select=id,submission_id`)
      const request = requests[0]
      if (!request) return NextResponse.json({ error: "This confirmation link is invalid or has expired." }, { status: 400 })
      await update(`deletion_requests?id=eq.${request.id}`, { status: "processing", verified_at: new Date().toISOString() })
      const images = await db<Array<{ storage_path: string }>>(`image_objects?submission_id=eq.${request.submission_id}&select=storage_path`)
      for (const image of images) await deletePrivateObject(image.storage_path)
      await insert("audit_events", { submission_id: request.submission_id, actor_type: "participant", event_type: "deletion_completed", metadata: {} })
      await remove(`submissions?id=eq.${request.submission_id}`)
      return NextResponse.json({ success: true })
    }

    const email = validEmail(body.email)
    const submissionId = String(body.submissionId || "")
    if (!email || !/^[0-9a-f-]{36}$/i.test(submissionId)) return NextResponse.json({ error: "Enter the submission reference and matching email." }, { status: 400 })
    const matches = await db<Array<{ id: string }>>(`submissions?id=eq.${submissionId}&participant_email=eq.${encodeURIComponent(email)}&select=id`)
    if (!matches[0]) return NextResponse.json({ error: "No matching active submission was found." }, { status: 404 })
    const rawToken = randomBytes(32).toString("hex")
    await insert("deletion_requests", { submission_id: submissionId, request_token_hash: hash(rawToken), status: "requested" })
    await update(`submissions?id=eq.${submissionId}`, { status: "deletion_requested" })
    const origin = process.env.PUBLIC_SITE_URL || "https://irispectra.com"
    await sendWithdrawalLink(email, `${origin}/withdraw?token=${rawToken}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[irispectra] withdrawal failed", error)
    return NextResponse.json({ error: "The withdrawal request could not be completed. Contact hello@irispectra.com." }, { status: 503 })
  }
}
