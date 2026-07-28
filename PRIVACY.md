# Privacy Policy — Fieldwork

**Effective date:** 28 July 2026
**Applies to:** the Fieldwork browser extension ("the extension")

## The short version

Fieldwork stores your profile on your own computer and never sends it anywhere.
There is no account, no server, and no analytics. Nobody — including the
developer — can see what you enter.

## What the extension stores

Everything you type into the extension's Options page, which may include:

- **Identity** — name, preferred name, email address, phone number, pronouns,
  and links to LinkedIn, GitHub or a portfolio
- **Location** — street address, city, state, postal code, country
- **Work history** — employers, job titles, dates, descriptions
- **Education** — schools, degrees, fields of study, dates
- **Work authorization** — country of citizenship, whether you are authorized to
  work, whether you require visa sponsorship
- **Voluntary self-identification** — gender, ethnicity, veteran status and
  disability status, if and only if you choose to change them from their default
  of "Prefer not to say"
- **Documents** — a résumé and/or cover letter you upload, stored as text
- **Saved answers** — any reusable responses you write yourself

Some of this is sensitive personal information. That is precisely why the
extension is built the way it is.

## Where it is stored

In `chrome.storage.local`, which is a storage area on your own device belonging
to this extension.

This is deliberately **not** `chrome.storage.sync`. The sync storage area would
upload your data to Google's servers to mirror it across your signed-in
browsers. Fieldwork does not use it, so your profile does not leave the machine
you entered it on — and does not follow you to another computer.

## What is transmitted

Nothing.

The extension makes no network requests of its own. It contains no analytics, no
telemetry, no crash reporting, no advertising identifiers, and no third-party
SDKs. It does not contact the developer or any other service, at install time or
ever.

Two things that look like exceptions but are not:

- **Résumé parsing** happens entirely inside your browser using a copy of the
  PDF.js library bundled with the extension. Your résumé is never uploaded to a
  parsing service.
- **Exporting your profile** writes a JSON file directly to your computer's
  downloads folder. It is not sent through any server.

Naturally, when *you* choose to submit a job application, the employer's website
receives whatever is in that form. That is you submitting an application, not
the extension transmitting your data — and the extension never submits anything
on your behalf.

## Permissions, and why each one exists

| Permission | Why it is needed |
|---|---|
| `storage` | To save your profile on your device. This is the only place your data lives. |
| `activeTab` | To read and fill the form on the tab you are looking at, and only when you click the toolbar icon. |
| `scripting` | To run the form-filling code on that page. It is injected on click, not left running in the background. |
| Site access | To recognise application forms on job-application domains. |

The extension does nothing until you click its toolbar icon. It does not run in
the background, does not observe pages you visit, and has no access to your
browsing history, bookmarks, cookies, passwords or other tabs.

## Who your data is shared with

No one. There are no third parties, no service providers, no sub-processors, and
no data sales. There is no mechanism in the extension by which your data could
be shared, because there is no code in it that sends data anywhere.

## Keeping and deleting your data

Your profile stays on your device until you remove it. You can:

- Edit or clear any field from the extension's Options page at any time
- Export a copy as JSON from the Options page
- Delete everything by removing the extension — Chrome deletes an extension's
  local storage when it is uninstalled

Because the developer never receives your data, there is no account to close and
no deletion request to file. Uninstalling is complete deletion.

## Children

Fieldwork is intended for people old enough to be applying for work. It is not
directed at children under 13 and collects nothing from anyone, including them.

## Changes to this policy

If a future version of the extension changes how data is handled, this policy
will be updated and its effective date changed before that version is published.
Any change that would involve transmitting your data off your device would be a
fundamental change to what this extension is, and would be called out plainly in
the release notes rather than buried here.

## Contact

Questions about this policy or the extension: **didwaniaharshita19@gmail.com**

---

*Verifying these claims:* the extension is open source. The absence of network
calls can be confirmed by searching the source for `fetch`, `XMLHttpRequest`,
`WebSocket` and `sendBeacon` — outside the vendored PDF.js library, there are
none — or by watching the Network tab in DevTools while the extension runs.
