import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { openDb } from './db.js'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 5000)
const db = await openDb()
const handler = createApp(db, {
  staticDir: fileURLToPath(new URL('../../client/dist', import.meta.url)),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  secureCookies: process.env.NODE_ENV === 'production',
})
http.createServer(handler).listen(port, () => console.log(`BridgeUp API on http://localhost:${port}`))
