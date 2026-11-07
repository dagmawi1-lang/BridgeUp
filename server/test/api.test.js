import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { openDb, DEMO_PASSWORD } from '../src/db.js'
import { createApp } from '../src/app.js'
import { scoreMatch, suggest } from '../src/matching.js'
import { clean, tagList, linkCount, hashPassword, verifyPassword } from '../src/security.js'

let server, base
test.before(async () => {
  const db = await openDb(':memory:')
  server = http.createServer(createApp(db, { limits: { auth: 1000 } }))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
test.after(() => server.close())

function client() {
  let cookie = ''
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0]
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  return { call, login: (username) => call('POST', '/api/auth/login', { username, password: DEMO_PASSWORD }) }
}

test('unit: cleaning, tags, links, password hashing', async () => {
  assert.equal(clean(' <b>hi</b>\u0007 '), 'bhi/b')
  assert.deepEqual(tagList('Science, school, science,, ' + 'x'.repeat(40)), ['science', 'school', 'x'.repeat(30)])
  assert.equal(linkCount('see https://a.com and www.b.org'), 2)
  const h = await hashPassword('correct horse battery'); assert.ok(await verifyPassword('correct horse battery', h)); assert.ok(!(await verifyPassword('wrong', h)))
})
test('unit: explainable matching', () => {
  const m = scoreMatch({ category: 'education', tags: ['science', 'school'], urgency: 'high', when: 'weekends' }, { category: 'education', skills: ['Science', 'school'], availability: 'weekends' })
  assert.equal(m.score, 100); assert.equal(m.reasons.length, 4)
  assert.equal(scoreMatch({ category: 'technology', tags: [] }, { category: 'community', skills: ['x'] }).score, 0)
  assert.equal(scoreMatch({ category: 'education', tags: [] }, { category: 'technology', skills: [] }).score, 20)
  const s = suggest([{ id: 'r', authorId: 'a', category: 'education', tags: ['science'] }], [{ id: 'o', authorId: 'a', category: 'education', skills: ['science'] }])
  assert.equal(s.length, 0, 'no self-matches')
})
test('auth: register, duplicate, weak password, login, logout, rate limit', async () => {
  const c = client()
  assert.equal((await c.call('POST', '/api/auth/register', { username: 'new_user', password: 'short' })).status, 400)
  assert.equal((await c.call('POST', '/api/auth/register', { username: 'Bad Name!', password: 'longenough123' })).status, 400)
  const r = await c.call('POST', '/api/auth/register', { username: 'new_user', password: 'longenough123', displayName: 'New <User>' })
  assert.equal(r.status, 201); assert.equal(r.body.user.displayName, 'New User'); assert.equal(r.body.user.role, 'member')
  assert.equal((await c.call('GET', '/api/auth/me')).body.user.username, 'new_user')
  assert.equal((await client().call('POST', '/api/auth/register', { username: 'new_user', password: 'longenough123' })).status, 409)
  await c.call('POST', '/api/auth/logout')
  assert.equal((await c.call('GET', '/api/auth/me')).body.user, null)
  assert.equal((await c.call('POST', '/api/auth/login', { username: 'new_user', password: 'nope-nope-nope' })).status, 401)
})
test('authorization: anonymous writes blocked, cross-site blocked, only author/mod can edit', async () => {
  const anon = client()
  assert.equal((await anon.call('POST', '/api/requests', { title: 'Help please', category: 'education' })).status, 401)
  const jordan = client(); await jordan.login('jordan')
  assert.equal((await jordan.call('POST', '/api/requests', { title: 'Need math help', category: 'education' }, { Origin: 'https://evil.example' })).status, 403)
  const alex = client(); await alex.login('alex')
  assert.equal((await alex.call('PATCH', '/api/requests/r_sci', { status: 'closed' })).status, 403, 'alex does not own r_sci')
  assert.equal((await jordan.call('POST', '/api/requests', { title: 'Hi', category: 'education' })).status, 400, 'title too short')
  assert.equal((await jordan.call('POST', '/api/requests', { title: 'Valid title', category: 'nonsense' })).status, 400)
  const mod = client(); await mod.login('sam_mod')
  const made = await jordan.call('POST', '/api/requests', { title: 'Temporary request', category: 'other' })
  assert.equal((await mod.call('PATCH', `/api/requests/${made.body.id}`, { status: 'closed' })).status, 200, 'moderator may edit')
  assert.equal((await anon.call('GET', '/api/moderation')).status, 401)
  assert.equal((await jordan.call('GET', '/api/moderation')).status, 403)
})
test('match workflow → messaging permission → notifications', async () => {
  const jordan = client(); await jordan.login('jordan')
  const alex = client(); await alex.login('alex')
  // Messaging is not allowed before a match or connection.
  assert.equal((await jordan.call('POST', '/api/conversations/u_alex', { body: 'hello' })).status, 403)
  const sugg = (await jordan.call('GET', '/api/matches')).body.suggestions
  const s = sugg.find((x) => x.requestId === 'r_sci' && x.offerId === 'o_tutor')
  assert.ok(s && s.score >= 80 && s.reasons.length >= 2, 'science request ↔ tutor offer suggested with reasons')
  const p = await jordan.call('POST', '/api/matches', { requestId: 'r_sci', offerId: 'o_tutor' }); assert.equal(p.status, 201)
  assert.equal((await jordan.call('POST', '/api/matches', { requestId: 'r_sci', offerId: 'o_tutor' })).status, 409)
  assert.equal((await jordan.call('PATCH', `/api/matches/${p.body.id}`, { status: 'accepted' })).status, 403, 'proposer cannot accept own proposal')
  const notes = (await alex.call('GET', '/api/notifications')).body
  assert.ok(notes.some((n) => /proposed a match/.test(n.title)))
  assert.equal((await alex.call('PATCH', `/api/matches/${p.body.id}`, { status: 'accepted' })).status, 200)
  assert.equal((await jordan.call('POST', '/api/conversations/u_alex', { body: 'Thanks! When are you free?' })).status, 201)
  assert.equal((await jordan.call('POST', '/api/conversations/u_alex', { body: 'https://a.com https://b.com https://c.com' })).status, 400, 'link spam limit')
  const convo = (await alex.call('GET', '/api/conversations/u_jordan')).body
  assert.equal(convo.canMessage, true); assert.equal(convo.messages.length, 1)
  // A third person cannot read the conversation between alex and jordan.
  const maya = client(); await maya.login('maya')
  assert.equal((await maya.call('GET', '/api/conversations/u_jordan')).body.messages.length, 0)
  assert.equal((await alex.call('PATCH', `/api/matches/${p.body.id}`, { status: 'completed' })).status, 200)
  const reqs = (await alex.call('GET', '/api/requests')).body
  assert.ok(!reqs.some((r) => r.id === 'r_sci'), 'completed request is closed')
})
test('connections and blocking', async () => {
  const maya = client(); await maya.login('maya')
  const jordan = client(); await jordan.login('jordan')
  const c = await maya.call('POST', '/api/connections', { userId: 'u_jordan' }); assert.equal(c.status, 201)
  assert.equal((await maya.call('PATCH', `/api/connections/${c.body.id}`, { status: 'accepted' })).status, 404, 'only the recipient answers')
  assert.equal((await jordan.call('PATCH', `/api/connections/${c.body.id}`, { status: 'accepted' })).status, 200)
  assert.equal((await maya.call('POST', '/api/conversations/u_jordan', { body: 'Hi Jordan!' })).status, 201)
  assert.equal((await jordan.call('POST', '/api/blocks', { userId: 'u_maya' })).status, 201)
  assert.equal((await maya.call('POST', '/api/conversations/u_jordan', { body: 'Hello?' })).status, 403, 'blocked users cannot message')
  assert.ok(!(await jordan.call('GET', '/api/users')).body.some((u) => u.id === 'u_maya'), 'blocked user hidden from directory')
  await jordan.call('DELETE', '/api/blocks/u_maya')
})
test('reports, moderation actions, suspension, and audit log', async () => {
  const jordan = client(); await jordan.login('jordan')
  const maya = client(); await maya.login('maya')
  const spam = await maya.call('POST', '/api/offers', { title: 'Totally legit offer', category: 'other', skills: 'spam' })
  assert.equal((await maya.call('POST', '/api/reports', { targetType: 'offer', targetId: spam.body.id, reason: 'own content' })).status, 400)
  assert.equal((await jordan.call('POST', '/api/reports', { targetType: 'offer', targetId: spam.body.id, reason: 'Looks like spam' })).status, 201)
  assert.equal((await jordan.call('POST', '/api/reports', { targetType: 'offer', targetId: spam.body.id, reason: 'Looks like spam' })).status, 409)
  const mod = client(); await mod.login('sam_mod')
  const queue = (await mod.call('GET', '/api/moderation')).body
  const rep = queue.find((r) => r.targetId === spam.body.id); assert.equal(rep.preview, 'Totally legit offer'); assert.equal(rep.author, 'Maya Chen')
  assert.equal((await mod.call('POST', `/api/moderation/${rep.id}`, { action: 'remove_content', note: 'spam' })).status, 200)
  assert.ok(!(await jordan.call('GET', '/api/offers')).body.some((o) => o.id === spam.body.id))
  assert.equal((await mod.call('POST', `/api/moderation/${rep.id}`, { action: 'dismiss' })).status, 400, 'cannot resolve twice')
  // Suspend: reported user loses their session and content disappears.
  const bad = client(); await bad.call('POST', '/api/auth/register', { username: 'troll_1', password: 'longenough123' })
  const post = await bad.call('POST', '/api/requests', { title: 'Rude request text', category: 'other' })
  await jordan.call('POST', '/api/reports', { targetType: 'user', targetId: (await bad.call('GET', '/api/auth/me')).body.user.id, reason: 'Harassing people' })
  const rep2 = (await mod.call('GET', '/api/moderation')).body.find((r) => r.targetType === 'user' && r.status === 'open')
  assert.equal((await mod.call('POST', `/api/moderation/${rep2.id}`, { action: 'suspend_user' })).status, 200)
  assert.equal((await bad.call('GET', '/api/auth/me')).body.user, null, 'session revoked')
  assert.equal((await bad.call('POST', '/api/auth/login', { username: 'troll_1', password: 'longenough123' })).status, 403)
  assert.ok(!(await jordan.call('GET', '/api/requests')).body.some((r) => r.id === post.body.id))
  const auditLog = (await mod.call('GET', '/api/audit')).body
  assert.ok(auditLog.some((a) => a.action === 'moderation.remove_content') && auditLog.some((a) => a.action === 'moderation.suspend_user'))
  assert.ok((await jordan.call('GET', '/api/notifications')).body.some((n) => /report was reviewed/.test(n.title)))
})
test('circles, events, profile, analytics, and input limits', async () => {
  const alex = client(); await alex.login('alex')
  await alex.call('POST', '/api/circles/c_students/join')
  assert.equal((await alex.call('GET', '/api/circles')).body.find((c) => c.id === 'c_students').joined, true)
  await alex.call('POST', '/api/events/e_meetup/rsvp'); await alex.call('POST', '/api/events/e_meetup/rsvp')
  assert.equal((await alex.call('GET', '/api/events')).body.find((e) => e.id === 'e_meetup').going, 1, 'RSVP is idempotent')
  const p = await alex.call('PATCH', '/api/profile', { bio: 'Updated bio', skills: 'Coding, Robotics' })
  assert.deepEqual(p.body.user.skills, ['coding', 'robotics'])
  const a = (await alex.call('GET', '/api/analytics')).body
  assert.ok(a.members >= 4 && a.coveragePercent >= 0 && a.coveragePercent <= 100 && Array.isArray(a.uncoveredRequests))
  const big = await fetch(base + '/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x'.repeat(40000) }) })
  assert.equal(big.status, 413)
  assert.equal((await alex.call('GET', '/api/nope')).status, 404)
})

test('rate limiting on sign-in attempts', async () => {
  const db = await openDb(':memory:')
  const srv = http.createServer(createApp(db, { limits: { auth: 3 } }))
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${srv.address().port}/api/auth/login`
  const codes = []
  for (let i = 0; i < 5; i++) codes.push((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alex', password: 'wrong-password' }) })).status)
  srv.close()
  assert.deepEqual(codes, [401, 401, 401, 429, 429])
})
