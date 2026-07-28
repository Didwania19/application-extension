# Fieldwork

Autofill for job applications. Fills the same name, address, work history and
authorization answers you retype on every application — and stops there. It
never submits anything on your behalf.

## Why this one

Your profile is stored with `chrome.storage.local` and never leaves the browser.
There is no account to create, no server to sign into, and the extension makes no
network requests of its own — every other autofill extension on the Chrome Web
Store requires a login and uploads your details to be useful.

It also declines to guess. Where a field is ambiguous ("Phone Device Type",
"Country Phone Code", an SMS consent question that happens to mention email) it
leaves the field alone rather than typing something plausible into a real
application, and it tells you what it skipped.

Full details in [PRIVACY.md](PRIVACY.md). The short version: no account, no
server, no analytics, and nothing transmitted anywhere.

## Install

Not yet on the Chrome Web Store. To run it locally:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Open the extension's **Options** and fill in your profile

Then click the toolbar icon on any job application page. A toast reports what was
filled and what you need to complete by hand.

## Supported ATS

Verified against live postings on Greenhouse, Lever, Ashby, SmartRecruiters and
Workday. Fields are matched by their visible label rather than by `id` or `name`,
which vary per tenant, so unlisted platforms often work too — see `TESTING.md`
for what was actually tested where.

## Development

```
node tests/engine.test.mjs      # label-matching and row-cursor regression tests
python3 icons/make_icons.py     # regenerate the PNG icons
./package.sh                    # build the Chrome Web Store zip
```

The tests load `src/content/*.js` directly rather than a copy, because a
transcribed copy once hid a real bug for hours.

## Layout

| Path | What it does |
|---|---|
| `src/content/field-map.js` | Ordered label→profile-path rules. First match wins. |
| `src/content/fill-engine.js` | Finds fields, resolves repeated rows, drives the widgets. |
| `src/content/content.js` | Entry point; runs the fill and reports the result. |
| `src/options/` | Profile editor. |
| `src/lib/resumeParser.js` | Pulls a profile out of an uploaded resume PDF. |

## License

MIT — see [LICENSE](LICENSE). Bundles [PDF.js](https://github.com/mozilla/pdf.js)
(Apache 2.0) for reading uploaded résumés.
