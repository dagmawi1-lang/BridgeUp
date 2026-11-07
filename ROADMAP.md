# Remaining work after V7

## Done in V7 (was on the V6 list)
- ✅ Real authentication with secure password and session handling
- ✅ Server-side authorization for member/helper/moderator/admin roles
- ✅ Real database with transactions and constraints (SQLite)
- ✅ Real-time delivery (Server-Sent Events), private conversations, blocking
- ✅ Moderation workflow with audit log
- ✅ Rate limits, same-origin (CSRF) checks, validation, and size limits
- ✅ Accept/decline/complete matches, circle membership, event RSVPs, profile editing
- ✅ Weighted matching (category, skills, urgency, availability)
- ✅ API tests for auth, permissions, messaging, and moderation

## Still to do for a real deployment
1. Email verification, password reset, and optional 2FA.
2. HTTPS hosting (set `NODE_ENV=production` so cookies are `Secure`), backups for `server/data/`, and monitoring.
3. Shared pub/sub (e.g. Redis) if running more than one server process.
4. End-to-end encryption for messages (currently protected by access control and TLS).
5. Age and safeguarding policy review before real students use it.
6. A screen-reader pass with NVDA/VoiceOver, plus end-to-end browser tests in CI.

## Submission polish
7. Record a 60–90 second demo (see `SUBMISSION.md`).
8. Replace placeholder team details.
