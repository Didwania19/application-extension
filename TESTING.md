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

## ATS coverage

Verified by injecting the real `src/content/*.js` into a live posting and reading
back what the matcher resolved — not against saved HTML, and not against
hand-built test objects.

| ATS | Verified against | Status |
|---|---|---|
| Greenhouse | Anthropic, Affirm, Figma, Discord, Reddit, DoorDash, Gusto, BambooHR, Webflow, Duolingo | verified |
| Lever | Zartis, Flex, Shield AI | verified |
| Ashby | Linear, Replit, Perplexity | verified |
| SmartRecruiters | Standard Bank, Mattel | verified |
| Workday | J&J, VF Corp (Vans), Blue Origin | verified — needs a signed-in session |
| Workable | _none found live_ | untested |
| iCIMS | _none found live_ | untested |
| Generic (heuristic) | any small-company careers page | untested |

Notes:

- Workday hides its form behind "Create Account / Sign In", so testing it needs a
  real logged-in session. Unsaved wizard steps are not persisted server-side
  until you click "Save and Continue", which is what makes testing on a live
  account survivable.
- Several vendors route "Apply" off-platform to a different ATS (Visa and
  Mirantis both do this on SmartRecruiters), so a posting hosted on one platform
  is not always an application form on that platform.

## Field-matching regressions

`node tests/engine.test.mjs` covers the label→path rules, the row cursor, date
sub-fields and the listbox-button widget. Every rule that exists to *prevent* a
mis-fill has a test naming the real posting that surfaced it — "Phone Device
Type", "Country Phone Code", "How do you pronounce your name?", and the SMS
consent question that mentions email in passing.
