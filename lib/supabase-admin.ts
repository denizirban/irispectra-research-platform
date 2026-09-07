import "server-only"

type Json = Record<string, unknown> | Array<unknown>

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Research storage is not configured")
  return { url: url.replace(/\/$/, ""), key }
}

export async function db<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = config()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    console.error("[irispectra] database operation failed", response.status, detail.slice(0, 500))
    throw new Error("Research database operation failed")
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function insert<T>(table: string, rows: Json): Promise<T> {
  return db<T>(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  })
}

export async function update<T>(tableAndQuery: string, values: Json): Promise<T> {
  return db<T>(tableAndQuery, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(values),
  })
}

export async function remove(tableAndQuery: string): Promise<void> {
  await db<void>(tableAndQuery, { method: "DELETE" })
}

export async function uploadPrivateObject(path: string, bytes: Buffer, contentType: string) {
  const { url, key } = config()
  const response = await fetch(`${url}/storage/v1/object/iris-submissions/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "x-upsert": "false" },
    body: new Uint8Array(bytes),
  })
  if (!response.ok) {
    console.error("[irispectra] storage upload failed", response.status, (await response.text()).slice(0, 500))
    throw new Error("Private image upload failed")
  }
}

export async function deletePrivateObject(path: string) {
  const { url, key } = config()
  const response = await fetch(`${url}/storage/v1/object/iris-submissions/${path}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!response.ok && response.status !== 404) {
    console.error("[irispectra] storage deletion failed", response.status)
    throw new Error("Private image deletion failed")
  }
}
