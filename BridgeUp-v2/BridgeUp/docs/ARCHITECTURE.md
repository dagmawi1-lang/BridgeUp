# BridgeUp V2 architecture

## Overview

BridgeUp is a monorepo with a Vite/React single-page client and an Express API. The browser UI uses localStorage as its immediate state store and synchronizes a snapshot with the local API when the service is reachable. The API persists that snapshot to a JSON file using an atomic temporary-file rename.

## Client

- `App.jsx` owns page navigation, demo state, modal workflows, and local persistence.
- `data/seed.js` provides fictional starter records.
- `styles.css` contains the responsive visual system and theme styles.
- The API status indicator distinguishes checking, syncing, connected, and local-only states.
- Matching suggestions are derived from shared topic tags and category labels.

## Server

- `GET /api/health` provides a health check.
- `GET /api/community` reads the persisted snapshot.
- `PUT /api/community` validates and stores a snapshot.
- `GET /api/matches` returns matches from persisted records.
- `POST /api/matches/preview` validates arrays and returns explainable matches.
- `store.js` normalizes user-controlled text, bounds collection sizes, and writes data with restrictive file permissions.
- `matching.js` is a pure module separated from HTTP concerns.

## Data flow

```text
React UI
  ├─ load localStorage snapshot (if present)
  ├─ request community snapshot from API
  ├─ update local UI immediately
  ├─ persist browser snapshot
  └─ synchronize snapshot to API when online

Express API
  ├─ validate and normalize snapshot
  ├─ write JSON atomically
  └─ calculate explainable tag/category matches
```

## Matching score

`score = number of shared tags + 1 when categories match`

The algorithm is deterministic and explainable. It uses no names, locations, demographics, or behavioral histories.

## Persistence and validation

- Maximum 250 records per collection.
- Maximum 8 tags per record; each tag is limited to 28 characters.
- Text fields are length-limited and angle brackets/control characters are stripped.
- The JSON file is written to a temporary path and renamed into place.
- File permissions are set to owner read/write on supported POSIX systems.

## Current limitations

There is no authentication, authorization, database concurrency control, real-time messaging, or moderation workflow. The API is intended for local demonstration and must not be exposed publicly. Browser localStorage and the JSON file are not a production multi-user architecture. Demo records are fictional.
