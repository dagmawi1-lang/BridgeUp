# BridgeUp

**Small acts. Stronger communities.**

BridgeUp is a community-support platform concept for the CSC Winter Sparkathon. It helps people discover support requests, share skills, join interest-based circles, and participate in community events. Its central idea is simple: make it easier for people to find a useful way to show up for one another.

## The problem

People often want to help but do not know who needs support or where to start. At the same time, people with a small need may not know how to ask their community. Opportunities, skills, and local activities are scattered across group chats, bulletin boards, and separate platforms.

## The solution

BridgeUp brings four community actions into one approachable experience:

- **Support board:** post a request and let community members offer help.
- **Ways to help:** share skills, time, and practical support.
- **Community circles:** join groups around shared interests.
- **Events and meetups:** discover and join shared activities.

A transparent matching feature highlights possible connections using only shared topic tags and categories. It does not infer personality, rank people, or use sensitive personal data.

## Version 2 features

Everything in V1, plus:
- Optional API synchronization between the browser UI and the Express service.
- JSON file persistence on the server with atomic writes and restrictive file permissions.
- Input length limits, basic text normalization, collection-size limits, and safer response headers.
- A visible API status indicator showing synced, saving, or local-only mode.
- Additional automated tests for persistence, normalization, and validation.

## Version 1 features

- Responsive React dashboard and six navigation sections.
- Search across requests, offers, circles, and events.
- Category filters on support and offer boards.
- Create support requests and offers with form validation.
- Join/leave circles and meetups.
- Support actions and a community impact summary.
- Explainable tag/category matching suggestions.
- Local browser persistence with a restore-demo control.
- Express API with health and match-preview endpoints.
- Automated Node tests for matching logic.
- Dark appearance preference.

## Technology

- React 18 and Vite
- JavaScript (ES modules)
- CSS (responsive layout, no component framework)
- Node.js and Express
- Node's built-in test runner
- Browser localStorage and optional server-side JSON persistence

## Run locally

Prerequisites: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

The client runs at `http://localhost:5173` and the API at `http://localhost:5000`.

Run the tests:

```bash
npm test
```

Build the client:

```bash
npm run build
```

Optional environment configuration can be copied from `.env.example`. Set `VITE_API_URL` for the client build and `DATA_FILE` for the server's JSON storage path. The default client API URL is `http://localhost:5000/api`.

## API

- `GET /api/health` — service status.
- `GET /api/community` — read the current community snapshot.
- `PUT /api/community` — save a validated community snapshot.
- `GET /api/matches` — calculate matches using persisted records.
- `POST /api/matches/preview` — preview matches for supplied request and offer arrays.

The V2 browser client attempts to load and synchronize community data with the local API. If the API is unavailable, the app continues in local-only mode using browser localStorage. The server currently uses a JSON file rather than a production database.

## Data, privacy, and safety notes

- The included people, requests, events, and counts are fictional demonstration data.
- Do not enter phone numbers, home addresses, private contact details, or sensitive information.
- This version is a prototype, not a production service. It does not provide authentication, identity verification, private messaging, moderation queues, or real-world volunteer vetting.
- The matching algorithm uses shared tags and category only. A match is a suggestion, not an endorsement or guarantee.
- The JSON API has no user authentication. Do not expose it to the public internet or store real personal information.
- Before a public launch, add moderation/reporting, abuse prevention, role-based permissions, a secure database, consent flows, and clear community safety policies.

## AI use disclosure

AI assistance was used to brainstorm the project structure, draft and refine code, generate sample interface content, and help document the implementation. The matching logic in this version is deterministic JavaScript, not an LLM or trained machine-learning model. The project owner should review, run, understand, and be able to explain the code before submitting.

## Project structure

```text
BridgeUp/
├── client/
│   ├── src/
│   │   ├── data/seed.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── src/index.js
│   ├── src/matching.js
│   ├── src/store.js
│   ├── test/matching.test.js
│   ├── test/store.test.js
│   └── package.json
├── docs/
├── .env.example
├── .gitignore
└── package.json
```

## Roadmap

### V3
- Add a real database and account/session design.
- Add request lifecycle states, safe coordination, and moderation/reporting.
- Add accessibility review and end-to-end tests.
- Add optional AI-assisted post drafting and event summaries with human review and disclosure.
- Add deployment configuration and aggregate impact reporting.

## License

MIT. See `LICENSE`.
