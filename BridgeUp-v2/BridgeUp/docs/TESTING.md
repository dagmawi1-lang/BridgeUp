# Testing notes

## Automated tests

Run `npm test` from the repository root. The Node built-in test runner checks:

1. Shared tag and category scoring.
2. Zero-score behavior when no matching signals exist.
3. Sorting and exclusion of closed requests.
4. Maximum number of suggestions returned.
5. Text normalization and tag deduplication.
6. Collection size limits.
7. JSON persistence and file permissions.
8. Preservation of existing collections during partial snapshot updates.

## Manual UI checks

- Navigate through Overview, Support board, Ways to help, Community circles, Events & meetups, and My impact.
- Search each page using the global search field.
- Filter the support and offer boards by category.
- Create a request and verify it appears in the support board.
- Create an offer and verify it appears in Ways to help.
- Join and leave a circle and event.
- Start the API and verify the status indicator changes to Synced.
- Stop the API and verify the interface continues in Local mode.
- Toggle dark appearance, refresh, and verify the current session behavior.
- Use Preferences → Restore demo data to return to the starter dataset.
- Check the layout at desktop, tablet, and mobile widths.

## Known testing boundary

The automated tests cover matching and storage logic without third-party packages. A dependency installation and browser-based end-to-end run are still required to verify the full Vite/React build. The API routes require Express and CORS dependencies to run.
