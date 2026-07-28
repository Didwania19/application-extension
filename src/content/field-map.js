// Ordered label-matching rules: first regex that matches a field's label wins.
// `path` is a dotted path into the stored profile (see lib/storage.js), or
// `null` to mean "recognized, but intentionally not autofilled".
const FIELD_RULES = [
  // Broadened from the literal "country code": Workday splits this into
  // "Country Phone Code", which the tighter phrase missed — it then fell
  // through to the phone rule below and got the raw phone NUMBER typed into
  // a dial-code field.
  { re: /country.*code/, path: null },
  // A phone-number-shaped dropdown ("Mobile"/"Home"/"Work"), not the number
  // itself — the loose /phone/ rule below matched it and typed the stored
  // phone number into a field that expects a device-type selection.
  { re: /device type/, path: null },
  // Guard before both the pronouns rule and the name rules below: "How do you
  // pronounce your name?" asks for a phonetic guide, not the stored pronouns
  // or another copy of the name, and contains substrings that match each.
  { re: /pronounce/, path: null },
  { re: /prefer(red)?\s*first\s*name|^preferred name$/, path: "identity.preferredName" },
  { re: /prefer(red)?\s*last\s*name/, path: null },
  // Word-bounded: a loose /pronoun/ also matches inside "pronounce", so "How
  // do you pronounce your name?" (a phonetic-guide question, not a pronouns
  // question) got the stored pronouns typed into it.
  { re: /\bpronouns?\b/, path: "identity.pronouns" },
  { re: /first name/, path: "identity.firstName" },
  { re: /last name|surname|family name/, path: "identity.lastName" },
  // A bare "Name" (no "full"/"your"/"applicant" qualifier) is common enough on
  // its own to warrant a dedicated case. Anchored to the whole label so it
  // never swallows a qualified field like "Company Name" or "School Name" —
  // those normalize to "company name"/"school name", not "name".
  { re: /full name|your name|applicant name|^name$/, path: "identity.fullName" },
  // Guard before the email rule: some ATS forms render a long consent
  // question ("Would you like to receive communications via SMS and/or
  // WhatsApp...if you select no, we will only communicate via email...") as
  // a plain text input. That prose mentions "email" in passing, so the loose
  // /e-?mail/ rule below matched it and typed the stored email address into
  // an SMS/WhatsApp opt-in question.
  { re: /receive.*(sms|text messages?|whatsapp)/, path: null },
  { re: /e-?mail/, path: "identity.email" },
  { re: /phone|mobile|cell/, path: "identity.phone" },
  { re: /linkedin/, path: "identity.linkedin" },
  { re: /github/, path: "identity.github" },
  // Guard before the portfolio rule: a "Portfolio Password" is a credential,
  // not a link, and must never receive the portfolio URL.
  { re: /password|passcode/, path: null },
  // A bare "Website"/"Other Website" (no "portfolio"/"personal" qualifier) is
  // just as common across ATS forms — anchored so it doesn't swallow an
  // unrelated qualified field (a company website question, say).
  { re: /portfolio|personal website|^website$|^other website$/, path: "identity.portfolio" },
  { re: /street address|address line ?1|^address$/, path: "location.addressLine1" },
  { re: /\bcity\b/, path: "location.city" },
  { re: /\bstate\b|province/, path: "location.state" },
  { re: /zip|postal/, path: "location.postalCode" },
  // Citizenship must be matched before the country rule, and kept distinct from
  // it: export-licensing questions ask which country you are a citizen of,
  // which is frequently not the country you currently live in.
  { re: /country of citizenship|citizenship country|country of legal permanent residence|export licensing/, path: "authorization.citizenshipCountry" },
  // Deliberately narrow. A loose /country/ also matched the prose of
  // "…provide your country of citizenship…" and answered it with the
  // residence country, so this only matches fields actually labelled as the
  // country you live in.
  // Also catches the common paraphrases ATS forms use for the same question —
  // "What country are you based in?", "From where do you intend to work?",
  // "What region do you reside in?" — none of which contain the literal
  // "country of residence"/"mailing country" the narrower patterns above rely on.
  { re: /^country$|^country\/region$|^country or region$|country of residence|mailing country|country.*are you based|where.*you intend to work|region.*you reside|country.*do you reside/, path: "location.country" },
  { re: /relocat/, path: "location.willingToRelocate" },
  { re: /current (job )?title|job title\b/, path: "work.currentTitle" },
  { re: /current (employer|company)|company name/, path: "work.currentCompany" },
  { re: /responsibilit(y|ies)|description of duties|key duties/, path: "experience[].summary" },
  { re: /years? of experience|years? experience/, path: "work.yearsExperience" },
  { re: /desired salary|salary expect|expected salary|compensation expect/, path: "work.desiredSalary" },
  // Education/experience rows split their dates into month + year sub-fields.
  // Those belong to a specific row, so the row-aware pass fills them; matching
  // them here would put a job's "when can you start?" date into a school date.
  { re: /(start|end) date (month|year)|graduation (month|year)/, path: null },
  // Single-row education forms, matched by label. Indexed paths resolve through
  // the normal dotted-path lookup ("0" indexes the array), so the most recent
  // degree is used. Forms that repeat education rows are handled by the
  // row-aware pass instead, which claims its fields before these rules apply.
  { re: /^institution|school name|^school$|university|college/, path: "education.0.school" },
  { re: /^degree|degree earned|degree type/, path: "education.0.degree" },
  { re: /^major|field of study|discipline|course of study/, path: "education.0.field" },
  // Same idea for a single experience row. A bare "Company"/"Title" belongs to
  // the row being filled; the "current employer"/"current title" rules above
  // stay for standalone fields that ask outside of a row.
  { re: /^company$|^employer$|^organization$/, path: "experience.0.company" },
  { re: /^title$|^position$|^role$|^job title$/, path: "experience.0.title" },
  { re: /^description$|^summary$|role description|job description/, path: "experience.0.summary" },
  // Workday-style "I currently work here" — a row-scoped boolean, same as
  // the company/title fields above.
  { re: /currently work (here|there)|i (currently|still) work here/, path: "experience.0.current" },
  // The job's own location, not the candidate's — never answer it from the
  // profile's city, which would state where the applicant lives instead.
  { re: /office location|job location/, path: null },
  { re: /^start date$|available to start|earliest.*start|when can you start/, path: "work.earliestStartDate" },
  { re: /notice period/, path: "work.noticePeriod" },
  // "will you in the future" alone missed the common "will you now or in the
  // future require [Company] to file a petition…" phrasing — that "now or"
  // in the middle broke the literal match even though it's the identical
  // question.
  { re: /sponsorship.*future|future.*sponsorship|will you (now or )?in the future/, path: "authorization.requiresSponsorshipFuture" },
  { re: /sponsorship/, path: "authorization.requiresSponsorshipNow" },
  // "legal authorization to work" is a paraphrase of "authorized to work" /
  // "legally authorized" that forms use just as often and matched neither.
  { re: /authorized to work|legally (authorized|eligible)|legal authorization to work/, path: "authorization.authorizedToWork" },
  { re: /^gender$|gender identity/, path: "eeo.gender" },
  // Must precede the race rule: forms word this as "Hispanic/Latino?" on its
  // own, but also as "Ethnicity: are you Hispanic or Latino?", which would
  // otherwise be swallowed by /ethnicity/ and answered with the race value.
  // Race checklists spell their options "White (Not Hispanic or Latino)" —
  // those are race answers, not the Hispanic/Latino question, and must not be
  // driven by the ethnicity answer.
  { re: /\(not hispanic or latino\)|not hispanic or latino$/, path: null },
  { re: /hispanic|latino/, path: "eeo.hispanicLatino" },
  { re: /race|ethnicity/, path: "eeo.race" },
  { re: /veteran/, path: "eeo.veteranStatus" },
  { re: /disability/, path: "eeo.disabilityStatus" },
];

function normText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[*:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFieldPath(labelText) {
  const t = normText(labelText);
  if (!t) return undefined;
  for (const rule of FIELD_RULES) {
    if (rule.re.test(t)) return rule.path;
  }
  return undefined;
}
