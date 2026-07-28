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
> host them (Greenhouse, Lever, Ashby, Workday, SmartRecruiters and similar).
> Each listed domain is an ATS that serves job application forms.

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

## Worth reconsidering before submitting

The manifest declares 20+ `host_permissions`. Because the extension only acts
when the toolbar icon is clicked, `activeTab` alone may already grant everything
`chrome.scripting.executeScript` needs at that moment — in which case the host
list could be dropped entirely.

That would be worth testing, for three reasons: a shorter permission list means
a faster and less sceptical review; the install prompt stops saying "read and
change your data on 20+ sites", which is the single biggest deterrent at the
install decision; and it makes the privacy claim structurally stronger rather
than merely accurate.

It needs real testing first — particularly on Workday and on same-origin iframes,
where `allFrames` injection is involved — because if `activeTab` turns out to be
insufficient the failure mode is silent.
