// Ordered label-matching rules: first regex that matches a field's label wins.
// `path` is a dotted path into the stored profile (see lib/storage.js), or
// `null` to mean "recognized, but intentionally not autofilled".
const FIELD_RULES = [
  { re: /country code/, path: null },
  { re: /prefer(red)?\s*first\s*name|^preferred name$/, path: "identity.preferredName" },
  { re: /prefer(red)?\s*last\s*name/, path: null },
  { re: /pronoun/, path: "identity.pronouns" },
  { re: /first name/, path: "identity.firstName" },
  { re: /last name|surname|family name/, path: "identity.lastName" },
  { re: /full name|your name|applicant name/, path: "identity.fullName" },
  { re: /e-?mail/, path: "identity.email" },
  { re: /phone|mobile|cell/, path: "identity.phone" },
  { re: /linkedin/, path: "identity.linkedin" },
  { re: /github/, path: "identity.github" },
  // Guard before the portfolio rule: a "Portfolio Password" is a credential,
  // not a link, and must never receive the portfolio URL.
  { re: /password|passcode/, path: null },
  { re: /portfolio|personal website/, path: "identity.portfolio" },
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
  { re: /^country$|^country\/region$|^country or region$|country of residence|mailing country/, path: "location.country" },
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
  { re: /^description$|^summary$/, path: "experience.0.summary" },
  // The job's own location, not the candidate's — never answer it from the
  // profile's city, which would state where the applicant lives instead.
  { re: /office location|job location/, path: null },
  { re: /^start date$|available to start|earliest.*start|when can you start/, path: "work.earliestStartDate" },
  { re: /notice period/, path: "work.noticePeriod" },
  { re: /sponsorship.*future|future.*sponsorship|will you in the future/, path: "authorization.requiresSponsorshipFuture" },
  { re: /sponsorship/, path: "authorization.requiresSponsorshipNow" },
  { re: /authorized to work|legally (authorized|eligible)/, path: "authorization.authorizedToWork" },
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
