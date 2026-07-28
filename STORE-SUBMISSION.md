# Chrome Web Store submission notes

Working answers for the fields the submission form asks for. Getting the data
disclosures wrong is a common rejection cause, so these are written to match what
the code actually does — verified against source, not aspiration.

## Single purpose

> Fieldwork fills job application forms from a profile the user has saved on
> their own device. It does not submit applications.

Chrome requires an extension to do one thing. Autofill for job applications is
that one thing; the résumé parser and profile editor exist only to populate the
data used for filling.

## Permission justifications

**`storage`**
> Stores the user's profile (name, contact details, work history, and similar
> application answers) locally on their device, so it can be reused across
> applications. This is the only place the data is kept — nothing is uploaded.

**`activeTab`**
> Reads and fills the application form on the tab the user is viewing, and only
> in response to the user clicking the extension's toolbar icon.

**`scripting`**
> Injects the form-filling script into the page when the user clicks the toolbar
> icon. Nothing is injected until then.

**Host permissions**
> Recognises and fills application forms on the applicant-tracking systems that
> host them: Greenhouse, Lever, Ashby, SmartRecruiters, Workday, iCIMS and
> Workable. Each of the seven listed domains is an ATS that serves job
> application forms. `activeTab` alone is not sufficient, because these systems
> are frequently embedded as a cross-origin frame inside a company's own careers
> page, which `activeTab` does not reach.

**Remote code**
> None. All code is included in the package. The bundled PDF.js library is used
> locally to read a résumé the user uploads.

## Data usage disclosures

The form asks you to check which categories you collect. Based on what the
profile actually holds, check:

- **Personally identifiable information** — name, address, email, phone
- **Authentication information** — *no*
- **Financial and payment information** — *no*, unless the user fills in the
  optional desired-salary field, which is stored locally like everything else
- **Health information** — the voluntary disability-status field. Check it if in
  doubt; over-disclosing is safe, under-disclosing is a violation
- **Personal communications** — *no*
- **Location** — the user's typed home address, not device geolocation
- **Web history** — *no*
- **User activity** — *no*
- **Website content** — the extension reads form fields on the page in order to
  fill them

Then the three certifications, all of which are true here:

- ✅ Not being sold to third parties
- ✅ Not being used or transferred for purposes unrelated to the single purpose
- ✅ Not being used or transferred to determine creditworthiness or for lending

## Privacy policy URL

`PRIVACY.md` needs to be reachable at a public URL. Simplest option: enable
GitHub Pages on the repository, or link the file on GitHub directly.

**Before publishing:** replace the contact-email placeholder in `PRIVACY.md`.
Note that whatever address goes there becomes public — a forwarding alias may be
preferable to a personal inbox.

## Why the host list is 7 entries and not 24

The original manifest declared 24 host patterns, which produces an install
prompt reading "read and change your data on 24 sites" — the single biggest
deterrent at the moment someone decides whether to install.

**Could `activeTab` replace them entirely?** No. `activeTab` grants access to
the top-level frame's origin only; it does not extend to cross-origin frames.
Greenhouse [documents an iframe embed](https://support.greenhouse.io/hc/en-us/articles/46365908766875)
in which the job board and application form load from `boards.greenhouse.io`
*inside* a company's own careers page — a cross-origin frame that `activeTab`
cannot reach. Dropping host permissions would silently break every employer
using that supported embed, and silent breakage is the worst failure mode for a
tool people rely on while applying for work.

Checked directly on a live Greenhouse posting: all 37 form fields sit in the top
frame, and the only cross-origin frames are reCAPTCHA and googleapis, neither of
which contains form fields. So the top-level case is fine either way — it is the
embedded case that requires the host list.

**What was removed.** Eleven domains that had never been tested against a live
posting: Comeet, Oracle Cloud, BambooHR, JazzHR, Jobvite, Breezy, Teamtailor,
Pinpoint, Rippling and Dover. Claiming support for a platform nobody has run the
extension against is a worse outcome than not listing it — it produces a scarier
permission prompt in exchange for coverage that may not work.

The seven that remain are consolidated to wildcards (`https://*.greenhouse.io/*`
covers both `boards.` and `job-boards.`), and each is an ATS that has either
been verified live or, for iCIMS and Workable, has explicit handling in the
fill engine.
