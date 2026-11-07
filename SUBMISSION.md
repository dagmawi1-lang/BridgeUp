# CSC Winter Sparkathon submission draft — BridgeUp V7

**Problem:** People want to help their community but don't know who needs support. People who need help don't know whom to ask, and are rightly wary of being contacted by strangers.

**Solution:** BridgeUp matches support requests with skill offers and shows exactly why each match was suggested. Messaging only opens after both people agree, and blocking, reporting, and a moderator queue with an audit log keep the community safe.

**How it works:** React + Vite frontend; dependency-free Node.js API; SQLite via `node:sqlite`; scrypt password hashing and HttpOnly session cookies; Server-Sent Events for live notifications and messages; 9 automated API test groups.

**AI disclosure:** AI tools were used for brainstorming, code generation, debugging, and documentation. The team reviewed and tested the final implementation.

## 90-second demo script
1. (10s) Sign in as **Jordan** (student). The home page shows live counts and suggestions.
2. (15s) Post an urgent request: "Help with chemistry homework" with tags `science, chemistry`.
3. (15s) Open **Matches**. Point at the score breakdown (+40 category, +20 shared skill, +10 urgent) and click **Propose match**.
4. (15s) In a second window signed in as **Alex**, the notification pops up live. Accept the match.
5. (10s) Alex sends a message, and it appears instantly in Jordan's window. Note that messaging was impossible before the match was accepted.
6. (15s) Jordan reports a message. In a third window as **Sam (moderator)**, show the queue, take an action, and show the audit log.
7. (10s) Close with Analytics ("requests still needing a helper") and the safety features: blocking, consent-gated messaging, and an audit log.
