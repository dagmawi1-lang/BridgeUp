// SQLite storage using Node's built-in node:sqlite (Node 22.13+). No native add-ons to install.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { hashPassword, newId } from './security.js'

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','helper','moderator','admin')),
  bio TEXT NOT NULL DEFAULT '', skills TEXT NOT NULL DEFAULT '[]', suspended INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '', urgency TEXT NOT NULL DEFAULT 'normal', "when" TEXT NOT NULL DEFAULT 'flexible',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','closed','removed')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, category TEXT NOT NULL, skills TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '', availability TEXT NOT NULL DEFAULT 'flexible',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','removed')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), offer_id TEXT NOT NULL REFERENCES offers(id), proposed_by TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','declined','completed')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (request_id, offer_id));
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY, from_id TEXT NOT NULL REFERENCES users(id), to_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')), created_at TEXT NOT NULL, UNIQUE (from_id, to_id));
CREATE TABLE IF NOT EXISTS blocks (blocker_id TEXT NOT NULL REFERENCES users(id), blocked_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY (blocker_id, blocked_id));
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id), recipient_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS messages_pair ON messages (sender_id, recipient_id, created_at);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id), target_type TEXT NOT NULL CHECK (target_type IN ('request','offer','message','user')), target_id TEXT NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')), resolved_by TEXT, resolution TEXT, created_at TEXT NOT NULL, resolved_at TEXT,
  UNIQUE (reporter_id, target_type, target_id));
CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS circles (id TEXT PRIMARY KEY, name TEXT NOT NULL, topic TEXT NOT NULL, description TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS circle_members (circle_id TEXT NOT NULL REFERENCES circles(id), user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY (circle_id, user_id));
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, name TEXT NOT NULL, starts_at TEXT NOT NULL, location TEXT NOT NULL, description TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS event_rsvps (event_id TEXT NOT NULL REFERENCES events(id), user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY (event_id, user_id));
`

export const DEMO_PASSWORD = 'bridgeup-demo-2026'
export const now = () => new Date().toISOString()

export async function openDb(path = process.env.BRIDGEUP_DB || new URL('../data/bridgeup.db', import.meta.url).pathname, { seed = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA)
  const seeded = db.prepare("SELECT value FROM meta WHERE key='seeded'").get()
  if (seed && !seeded) await seedDemo(db)
  return db
}

/** Runs fn inside a transaction (rolled back on error). */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { db.exec('ROLLBACK'); throw e }
}

async function seedDemo(db) {
  const hash = await hashPassword(DEMO_PASSWORD)
  const t = now()
  const users = [
    ['u_alex', 'alex', 'Alex Rivera', 'member', 'Building stronger community connections.', ['coding', 'mentoring', 'science']],
    ['u_maya', 'maya', 'Maya Chen', 'helper', 'Community garden volunteer.', ['gardening', 'volunteer']],
    ['u_jordan', 'jordan', 'Jordan Lee', 'member', 'Student looking for learning support.', ['school']],
    ['u_sam', 'sam_mod', 'Sam Patel', 'moderator', 'Volunteer community moderator.', ['moderation']],
  ]
  tx(db, () => {
    const iu = db.prepare('INSERT INTO users (id, username, display_name, password_hash, role, bio, skills, created_at) VALUES (?,?,?,?,?,?,?,?)')
    for (const u of users) iu.run(u[0], u[1], u[2], hash, u[3], u[4], JSON.stringify(u[5]), t)
    const ir = db.prepare('INSERT INTO requests (id, author_id, title, category, tags, description, urgency, "when", created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    ir.run('r_sci', 'u_jordan', 'Need help with a science project', 'education', '["science","school"]', 'Looking for someone to explain photosynthesis for my project.', 'high', 'weekends', t)
    ir.run('r_garden', 'u_alex', 'Community garden setup', 'community', '["gardening","volunteer"]', 'Need a few extra hands this weekend to build raised beds.', 'normal', 'weekends', t)
    const io = db.prepare('INSERT INTO offers (id, author_id, title, category, skills, description, availability, created_at) VALUES (?,?,?,?,?,?,?,?)')
    io.run('o_tutor', 'u_alex', 'Can tutor science', 'education', '["science","school","coding"]', 'Happy to help students understand science topics.', 'weekends', t)
    io.run('o_garden', 'u_maya', 'Can help with gardens', 'community', '["gardening","volunteer"]', 'I enjoy helping with community gardens.', 'weekends', t)
    const ic = db.prepare('INSERT INTO circles (id, name, topic, description) VALUES (?,?,?,?)')
    ic.run('c_students', 'Student Support Circle', 'education', 'Study help, tutoring swaps, and exam-week check-ins.')
    ic.run('c_neighbors', 'Neighborhood Helpers', 'community', 'Errands, garden days, and small repairs.')
    db.prepare('INSERT INTO circle_members VALUES (?,?)').run('c_students', 'u_jordan')
    db.prepare('INSERT INTO circle_members VALUES (?,?)').run('c_neighbors', 'u_maya')
    const ie = db.prepare('INSERT INTO events (id, name, starts_at, location, description) VALUES (?,?,?,?,?)')
    ie.run('e_skillshare', 'Saturday Skill Share', '2026-12-05T10:00', 'Community Center', 'Teach or learn a skill in 20-minute sessions.')
    ie.run('e_meetup', 'Volunteer Meetup', '2026-12-08T18:00', 'Public Library', 'Meet local volunteers and plan winter projects.')
    db.prepare("INSERT INTO meta VALUES ('seeded', ?)").run(t)
  })
}
