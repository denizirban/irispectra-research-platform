import { createHash } from "node:crypto"
import type { NextRequest } from "next/server"

const windows = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(req: NextRequest, limit = 12, windowMs = 60_000) {
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const key = createHash("sha256").update(`${process.env.RATE_LIMIT_SALT || "local"}:${raw}`).digest("hex")
  const now = Date.now()
  const entry = windows.get(key)
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count += 1
  return true
}

export function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, max) : ""
}

export function validEmail(value: unknown) {
  const email = safeText(value, 254).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""
}

export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin")
  if (!origin) return process.env.NODE_ENV !== "production"
  const allowed = new Set([
    req.nextUrl.origin,
    process.env.PUBLIC_SITE_URL,
    "https://irispectra.com",
    "https://www.irispectra.com",
  ].filter(Boolean))
  return allowed.has(origin)
}
