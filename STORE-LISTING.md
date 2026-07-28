# Chrome Web Store listing copy

Ready to paste. Character limits are Chrome's and are noted where they bind.

---

## Name (75 max — currently 41)

```
Fieldwork — autofill for job applications
```

## Short description (132 max — currently 129)

Shown under the name in search results. This is the highest-leverage sentence in
the whole listing.

```
Autofills job applications from a profile saved on your device. No account, no server, nothing uploaded. Never submits for you.
```

## Category

**Productivity** → Workflow & Planning.

Not "Social & Communication" and not "Developer Tools" — the audience is people
applying for jobs, and Productivity is where the competing autofill extensions
are found.

---

## Detailed description

```
Fieldwork fills in the parts of a job application you have already typed a
hundred times — your name, address, work history, education, and the same work
authorization questions every company asks — so you can spend your attention on
the parts that actually differ.

Then it stops. Fieldwork never submits an application for you. It fills the
form, tells you what it filled, and leaves the final read and the Submit button
to you.


YOUR DATA STAYS ON YOUR COMPUTER

Most autofill extensions require you to create an account and upload your
résumé and personal details to their servers. Fieldwork does not.

• No account, no sign-in, no server
• Your profile is stored only in your browser's local extension storage
• No analytics, no telemetry, no tracking, no third-party code
• Your résumé is read on your own machine, never uploaded for parsing
• Uninstalling the extension deletes everything — there is nothing to request

The extension makes no network requests at all. It is open source, so you can
verify that rather than take our word for it.


IT DECLINES TO GUESS

An autofill tool that puts the wrong answer in a real job application is worse
than one that leaves the field blank. Fieldwork is deliberately conservative:

• It fills a field only when it is confident what that field is asking
• It skips ambiguous fields instead of guessing — a "Phone Device Type"
  dropdown does not get your phone number typed into it
• It reports every field it filled, skipped, or could not handle, so you always
  know what is left to complete by hand
• It never invents answers to essay questions or open-ended prompts


HANDLES THE HARD PARTS

• Multi-row work history and education — clicking "Add another" moves to your
  next job, rather than repeating the first one
• Split month/year date fields, including telling a start date from an end date
• Custom dropdown widgets that ignore ordinary autofill
• Forms embedded in a frame inside a company's own careers page


WORKS ON

Greenhouse, Lever, Ashby, SmartRecruiters, and Workday — each verified against
live job postings. Fields are matched by their visible label rather than by
internal field names, which differ for every company, so other application
forms often work too.


HOW TO USE IT

1. Open the extension's options and fill in your profile once
2. Open a job application
3. Click the Fieldwork icon
4. Review everything, complete anything it left blank, and submit it yourself

Free, open source, and with no paid tier.
```

---

## What makes it different — one line per competitor

For the listing, for a README, or for a Product Hunt post.

| Against | The difference |
|---|---|
| **Simplify Copilot** | Requires an account and uploads your profile. Fieldwork has no account and uploads nothing. |
| **JobWizard** | Generates AI answers to open-ended questions. Fieldwork does not write anything you did not write yourself. |
| **LazyApply** | Mass-submits applications on your behalf. Fieldwork never submits anything. |
| **Teal / Careerflow** | Job trackers and résumé builders that also autofill, from $9–24/month. Fieldwork does one thing, free. |
| **GitHub autofill projects** | Also local-only, but distributed as unpacked folders. Fieldwork is a packaged, installable extension. |

The positioning in one sentence: **the only installable autofill extension that
never asks you to hand over your data.**

---

## Screenshots (1280×800 or 640×400 — up to 5)

Chrome shows these prominently and they matter more than the description. Take
them after loading the extension unpacked.

1. **A real application form, filled, with the result toast visible.** The
   single most convincing image — it shows the product working on a page users
   recognise. Use a real posting.
2. **The options page with a completed profile.** Shows the scope of what it
   remembers.
3. **The toast reporting a skipped field.** Turns "it doesn't fill everything"
   into the deliberate feature it is.
4. **The multi-row work history section.** The thing competitors are criticised
   for getting wrong.
5. **DevTools Network tab, empty, while the extension runs.** Proof of the
   privacy claim rather than an assertion of it.

Blur or replace real personal details before uploading — the screenshots are
public.

---

## Before submitting

- [x] Privacy policy reachable at a public URL —
      https://github.com/Didwania19/application-extension/blob/master/PRIVACY.md
- [x] `version` bumped to `1.0.0`
- [x] Package built — `npm run package`, or `bash package.sh`, produces
      `fieldwork-1.0.0.zip` (564 KB) containing only `manifest.json`, `src/`
      and the three PNGs
- [x] Store name matches `manifest.json` exactly
- [ ] **Screenshots** — needs the extension loaded unpacked; redact personal
      details before uploading
- [ ] **Register a Chrome Web Store developer account** — one-off $5 fee
- [ ] Upload the zip, paste the copy above, submit for review
