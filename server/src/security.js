import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)
const KEYLEN = 64

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  const key = await scrypt(String(password), salt, KEYLEN, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt}$${key.toString('base64url')}`
}
export async function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored || '').split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const key = await scrypt(String(password), salt, expected.length, { N: 16384, r: 8, p: 1 })
  return key.length === expected.length && timingSafeEqual(key, expected)
}
export const newToken = () => randomBytes(32).toString('base64url')
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex')
export const newId = (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`

// ---- validation ----
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
export const bad = (msg) => new HttpError(400, msg)

/** Trims, strips control characters and angle brackets, and bounds length. */
export function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').replace(/\s+\n/g, '\n').trim().slice(0, max)
}
export function requireText(value, field, min, max) {
  const v = clean(value, max)
  if (v.length < min) throw bad(`${field} must be at least ${min} characters.`)
  return v
}
export function tagList(value, maxItems = 8) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  return [...new Set(raw.map((t) => clean(t, 30).toLowerCase()).filter(Boolean))].slice(0, maxItems)
}
export function oneOf(value, allowed, field, fallback) {
  if (value === undefined || value === null || value === '') { if (fallback !== undefined) return fallback; throw bad(`${field} is required.`) }
  if (!allowed.includes(value)) throw bad(`${field} must be one of: ${allowed.join(', ')}.`)
  return value
}
export const USERNAME_RE = /^[a-z0-9_]{3,24}$/
export function validUsername(u) { return USERNAME_RE.test(String(u || '')) }
export function validPassword(p) { const s = String(p || ''); return s.length >= 10 && s.length <= 200 }

/** Counts URLs; messages with many links are a common spam signal. */
export const linkCount = (text) => (String(text).match(/https?:\/\/|www\./gi) || []).length

// ---- rate limiting (fixed window, in memory) ----
export function rateLimiter({ windowMs, max }) {
  const hits = new Map()
  return (key) => {
    const now = Date.now(); const e = hits.get(key)
    if (!e || now - e.start > windowMs) { hits.set(key, { start: now, count: 1 }); return true }
    e.count += 1
    if (hits.size > 10000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k)
    return e.count <= max
  }
}
