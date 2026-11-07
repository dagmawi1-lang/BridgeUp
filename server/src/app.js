// BridgeUp API: dependency-free Node HTTP server with SQLite, sessions, role checks, and live updates (SSE).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { now, tx } from './db.js'
import { suggest, scoreMatch, MIN_SUGGESTION_SCORE } from './matching.js'
import {
  HttpError, bad, clean, requireText, tagList, oneOf, validUsername, validPassword, linkCount,
  hashPassword, verifyPassword, newToken, hashToken, newId, rateLimiter,
} from './security.js'

export const CATEGORIES = ['education', 'technology', 'community', 'environment', 'wellbeing', 'mentoring', 'other']
export const TIMES = ['weekdays', 'weekends', 'evenings', 'flexible']
const SESSION_DAYS = 7
const COOKIE = 'bridgeup_session'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }

const CREATED = Symbol('created')
const created = (body) => ({ [CREATED]: body })
const j = (s) => { try { return JSON.parse(s) } catch { return [] } }
const pubUser = (u) => u && ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role, bio: u.bio, skills: j(u.skills), suspended: !!u.suspended })
const mapRequest = (r) => ({ id: r.id, authorId: r.author_id, author: r.author_name, title: r.title, category: r.category, tags: j(r.tags), description: r.description, urgency: r.urgency, when: r.when, status: r.status, createdAt: r.created_at })
const mapOffer = (o) => ({ id: o.id, authorId: o.author_id, author: o.author_name, title: o.title, category: o.category, skills: j(o.skills), description: o.description, availability: o.availability, status: o.status, createdAt: o.created_at })

