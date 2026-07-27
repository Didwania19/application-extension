# Manual testing

## Step 1 — storage layer + options page

Load the extension unpacked:

1. `chrome://extensions` → enable Developer mode → "Load unpacked" → select this repo's root folder.
2. Right-click the extension icon → Options (or `chrome://extensions` → Details → Extension options).

Checklist:

- [ ] Fill in a few fields in Identity/Location/Work and reload the options page — values persist.
- [ ] Add two Education rows and two Experience rows, fill them in, reload — order and content persist, "Remove" deletes the right row.
- [ ] Set both authorization selects (`authorizedToWork`, `requiresSponsorshipNow`, `requiresSponsorshipFuture`) — confirm they're independent, not a single combined field.
- [ ] Upload a resume PDF — status line shows filename + size; reload — still shows.
- [ ] Upload a large file (~9MB) — storage bar approaches red / warning banner appears.
- [ ] Add a saved answer (pattern + response), reload — persists.
- [ ] "Export profile JSON" downloads a JSON file with everything you entered, including base64 document contents.
- [ ] Clear a field, then "Import profile JSON" with the exported file — fields restore.
- [ ] Confirm EEO fields default to "Prefer not to say" on a fresh profile and are never set unless you touch them.
- [ ] Open `chrome://extensions` → this extension's "Errors" — none.

## ATS adapters

Real public postings to verify each adapter against, updated as adapters land.

| ATS | Example posting | Status |
|---|---|---|
| Greenhouse | _TBD_ | not started |
| Lever | _TBD_ | not started |
| Ashby | _TBD_ | not started |
| Workable | _TBD_ | not started |
| SmartRecruiters | _TBD_ | not started |
| iCIMS | _TBD_ | not started |
| Workday | _TBD_ | not started |
| Generic (heuristic) | any small-company careers page | not started |
