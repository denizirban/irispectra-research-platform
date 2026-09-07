import "server-only"
import nodemailer from "nodemailer"

type SubmissionNotice = { id: string; firstName: string; email: string; imageCount: number }

export async function sendSubmissionNotice(input: SubmissionNotice): Promise<"sent" | "pending"> {
  const password = process.env.SMTP_PASS
  if (!password) {
    console.warn("[irispectra] SMTP not configured; submission stored, notification pending", input.id)
    return "pending"
  }
  const user = process.env.SMTP_USER || "hello@irispectra.com"
  const admin = process.env.ADMIN_EMAIL || "hello@irispectra.com"
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.zoho.eu",
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass: password },
  })
  await Promise.all([
    transporter.sendMail({
      from: user,
      to: input.email,
      replyTo: admin,
      subject: "Irispectra research submission securely stored",
      text: `Hello ${input.firstName},\n\nYour research submission ${input.id} and ${input.imageCount} iris image(s) were securely stored. Structural measurement is experimental and is not medical diagnosis. You may request withdrawal at https://irispectra.com/withdraw.\n\nIrispectra`,
    }),
    transporter.sendMail({
      from: user,
      to: admin,
      replyTo: input.email,
      subject: `New Irispectra research submission · ${input.id}`,
      text: `A new consented research submission was securely stored.\nReference: ${input.id}\nImages: ${input.imageCount}\nParticipant email: ${input.email}\nReview private data only in the authorised Supabase project.`,
    }),
  ])
  return "sent"
}

export async function sendWithdrawalLink(email: string, url: string) {
  const password = process.env.SMTP_PASS
  if (!password) throw new Error("Withdrawal email service is not configured")
  const user = process.env.SMTP_USER || "hello@irispectra.com"
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.zoho.eu",
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass: password },
  })
  await transporter.sendMail({
    from: user,
    to: email,
    subject: "Confirm Irispectra data withdrawal",
    text: `Confirm permanent deletion of your Irispectra submission using this one-time link:\n${url}\n\nIf you did not request this, ignore this message.`,
  })
}

export async function sendReviewRequest(input: { submissionId: string; email: string; note: string }) {
  const password = process.env.SMTP_PASS
  if (!password) return "pending" as const
  const user = process.env.SMTP_USER || "hello@irispectra.com"
  const admin = process.env.ADMIN_EMAIL || "hello@irispectra.com"
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.zoho.eu", port: Number(process.env.SMTP_PORT || 465), secure: true, auth: { user, pass: password },
  })
  await transporter.sendMail({
    from: user, to: admin, replyTo: input.email,
    subject: `Researcher review request · ${input.submissionId}`,
    text: `Optional $170 researcher-review request.\nSubmission: ${input.submissionId}\nParticipant email: ${input.email}\nNote: ${input.note || "—"}\n\nVerify scope and availability before sending any payment link.`,
  })
  return "sent" as const
}
