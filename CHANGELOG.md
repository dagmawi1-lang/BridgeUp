# Changelog

## 7.0 - 2026-11-07
- Rewrote the API as a dependency-free Node HTTP server with **SQLite** (`node:sqlite`) instead of a JSON file.
- **Authentication:** register, sign in, and sign out with scrypt password hashing, hashed session tokens, HttpOnly SameSite=Strict cookies, and sign-in rate limiting.
- **Authorization:** roles enforced on every route. Only authors or moderators can edit or remove posts. Moderator-only queue and audit log.
- **Private messaging** gated by an accepted match or connection. Participant-only reads, rate limits, and a link cap.
- **Live updates** via Server-Sent Events for notifications and messages.
- **Abuse prevention:** blocking, reporting (one per person per item), moderation actions (dismiss, remove content, suspend with session revocation), an audit log, and reporter notifications.
- **Match workflow** (propose/accept/decline/complete) with server-side explainable scoring, which now also considers urgency and availability.
- Real circle membership, event RSVPs, profile editing, and analytics computed from data. Placeholder statistics and a decorative chart were replaced with real data.
- Frontend rewritten: sign-in screen with demo accounts, all pages wired to the API, report buttons, accessible navigation, and a mobile top nav.
- Tests: 9 API test groups that start the server against an in-memory database.

## 6.0
- Persistent API-backed state
- Offline fallback and connection status
- Server-created IDs
- Server-backed messages and notifications
- Reports and moderation workflow
- Demo profiles, roles, and connection requests
- Responsive UI and dark mode
- Input cleaning and basic security headers
- Expanded tests