export function createApp(db, { staticDir, allowedOrigins = [], secureCookies = false, limits = {} } = {}) {
  const authLimit = rateLimiter({ windowMs: 60_000, max: limits.auth ?? 10 })
  const writeLimit = rateLimiter({ windowMs: 60_000, max: limits.write ?? 60 })
  const msgLimit = rateLimiter({ windowMs: 60_000, max: limits.messages ?? 20 })
  const streams = new Map() // userId -> Set(res)
  const routes = []
  const route = (method, pattern, ...handlers) => {
    const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '$')
    routes.push({ method, re, keys, handlers })
  }

  // ---------- helpers ----------
  const q = (sql) => db.prepare(sql)
  const userById = (id) => q('SELECT * FROM users WHERE id = ?').get(id)
  const isBlocked = (a, b) => !!q('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)').get(a, b, b, a)
  const audit = (actor, action, type, id, detail = '') => q('INSERT INTO audit_log VALUES (?,?,?,?,?,?,?)').run(newId('aud'), actor, action, type, id, String(detail).slice(0, 500), now())
  function push(userId, event, data) {
    for (const res of streams.get(userId) || []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  function notify(userId, title, body = '', link = '') {
    const n = { id: newId('n'), title: clean(title, 150), body: clean(body, 400), link, read: false, createdAt: now() }
    q('INSERT INTO notifications VALUES (?,?,?,?,?,0,?)').run(n.id, userId, n.title, n.body, link, n.createdAt)
    push(userId, 'notification', n)
  }
  const requireUser = (req) => { if (!req.user) throw new HttpError(401, 'Please sign in first.'); return req.user }
  const requireMod = (req) => { const u = requireUser(req); if (!['moderator', 'admin'].includes(u.role)) throw new HttpError(403, 'Moderator access required.'); return u }
  const canMessage = (a, b) => {
    if (isBlocked(a, b)) return false
    const connected = q("SELECT 1 FROM connections WHERE status='accepted' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))").get(a, b, b, a)
    if (connected) return true
    return !!q(`SELECT 1 FROM matches m JOIN requests r ON r.id=m.request_id JOIN offers o ON o.id=m.offer_id
      WHERE m.status IN ('accepted','completed') AND ((r.author_id=? AND o.author_id=?) OR (r.author_id=? AND o.author_id=?))`).get(a, b, b, a)
  }
  const openRequests = () => q("SELECT r.*, u.display_name AS author_name FROM requests r JOIN users u ON u.id=r.author_id WHERE r.status='open' AND u.suspended=0 ORDER BY r.created_at DESC").all().map(mapRequest)
  const activeOffers = () => q("SELECT o.*, u.display_name AS author_name FROM offers o JOIN users u ON u.id=o.author_id WHERE o.status='active' AND u.suspended=0 ORDER BY o.created_at DESC").all().map(mapOffer)

  // ---------- auth ----------
  route('POST', '/api/auth/register', async (req, res) => {
    if (!authLimit(req.ip)) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.')
    const username = String(req.body.username || '').trim().toLowerCase()
    if (!validUsername(username)) throw bad('Username must be 3–24 characters: lowercase letters, numbers, or underscores.')
    if (!validPassword(req.body.password)) throw bad('Password must be at least 10 characters.')
    const displayName = requireText(req.body.displayName || username, 'Display name', 2, 60)
    if (q('SELECT 1 FROM users WHERE username=?').get(username)) throw new HttpError(409, 'That username is taken.')
    const id = newId('u')
    q('INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?,?,?,?,?)').run(id, username, displayName, await hashPassword(req.body.password), now())
    audit(id, 'register', 'user', id)
    startSession(res, id)
    return created({ user: pubUser(userById(id)) })
  })
  route('POST', '/api/auth/login', async (req, res) => {
    if (!authLimit(req.ip)) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.')
    const u = q('SELECT * FROM users WHERE username=?').get(String(req.body.username || '').trim().toLowerCase())
    const ok = u ? await verifyPassword(req.body.password, u.password_hash) : await verifyPassword('x', 'scrypt$AAAA$AAAA') // equalize timing
    if (!u || !ok) throw new HttpError(401, 'Username or password is incorrect.')
    if (u.suspended) throw new HttpError(403, 'This account is suspended. Contact a moderator.')
    startSession(res, u.id)
    return { user: pubUser(u) }
  })
  route('POST', '/api/auth/logout', (req, res) => {
    if (req.sessionHash) q('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash)
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureCookies ? '; Secure' : ''}`)
    return { ok: true }
  })
  route('GET', '/api/auth/me', (req) => ({ user: req.user ? pubUser(req.user) : null }))
  function startSession(res, userId) {
    const token = newToken()
    q('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
    q('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token), userId, Date.now() + SESSION_DAYS * 864e5)
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Strict${secureCookies ? '; Secure' : ''}`)
  }

  // ---------- profile & people ----------
  route('GET', '/api/users', (req) => {
    const me = req.user?.id
    return q('SELECT * FROM users WHERE suspended=0 ORDER BY display_name').all().filter((u) => !me || !isBlocked(me, u.id)).map(pubUser)
  })
  route('PATCH', '/api/profile', (req) => {
    const u = requireUser(req)
    const displayName = req.body.displayName !== undefined ? requireText(req.body.displayName, 'Display name', 2, 60) : u.display_name
    const bio = req.body.bio !== undefined ? clean(req.body.bio, 300) : u.bio
    const skills = req.body.skills !== undefined ? JSON.stringify(tagList(req.body.skills, 12)) : u.skills
    q('UPDATE users SET display_name=?, bio=?, skills=? WHERE id=?').run(displayName, bio, skills, u.id)
    return { user: pubUser(userById(u.id)) }
  })

  // ---------- requests & offers ----------
  route('GET', '/api/requests', () => openRequests())
  route('GET', '/api/offers', () => activeOffers())
  route('GET', '/api/mine', (req) => {
    const u = requireUser(req)
    return {
      requests: q("SELECT r.*, ? AS author_name FROM requests r WHERE author_id=? AND status!='removed' ORDER BY created_at DESC").all(u.display_name, u.id).map(mapRequest),
      offers: q("SELECT o.*, ? AS author_name FROM offers o WHERE author_id=? AND status!='removed' ORDER BY created_at DESC").all(u.display_name, u.id).map(mapOffer),
    }
  })
  route('POST', '/api/requests', (req) => {
    const u = requireUser(req); if (!writeLimit(u.id)) throw new HttpError(429, 'You are posting too quickly.')
    const open = q("SELECT COUNT(*) n FROM requests WHERE author_id=? AND status='open'").get(u.id).n
    if (open >= 10) throw bad('You already have 10 open requests. Close one before adding another.')
    const r = { id: newId('r'), title: requireText(req.body.title, 'Title', 5, 100), category: oneOf(req.body.category, CATEGORIES, 'Category'), tags: tagList(req.body.tags), description: clean(req.body.description, 1000), urgency: oneOf(req.body.urgency, ['normal', 'high'], 'Urgency', 'normal'), when: oneOf(req.body.when, TIMES, 'When', 'flexible') }
    q('INSERT INTO requests (id, author_id, title, category, tags, description, urgency, "when", created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(r.id, u.id, r.title, r.category, JSON.stringify(r.tags), r.description, r.urgency, r.when, now())
    for (const o of activeOffers()) if (o.authorId !== u.id && !isBlocked(u.id, o.authorId) && scoreMatch({ ...r }, o).score >= 60) notify(o.authorId, 'A new request matches your offer', `"${r.title}" matches "${o.title}".`, 'matches')
    return created({ ...r, authorId: u.id, author: u.display_name, status: 'open' })
  })
  route('POST', '/api/offers', (req) => {
    const u = requireUser(req); if (!writeLimit(u.id)) throw new HttpError(429, 'You are posting too quickly.')
    const o = { id: newId('o'), title: requireText(req.body.title, 'Title', 5, 100), category: oneOf(req.body.category, CATEGORIES, 'Category'), skills: tagList(req.body.skills), description: clean(req.body.description, 1000), availability: oneOf(req.body.availability, TIMES, 'Availability', 'flexible') }
    if (!o.skills.length) throw bad('Add at least one skill.')
    q('INSERT INTO offers (id, author_id, title, category, skills, description, availability, created_at) VALUES (?,?,?,?,?,?,?,?)').run(o.id, u.id, o.title, o.category, JSON.stringify(o.skills), o.description, o.availability, now())
    return created({ ...o, authorId: u.id, author: u.display_name, status: 'active' })
  })
  const ownedOrMod = (table, id, u) => {
    const row = q(`SELECT * FROM ${table} WHERE id=?`).get(id)
    if (!row || row.status === 'removed') throw new HttpError(404, 'Not found.')
    if (row.author_id !== u.id && !['moderator', 'admin'].includes(u.role)) throw new HttpError(403, 'Only the author or a moderator can change this.')
    return row
  }
  route('PATCH', '/api/requests/:id', (req) => { const u = requireUser(req); ownedOrMod('requests', req.params.id, u); const status = oneOf(req.body.status, ['open', 'matched', 'closed'], 'Status'); q('UPDATE requests SET status=? WHERE id=?').run(status, req.params.id); return { ok: true, status } })
  route('PATCH', '/api/offers/:id', (req) => { const u = requireUser(req); ownedOrMod('offers', req.params.id, u); const status = oneOf(req.body.status, ['active', 'paused'], 'Status'); q('UPDATE offers SET status=? WHERE id=?').run(status, req.params.id); return { ok: true, status } })
  route('DELETE', '/api/requests/:id', (req) => { const u = requireUser(req); ownedOrMod('requests', req.params.id, u); q("UPDATE requests SET status='removed' WHERE id=?").run(req.params.id); audit(u.id, 'remove', 'request', req.params.id); return { ok: true } })
  route('DELETE', '/api/offers/:id', (req) => { const u = requireUser(req); ownedOrMod('offers', req.params.id, u); q("UPDATE offers SET status='removed' WHERE id=?").run(req.params.id); audit(u.id, 'remove', 'offer', req.params.id); return { ok: true } })

  // ---------- matching workflow ----------
  route('GET', '/api/matches', (req) => {
    const me = req.user?.id
    const reqs = openRequests(), offs = activeOffers()
    const byId = Object.fromEntries([...reqs.map((r) => [r.id, r]), ...offs.map((o) => [o.id, o])])
    const existing = me ? q(`SELECT m.*, r.author_id AS req_author, o.author_id AS off_author FROM matches m JOIN requests r ON r.id=m.request_id JOIN offers o ON o.id=m.offer_id WHERE r.author_id=? OR o.author_id=? ORDER BY m.updated_at DESC`).all(me, me) : []
    const taken = new Set(existing.map((m) => `${m.request_id}|${m.offer_id}`))
    const suggestions = suggest(reqs, offs, { isBlocked: me ? (a, b) => isBlocked(a, b) || isBlocked(me, a) || isBlocked(me, b) : undefined })
      .filter((s) => !taken.has(`${s.requestId}|${s.offerId}`))
      .map((s) => ({ ...s, request: byId[s.requestId], offer: byId[s.offerId], involvesMe: !!me && (byId[s.requestId].authorId === me || byId[s.offerId].authorId === me) }))
    const mine = existing.map((m) => {
      const r = q('SELECT r.*, u.display_name author_name FROM requests r JOIN users u ON u.id=r.author_id WHERE r.id=?').get(m.request_id)
      const o = q('SELECT o.*, u.display_name author_name FROM offers o JOIN users u ON u.id=o.author_id WHERE o.id=?').get(m.offer_id)
      const request = mapRequest(r), offer = mapOffer(o)
      return { id: m.id, status: m.status, score: m.score, reasons: scoreMatch(request, offer).reasons, proposedBy: m.proposed_by, request, offer, awaitingMe: m.status === 'proposed' && m.proposed_by !== me }
    })
    return { suggestions, mine, threshold: MIN_SUGGESTION_SCORE }
  })
  route('POST', '/api/matches', (req) => {
    const u = requireUser(req)
    const r = q("SELECT * FROM requests WHERE id=? AND status='open'").get(String(req.body.requestId || ''))
    const o = q("SELECT * FROM offers WHERE id=? AND status='active'").get(String(req.body.offerId || ''))
    if (!r || !o) throw new HttpError(404, 'That request or offer is no longer available.')
    if (u.id !== r.author_id && u.id !== o.author_id) throw new HttpError(403, 'Only the people involved can propose this match.')
    if (r.author_id === o.author_id) throw bad('You cannot match with yourself.')
    const other = u.id === r.author_id ? o.author_id : r.author_id
    if (isBlocked(u.id, other)) throw new HttpError(403, 'You cannot connect with this person.')
    const { score } = scoreMatch(mapRequest(r), mapOffer(o))
    const id = newId('m')
    try { q('INSERT INTO matches VALUES (?,?,?,?,?,?,?,?)').run(id, r.id, o.id, u.id, score, 'proposed', now(), now()) }
    catch { throw new HttpError(409, 'This match was already proposed.') }
    notify(other, `${u.display_name} proposed a match`, `"${r.title}" ↔ "${o.title}". Review it on the Matches page.`, 'matches')
    return created({ id, status: 'proposed' })
  })
  route('PATCH', '/api/matches/:id', (req) => {
    const u = requireUser(req)
    const m = q('SELECT m.*, r.author_id ra, o.author_id oa, r.title rt FROM matches m JOIN requests r ON r.id=m.request_id JOIN offers o ON o.id=m.offer_id WHERE m.id=?').get(req.params.id)
    if (!m || (u.id !== m.ra && u.id !== m.oa)) throw new HttpError(404, 'Match not found.')
    const status = oneOf(req.body.status, ['accepted', 'declined', 'completed'], 'Status')
    const other = u.id === m.ra ? m.oa : m.ra
    if (status !== 'completed' && m.status !== 'proposed') throw bad('This match has already been answered.')
    if (status !== 'completed' && m.proposed_by === u.id) throw new HttpError(403, 'Wait for the other person to respond.')
    if (status === 'completed' && m.status !== 'accepted') throw bad('Only accepted matches can be completed.')
    tx(db, () => {
      q('UPDATE matches SET status=?, updated_at=? WHERE id=?').run(status, now(), m.id)
      if (status === 'accepted') q("UPDATE requests SET status='matched' WHERE id=?").run(m.request_id)
      if (status === 'completed') q("UPDATE requests SET status='closed' WHERE id=?").run(m.request_id)
    })
    notify(other, `Match ${status}`, `${u.display_name} ${status} the match for "${m.rt}".${status === 'accepted' ? ' You can now message each other.' : ''}`, status === 'accepted' ? 'messages' : 'matches')
    return { ok: true, status }
  })

  // ---------- connections & blocking ----------
  route('GET', '/api/connections', (req) => {
    const u = requireUser(req)
    return q(`SELECT c.*, f.display_name from_name, t.display_name to_name FROM connections c JOIN users f ON f.id=c.from_id JOIN users t ON t.id=c.to_id WHERE c.from_id=? OR c.to_id=? ORDER BY c.created_at DESC`).all(u.id, u.id)
      .map((c) => ({ id: c.id, status: c.status, fromId: c.from_id, toId: c.to_id, fromName: c.from_name, toName: c.to_name, incoming: c.to_id === u.id }))
  })
  route('POST', '/api/connections', (req) => {
    const u = requireUser(req); if (!writeLimit(u.id)) throw new HttpError(429, 'Slow down a little.')
    const to = userById(String(req.body.userId || ''))
    if (!to || to.suspended || to.id === u.id) throw new HttpError(404, 'Person not found.')
    if (isBlocked(u.id, to.id)) throw new HttpError(403, 'You cannot connect with this person.')
    if (q('SELECT 1 FROM connections WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)').get(u.id, to.id, to.id, u.id)) throw new HttpError(409, 'A connection request already exists.')
    const id = newId('c'); q('INSERT INTO connections VALUES (?,?,?,?,?)').run(id, u.id, to.id, 'pending', now())
    notify(to.id, 'New connection request', `${u.display_name} would like to connect.`, 'profile')
    return created({ id, status: 'pending' })
  })
  route('PATCH', '/api/connections/:id', (req) => {
    const u = requireUser(req)
    const c = q('SELECT * FROM connections WHERE id=?').get(req.params.id)
    if (!c || c.to_id !== u.id) throw new HttpError(404, 'Connection request not found.')
    if (c.status !== 'pending') throw bad('Already answered.')
    const status = oneOf(req.body.status, ['accepted', 'declined'], 'Status')
    q('UPDATE connections SET status=? WHERE id=?').run(status, c.id)
    if (status === 'accepted') notify(c.from_id, 'Connection accepted', `${u.display_name} accepted your request. You can now message each other.`, 'messages')
    return { ok: true, status }
  })
  route('GET', '/api/blocks', (req) => { const u = requireUser(req); return q('SELECT b.blocked_id id, u.display_name displayName FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE blocker_id=?').all(u.id) })
  route('POST', '/api/blocks', (req) => {
    const u = requireUser(req); const t = userById(String(req.body.userId || ''))
    if (!t || t.id === u.id) throw new HttpError(404, 'Person not found.')
    q('INSERT OR IGNORE INTO blocks VALUES (?,?,?)').run(u.id, t.id, now())
    q("UPDATE connections SET status='declined' WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)").run(u.id, t.id, t.id, u.id)
    return created({ ok: true })
  })
  route('DELETE', '/api/blocks/:id', (req) => { const u = requireUser(req); q('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(u.id, req.params.id); return { ok: true } })

  // ---------- private messages ----------
  route('GET', '/api/conversations', (req) => {
    const u = requireUser(req)
    const rows = q(`SELECT CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END other, MAX(created_at) last_at,
      SUM(CASE WHEN recipient_id=? AND read=0 THEN 1 ELSE 0 END) unread FROM messages WHERE (sender_id=? OR recipient_id=?) AND hidden=0 GROUP BY other ORDER BY last_at DESC`).all(u.id, u.id, u.id, u.id)
    const contacts = new Map(rows.map((r) => [r.other, r]))
    // People you are allowed to message, even with no messages yet.
    for (const c of q("SELECT CASE WHEN from_id=? THEN to_id ELSE from_id END other FROM connections WHERE status='accepted' AND (from_id=? OR to_id=?)").all(u.id, u.id, u.id)) if (!contacts.has(c.other)) contacts.set(c.other, { other: c.other, last_at: null, unread: 0 })
    for (const m of q(`SELECT CASE WHEN r.author_id=? THEN o.author_id ELSE r.author_id END other FROM matches m JOIN requests r ON r.id=m.request_id JOIN offers o ON o.id=m.offer_id WHERE m.status IN ('accepted','completed') AND (r.author_id=? OR o.author_id=?)`).all(u.id, u.id, u.id)) if (!contacts.has(m.other)) contacts.set(m.other, { other: m.other, last_at: null, unread: 0 })
    return [...contacts.values()].filter((c) => !isBlocked(u.id, c.other)).map((c) => ({ user: pubUser(userById(c.other)), lastAt: c.last_at, unread: c.unread }))
  })
  route('GET', '/api/conversations/:userId', (req) => {
    const u = requireUser(req); const other = req.params.userId
    if (!userById(other)) throw new HttpError(404, 'Person not found.')
    q('UPDATE messages SET read=1 WHERE sender_id=? AND recipient_id=?').run(other, u.id)
    return { canMessage: canMessage(u.id, other), messages: q('SELECT id, sender_id senderId, body, created_at createdAt FROM messages WHERE hidden=0 AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) ORDER BY created_at ASC LIMIT 200').all(u.id, other, other, u.id) }
  })
  route('POST', '/api/conversations/:userId', (req) => {
    const u = requireUser(req); const to = userById(req.params.userId)
    if (!to || to.suspended) throw new HttpError(404, 'Person not found.')
    if (!msgLimit(u.id)) throw new HttpError(429, 'You are sending messages too quickly.')
    if (!canMessage(u.id, to.id)) throw new HttpError(403, 'You can message someone after they accept your connection request or a match.')
    const body = requireText(req.body.body, 'Message', 1, 1000)
    if (linkCount(body) > 2) throw bad('Messages can include at most 2 links.')
    const m = { id: newId('msg'), senderId: u.id, body, createdAt: now() }
    q('INSERT INTO messages (id, sender_id, recipient_id, body, created_at) VALUES (?,?,?,?,?)').run(m.id, u.id, to.id, body, m.createdAt)
    push(to.id, 'message', { ...m, from: pubUser(u) })
    return created(m)
  })

  // ---------- notifications ----------
  route('GET', '/api/notifications', (req) => { const u = requireUser(req); return q('SELECT id, title, body, link, read, created_at createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(u.id).map((n) => ({ ...n, read: !!n.read })) })
  route('POST', '/api/notifications/read', (req) => { const u = requireUser(req); q('UPDATE notifications SET read=1 WHERE user_id=?').run(u.id); return { ok: true } })

  // ---------- circles & events ----------
  route('GET', '/api/circles', (req) => q('SELECT c.*, (SELECT COUNT(*) FROM circle_members m WHERE m.circle_id=c.id) members, EXISTS(SELECT 1 FROM circle_members m WHERE m.circle_id=c.id AND m.user_id=?) joined FROM circles c').all(req.user?.id || '').map((c) => ({ ...c, joined: !!c.joined })))
  route('POST', '/api/circles/:id/join', (req) => { const u = requireUser(req); if (!q('SELECT 1 FROM circles WHERE id=?').get(req.params.id)) throw new HttpError(404, 'Circle not found.'); q('INSERT OR IGNORE INTO circle_members VALUES (?,?)').run(req.params.id, u.id); return { ok: true } })
  route('DELETE', '/api/circles/:id/join', (req) => { const u = requireUser(req); q('DELETE FROM circle_members WHERE circle_id=? AND user_id=?').run(req.params.id, u.id); return { ok: true } })
  route('GET', '/api/events', (req) => q('SELECT e.*, (SELECT COUNT(*) FROM event_rsvps r WHERE r.event_id=e.id) going, EXISTS(SELECT 1 FROM event_rsvps r WHERE r.event_id=e.id AND r.user_id=?) attending FROM events e ORDER BY starts_at').all(req.user?.id || '').map((e) => ({ id: e.id, name: e.name, startsAt: e.starts_at, location: e.location, description: e.description, going: e.going, attending: !!e.attending })))
  route('POST', '/api/events/:id/rsvp', (req) => { const u = requireUser(req); if (!q('SELECT 1 FROM events WHERE id=?').get(req.params.id)) throw new HttpError(404, 'Event not found.'); q('INSERT OR IGNORE INTO event_rsvps VALUES (?,?)').run(req.params.id, u.id); return { ok: true } })
  route('DELETE', '/api/events/:id/rsvp', (req) => { const u = requireUser(req); q('DELETE FROM event_rsvps WHERE event_id=? AND user_id=?').run(req.params.id, u.id); return { ok: true } })

  // ---------- reports & moderation ----------
  const targetAuthor = (type, id) => {
    if (type === 'user') return userById(id)?.id
    if (type === 'message') return q('SELECT sender_id a FROM messages WHERE id=?').get(id)?.a
    return q(`SELECT author_id a FROM ${type === 'request' ? 'requests' : 'offers'} WHERE id=?`).get(id)?.a
  }
  route('POST', '/api/reports', (req) => {
    const u = requireUser(req); if (!writeLimit(u.id)) throw new HttpError(429, 'Slow down a little.')
    const type = oneOf(req.body.targetType, ['request', 'offer', 'message', 'user'], 'Target type')
    const targetId = String(req.body.targetId || '').slice(0, 80)
    const author = targetAuthor(type, targetId)
    if (!author) throw new HttpError(404, 'The reported item was not found.')
    if (type === 'message' && !q('SELECT 1 FROM messages WHERE id=? AND recipient_id=?').get(targetId, u.id)) throw new HttpError(403, 'You can only report messages sent to you.')
    if (author === u.id) throw bad('You cannot report your own content.')
    const reason = requireText(req.body.reason, 'Reason', 5, 300)
    try { q('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, created_at) VALUES (?,?,?,?,?,?)').run(newId('rep'), u.id, type, targetId, reason, now()) }
    catch { throw new HttpError(409, 'You already reported this.') }
    for (const m of q("SELECT id FROM users WHERE role IN ('moderator','admin') AND suspended=0").all()) notify(m.id, 'New report to review', `${type}: ${reason}`, 'moderation')
    return created({ ok: true })
  })
  route('GET', '/api/moderation', (req) => {
    requireMod(req)
    return q('SELECT r.*, u.display_name reporter_name FROM reports r JOIN users u ON u.id=r.reporter_id ORDER BY (r.status=\'open\') DESC, r.created_at DESC LIMIT 100').all().map((r) => {
      let preview = ''
      if (r.target_type === 'request' || r.target_type === 'offer') preview = q(`SELECT title FROM ${r.target_type}s WHERE id=?`).get(r.target_id)?.title || ''
      if (r.target_type === 'message') preview = q('SELECT body FROM messages WHERE id=?').get(r.target_id)?.body || ''
      if (r.target_type === 'user') preview = userById(r.target_id)?.display_name || ''
      const authorId = targetAuthor(r.target_type, r.target_id)
      return { id: r.id, targetType: r.target_type, targetId: r.target_id, preview: preview.slice(0, 200), author: userById(authorId)?.display_name, reason: r.reason, reporter: r.reporter_name, status: r.status, resolution: r.resolution, createdAt: r.created_at }
    })
  })
  route('POST', '/api/moderation/:id', (req) => {
    const mod = requireMod(req)
    const r = q('SELECT * FROM reports WHERE id=?').get(req.params.id)
    if (!r) throw new HttpError(404, 'Report not found.')
    if (r.status !== 'open') throw bad('This report was already resolved.')
    const action = oneOf(req.body.action, ['dismiss', 'remove_content', 'suspend_user'], 'Action')
    const note = clean(req.body.note, 300)
    const authorId = targetAuthor(r.target_type, r.target_id)
    const author = userById(authorId)
    if (action === 'suspend_user' && author && ['moderator', 'admin'].includes(author.role) && mod.role !== 'admin') throw new HttpError(403, 'Only an admin can suspend a moderator.')
    if (action === 'remove_content' && r.target_type === 'user') throw bad('Use suspend for user reports.')
    tx(db, () => {
      if (action === 'remove_content') {
        if (r.target_type === 'message') q('UPDATE messages SET hidden=1 WHERE id=?').run(r.target_id)
        else q(`UPDATE ${r.target_type}s SET status='removed' WHERE id=?`).run(r.target_id)
      }
      if (action === 'suspend_user' && author) { q('UPDATE users SET suspended=1 WHERE id=?').run(author.id); q('DELETE FROM sessions WHERE user_id=?').run(author.id) }
      q('UPDATE reports SET status=?, resolved_by=?, resolution=?, resolved_at=? WHERE id=?').run(action === 'dismiss' ? 'dismissed' : 'actioned', mod.id, `${action}${note ? `: ${note}` : ''}`, now(), r.id)
      audit(mod.id, `moderation.${action}`, r.target_type, r.target_id, note)
    })
    notify(r.reporter_id, 'Your report was reviewed', action === 'dismiss' ? 'A moderator reviewed it and took no action.' : 'A moderator took action. Thank you for helping keep BridgeUp safe.', '')
    return { ok: true }
  })
  route('GET', '/api/audit', (req) => { requireMod(req); return q('SELECT a.*, u.display_name actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100').all().map((a) => ({ id: a.id, actor: a.actor, action: a.action, targetType: a.target_type, targetId: a.target_id, detail: a.detail, createdAt: a.created_at })) })
  route('POST', '/api/admin/users/:id/unsuspend', (req) => { const mod = requireMod(req); q('UPDATE users SET suspended=0 WHERE id=?').run(req.params.id); audit(mod.id, 'unsuspend', 'user', req.params.id); return { ok: true } })

  // ---------- analytics (real counts only) ----------
  route('GET', '/api/analytics', () => {
    const reqs = openRequests(), offs = activeOffers(), sugg = suggest(reqs, offs, { isBlocked })
    const covered = new Set(sugg.map((s) => s.requestId))
    const count = (sql) => q(sql).get().n
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, { requests: reqs.filter((r) => r.category === c).length, offers: offs.filter((o) => o.category === c).length }]))
    return {
      members: count('SELECT COUNT(*) n FROM users WHERE suspended=0'), openRequests: reqs.length, activeOffers: offs.length, suggestions: sugg.length,
      coveragePercent: reqs.length ? Math.round((covered.size / reqs.length) * 100) : 0, uncoveredRequests: reqs.filter((r) => !covered.has(r.id)).map((r) => ({ id: r.id, title: r.title, category: r.category })),
      acceptedMatches: count("SELECT COUNT(*) n FROM matches WHERE status='accepted'"), completedMatches: count("SELECT COUNT(*) n FROM matches WHERE status='completed'"),
      openReports: count("SELECT COUNT(*) n FROM reports WHERE status='open'"), byCategory,
    }
  })
  route('GET', '/api/meta', () => ({ categories: CATEGORIES, times: TIMES, minSuggestionScore: MIN_SUGGESTION_SCORE }))
  route('GET', '/api/health', () => ({ ok: true, service: 'BridgeUp API', version: '7.0.0' }))

  // ---------- live updates (Server-Sent Events) ----------
  function stream(req, res) {
    const u = requireUser(req)
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.write(`event: ready\ndata: {}\n\n`)
    if (!streams.has(u.id)) streams.set(u.id, new Set())
    streams.get(u.id).add(res)
    const beat = setInterval(() => res.write(': ping\n\n'), 25_000)
    req.on('close', () => { clearInterval(beat); streams.get(u.id)?.delete(res) })
  }

  // ---------- request pipeline ----------
  function cookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])) }
  function security(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
  }
  function sameOrigin(req) {
    const origin = req.headers.origin
    if (!origin) return true // non-browser clients; cookies are SameSite=Strict
    try { const o = new URL(origin); return o.host === req.headers.host || allowedOrigins.includes(origin) } catch { return false }
  }
  async function readJson(req) {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return {}
    const chunks = []; let size = 0
    for await (const c of req) { size += c.length; if (size > 32_768) throw new HttpError(413, 'Request is too large.'); chunks.push(c) }
    if (!size) return {}
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'Send JSON.')
    try { const b = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0; return b } catch { throw bad('Invalid JSON body.') }
  }
  function serveStatic(req, res, path) {
    if (!staticDir || !existsSync(staticDir)) return false
    let file = resolve(join(staticDir, decodeURIComponent(path)))
    if (!file.startsWith(resolve(staticDir))) return false
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, 'index.html')
    if (!existsSync(file)) return false
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
    res.end(readFileSync(file)); return true
  }

  return async function handler(req, res) {
    security(res)
    const url = new URL(req.url, 'http://local')
    req.ip = req.socket.remoteAddress || 'local'
    try {
      const token = cookies(req)[COOKIE]
      if (token) {
        req.sessionHash = hashToken(token)
        const s = q('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(req.sessionHash, Date.now())
        if (s && !s.suspended) req.user = s
      }
      if (!url.pathname.startsWith('/api/')) { if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return; throw new HttpError(404, 'Not found.') }
      if (url.pathname === '/api/stream' && req.method === 'GET') return stream(req, res)
      if (req.method !== 'GET' && !sameOrigin(req)) throw new HttpError(403, 'Cross-site request blocked.')
      req.body = await readJson(req)
      req.query = Object.fromEntries(url.searchParams)
      for (const r of routes) {
        if (r.method !== req.method) continue
        const m = r.re.exec(url.pathname); if (!m) continue
        req.params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
        let out = await r.handlers[0](req, res)
        let status = 200
        if (out && typeof out === 'object' && CREATED in out) { status = 201; out = out[CREATED] }
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        return res.end(JSON.stringify(out))
      }
      throw new HttpError(404, 'API route not found.')
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status === 500) console.error(e)
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ error: status === 500 ? 'Something went wrong on the server.' : e.message }))
    }
  }
}
