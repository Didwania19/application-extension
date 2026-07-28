// Tests the real source files, not a copy of them.
//
// A transcribed copy of the engine hid a bug for hours: the copy applied the
// row cursor to every field, the real code applied it only to text inputs, and
// the copy is what the tests exercised. So these load src/ directly and pull
// the functions out of it. Only the pure logic runs here — anything touching
// the DOM is verified in a browser.
//
// Run: node tests/engine.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// Evaluate the content scripts the way the browser does — concatenated, in
// injection order — and hand back the functions we want to assert on.
function loadEngine() {
  const source = [read("src/content/field-map.js"), read("src/content/fill-engine.js")].join("\n");
  const exposed = [
    "matchFieldPath",
    "optionMatches",
    "findMatchingOption",
    "resolveRowPath",
    "valueCandidates",
    "searchQueries",
    "yesNoText",
    "normText",
    "matchDateSubfield",
    "resolveDateSubfieldValue",
    "matchRowContextOverride",
    "isListboxButton",
    "getListboxButtonLabel",
    "listboxButtonHasAnswer",
  ];
  const factory = new Function(`${source}\nreturn {${exposed.join(",")}};`);
  return factory();
}

// background.js registers a chrome.action listener at the top level, which does
// not exist here, so only the pure URL-classification helpers are pulled out.
function loadBackground() {
  const source = read("src/background.js").replace(/^chrome\.action\.onClicked[\s\S]*$/m, "");
  const factory = new Function(`${source}\nreturn { isRestrictedUrl, isRestrictedPageError };`);
  return factory();
}

// resumeParser is an ES module that imports pdf.js, which needs a browser.
// Strip the module-level browser wiring and keep the parsing logic.
function loadResumeParser() {
  const source = read("src/lib/resumeParser.js")
    .replace(/^import .*$/gm, "")
    .replace(/^pdfjsLib\..*$/gm, "")
    .replace(/^export /gm, "");
  const factory = new Function(`${source}\nreturn { separatorBetween, parseResumeText, repairSmallCapsHeading };`);
  return factory();
}

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`FAIL  ${name}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

const engine = loadEngine();
const background = loadBackground();
const parser = loadResumeParser();

// --- label routing -------------------------------------------------------
// Each of these was a real mis-routing seen on a live posting.
check("citizenship question is not the residence country",
  engine.matchFieldPath("For the sole purpose of determining export licensing requirements, please provide your country of citizenship"),
  "authorization.citizenshipCountry");
check("plain country field still routes to residence", engine.matchFieldPath("Country"), "location.country");
check("a yes/no question mentioning citizenship stays unmatched",
  engine.matchFieldPath("Since obtaining your most recent citizenship, have you resided outside that country?"), undefined);
check("portfolio password is never the portfolio URL", engine.matchFieldPath("Portfolio Password"), null);
check("race option is not the ethnicity question", engine.matchFieldPath("White (Not Hispanic or Latino)"), null);
check("ethnicity question routes to its own field", engine.matchFieldPath("Are you Hispanic/Latino?"), "eeo.hispanicLatino");
check("job's office location is never the candidate's city", engine.matchFieldPath("Office location"), null);
check("education date sub-field is left to the row pass", engine.matchFieldPath("Start date month"), null);

// --- option matching -----------------------------------------------------
// Substring matching caused wrong answers on real applications; these lock in
// the whole-word behaviour that replaced it.
check("'Female' must not match the 'Male' option", engine.optionMatches("Male", "Female"), false);
check("'No' must not match 'Yes, I am Hispanic or Latino'", engine.optionMatches("Yes, I am Hispanic or Latino", "No"), false);
check("'No' matches the real no option", engine.optionMatches("No, I am not Hispanic or Latino", "No"), true);
check("decline option is not a bare 'No'", engine.optionMatches("No", "I do not want to answer"), false);
check("punctuation differences still match", engine.optionMatches("California State University - Fullerton", "California State University, Fullerton"), true);

const degrees = ["Associate's Degree", "Bachelor's Degree", "Master of Business Administration (M.B.A.)", "Master's Degree", "Other"];
check("Master of Science maps to Master's, not MBA",
  engine.findMatchingOption(degrees.map((text) => ({ textContent: text })), engine.valueCandidates("Master of Science")),
  { textContent: "Master's Degree" });
check("MBA still maps to MBA",
  engine.findMatchingOption(degrees.map((text) => ({ textContent: text })), engine.valueCandidates("MBA")),
  { textContent: "Master of Business Administration (M.B.A.)" });
const relocation = ["No", "No, but I'm open to a remote position", "Irvine, CA"].map((text) => ({ textContent: text }));
check("a 'Yes' with no counterpart matches nothing rather than falling back to No",
  engine.findMatchingOption(relocation, engine.valueCandidates("Yes")), undefined);

// --- row cursor ----------------------------------------------------------
// Repeated rows must advance through profile entries; filling every row from
// entry 0 is what made "add another" duplicate the first job.
const cursor = {};
const sequence = [
  "experience.0.title", "experience.0.company", "experience.0.summary",
  "experience.0.title", "experience.0.company", "experience.0.summary",
  "education.0.school", "education.0.degree",
  "education.0.school", "education.0.degree",
  "identity.email",
];
check("second row resolves to the second profile entry",
  sequence.map((p) => engine.resolveRowPath(p, cursor)),
  [
    "experience.0.title", "experience.0.company", "experience.0.summary",
    "experience.1.title", "experience.1.company", "experience.1.summary",
    "education.0.school", "education.0.degree",
    "education.1.school", "education.1.degree",
    "identity.email",
  ]);

// --- row-context override for ambiguous labels ----------------------------
// "Job Title" reads two ways: a flat "what's your current title" question, or
// the title field of one row in a repeated work-experience section (Workday's
// included). The label text is identical either way. Seen live: the flat
// rule for currentTitle matches "job title" as a bare word, so it caught
// Workday's row label before the row-scoped rule ever ran, and every row read
// the single flat work.currentTitle value — while Company (whose flat rule
// requires "company name", not just "company") fell through to its row rule
// and advanced correctly. That mismatch was reported as "add another"
// duplicating the job, when only the title half was actually stuck.
check("this is the trap: 'Job Title' alone matches the FLAT current-title rule",
  engine.matchFieldPath("Job Title"), "work.currentTitle");
check("row context overrides it back to the row-scoped path",
  engine.matchRowContextOverride({ id: "workExperience-24--jobTitle", name: "" }, "Job Title"),
  "experience.0.title");
check("a flat form with no row id keeps the old, correct behaviour",
  engine.matchRowContextOverride({ id: "jobTitle", name: "" }, "Job Title"), null);
check("bare Company also gets the override, for symmetry with Title",
  engine.matchRowContextOverride({ id: "workExperience-24--companyName", name: "" }, "Company"),
  "experience.0.company");

// --- Workday's listbox-button questions (distinct from react-select) -------
// Some Workday tenants render single-select questions as a native
// <button aria-haspopup="listbox">, not react-select's <input role="combobox">.
// collectFields only queried input/select/textarea, so these buttons were
// invisible to the engine — not mismatched, not found at all. Confirmed live
// on a real VF Corp posting: "Are you authorized to work in the United
// States?" as one of these buttons, clicking correctly opened it, selected
// "Yes", and the button's own text updated to "Yes" as the read-back.
const fakeListboxButton = { tagName: "BUTTON", getAttribute: (k) => (k === "aria-haspopup" ? "listbox" : null) };
check("a button with aria-haspopup=listbox is recognised", engine.isListboxButton(fakeListboxButton), true);
check("a plain input is not, even with the same aria attribute",
  engine.isListboxButton({ tagName: "INPUT", getAttribute: (k) => (k === "aria-haspopup" ? "listbox" : null) }), false);
check("a button with no aria-haspopup is not a listbox button",
  engine.isListboxButton({ tagName: "BUTTON", getAttribute: () => null }), false);

check("placeholder text means no answer yet", engine.listboxButtonHasAnswer({ innerText: "Select One" }), false);
check("a real selection counts as answered", engine.listboxButtonHasAnswer({ innerText: "Yes" }), true);
check("empty text is not an answer", engine.listboxButtonHasAnswer({ innerText: "" }), false);

{
  // End-to-end reproduction of the reported bug, run the same way the real
  // loop does: resolve the override first, fall back to matchFieldPath, then
  // resolveRowPath — for three rows in document order.
  const rows = [
    { id: "workExperience-5--jobTitle", label: "Job Title" }, { id: "workExperience-5--companyName", label: "Company" },
    { id: "workExperience-24--jobTitle", label: "Job Title" }, { id: "workExperience-24--companyName", label: "Company" },
    { id: "workExperience-45--jobTitle", label: "Job Title" }, { id: "workExperience-45--companyName", label: "Company" },
  ];
  const rowResolveCursor = {};
  const resolved = rows.map((f) => {
    const matched = engine.matchRowContextOverride({ id: f.id, name: "" }, f.label) || engine.matchFieldPath(f.label);
    return engine.resolveRowPath(matched, rowResolveCursor);
  });
  check("three Workday rows: title advances 0,1,2 exactly like company does, not stuck on row 0",
    resolved,
    ["experience.0.title", "experience.0.company", "experience.1.title", "experience.1.company", "experience.2.title", "experience.2.company"]);
}

// --- misc ----------------------------------------------------------------
check("booleans render as Yes/No, never 'true'", engine.yesNoText(true), "Yes");
// The full string finds no school server-side; the part before the comma does.
// Duplicate queries are dropped, so no wasted round trip.
check("search falls back to shorter queries, without repeating one",
  engine.searchQueries("California State University, Fullerton"),
  ["California State University, Fullerton", "California State University"]);
check("a value with no qualifier searches once", engine.searchQueries("Outreach"), ["Outreach"]);

// --- resume parsing ------------------------------------------------------
// Small-caps headings split into separate runs; joining them with a space
// produced the first name "H".
const run = (str, x, size, width) => ({ str, width, transform: [size, 0, 0, size, x, 740.1], hasEOL: false });
const nameRuns = [run("H", 226.9, 18, 13), run("ARSHITA", 240, 14.5, 62), run("D", 308.5, 18, 13), run("IDWANIA", 321.5, 14.5, 60)];
let joined = "";
for (let i = 0; i < nameRuns.length; i++) {
  if (i) joined += parser.separatorBetween(nameRuns[i - 1], nameRuns[i]);
  joined += nameRuns[i].str;
}
check("small-caps heading joins into one name", joined, "HARSHITA DIDWANIA");
check("repair leaves real initials alone", parser.repairSmallCapsHeading("J K Rowling"), "J K Rowling");
check("repair fixes a split all-caps heading", parser.repairSmallCapsHeading("H ARSHITA D IDWANIA"), "HARSHITA DIDWANIA");

// --- Workday-style date sub-fields ----------------------------------------
// Both halves of a date range can share the identical label "Month"/"Year";
// only the element's own id says which is which. Seen live on Workday.
check("bare 'Description' widened to catch 'Role Description'", engine.matchFieldPath("Role Description"), "experience.0.summary");
check("'I currently work here' is a row-scoped boolean", engine.matchFieldPath("I currently work here"), "experience.0.current");

const startMonthEl = { id: "workExperience-5--startDate-dateSectionMonth-input", name: "" };
const startYearEl = { id: "workExperience-5--startDate-dateSectionYear-input", name: "" };
const endMonthEl = { id: "workExperience-5--endDate-dateSectionMonth-input", name: "" };
check("start Month resolves against experience, not a guess",
  engine.matchDateSubfield(startMonthEl, "Month"), { section: "experience", role: "start", unit: "month" });
check("end Month is distinguished from start by id alone",
  engine.matchDateSubfield(endMonthEl, "Month"), { section: "experience", role: "end", unit: "month" });
check("a Month field with no start/end marker is left alone (e.g. a birthdate)",
  engine.matchDateSubfield({ id: "birthMonth", name: "" }, "Month"), null);
check("a field merely labelled 'Month' elsewhere is not touched", engine.matchDateSubfield({ id: "x", name: "" }, "Something else"), null);

const workdayProfile = { experience: [{ startDate: "2024-07-01", endDate: "", current: true }] };
check("start month reads the numeric month, not the zero-padded string",
  engine.resolveDateSubfieldValue({ section: "experience", role: "start", unit: "month" }, workdayProfile, {}), "7");
check("start year", engine.resolveDateSubfieldValue({ section: "experience", role: "start", unit: "year" }, workdayProfile, {}), "2024");
check("a still-current job has no end date to give, and must not send an empty string as if it were real data",
  engine.resolveDateSubfieldValue({ section: "experience", role: "end", unit: "month" }, workdayProfile, {}), "");

const eduProfile = { education: [{ startYear: "", endYear: "2020" }] };
check("education year comes from the stored graduation year", engine.resolveDateSubfieldValue({ section: "education", role: "end", unit: "year" }, eduProfile, {}), "2020");
check("education has no month granularity at all, so a month sub-field gets nothing rather than a wrong guess",
  engine.resolveDateSubfieldValue({ section: "education", role: "end", unit: "month" }, eduProfile, {}), "");

// The date sub-field's row must track the SAME cursor as the row's own
// company/title — otherwise a second row's dates could read the first row's
// entry even though its own identifying fields advanced correctly.
const sharedCursor = {};
engine.resolveRowPath("experience.0.title", sharedCursor); // row 1 seen
engine.resolveRowPath("experience.0.title", sharedCursor); // row 2 starts
const rowTwoProfile = { experience: [{ startDate: "2020-01-01" }, { startDate: "2021-06-01" }] };
check("a second row's date sub-field follows the same cursor as its own company/title",
  engine.resolveDateSubfieldValue({ section: "experience", role: "start", unit: "year" }, rowTwoProfile, sharedCursor), "2021");

// --- gaps found sweeping real postings (Anthropic, Standard Bank, Mattel,
// Figma, Discord, BambooHR, Webflow) -----------------------------------------
check("bare 'Name' maps to the full name", engine.matchFieldPath("Name"), "identity.fullName");
check("'School Name' is untouched by the bare Name rule", engine.matchFieldPath("School Name"), "education.0.school");
check("'Company Name' is untouched by the bare Name rule", engine.matchFieldPath("Company Name"), "work.currentCompany");
check("bare 'Website' maps to the portfolio URL", engine.matchFieldPath("Website"), "identity.portfolio");
check("'Other Website' also maps to the portfolio URL", engine.matchFieldPath("Other Website"), "identity.portfolio");
check("'What country are you based in?' routes to residence country",
  engine.matchFieldPath("What country are you based in?"), "location.country");
check("'From where do you intend to work?' routes to residence country",
  engine.matchFieldPath("From where do you intend to work?"), "location.country");
check("'What region do you reside in?' routes to residence country",
  engine.matchFieldPath("What region do you reside in?"), "location.country");
check("citizenship question still stays distinct from these residence paraphrases",
  engine.matchFieldPath("For the sole purpose of determining export licensing requirements, please provide your country of citizenship"),
  "authorization.citizenshipCountry");
check("'now or in the future' phrasing still routes to sponsorship-future",
  engine.matchFieldPath("Will you now or in the future require BambooHR to file a petition for you in order to obtain or maintain your ability to work in the US?"),
  "authorization.requiresSponsorshipFuture");
check("the original 'will you in the future' phrasing still matches",
  engine.matchFieldPath("Will you in the future require sponsorship for employment visa status?"),
  "authorization.requiresSponsorshipFuture");
check("'legal authorization to work' paraphrase routes to work authorization",
  engine.matchFieldPath("Do you currently have legal authorization to work in the country in which this job is located?"),
  "authorization.authorizedToWork");
check("the original 'authorized to work' phrasing still matches",
  engine.matchFieldPath("Are you authorized to work in the United States?"),
  "authorization.authorizedToWork");
check("'How do you pronounce your name?' is not caught by the pronoun rule or the name rule",
  engine.matchFieldPath("How do you pronounce your name? (e.g., 'An-na' or 'Ah-na')"), null);
check("a real pronouns question still matches", engine.matchFieldPath("Pronouns"), "identity.pronouns");

// --- gaps found sweeping a second round of real postings (Duolingo, Reddit,
// Shield AI, Blue Origin/Workday) -----------------------------------------
check("'Country Phone Code' is recognized but not autofilled with the phone number",
  engine.matchFieldPath("Country Phone Code"), null);
check("plain 'Country Code' still matches the same guard", engine.matchFieldPath("Country Code"), null);
check("'Phone Device Type' is recognized but not autofilled with the phone number",
  engine.matchFieldPath("Phone Device Type"), null);
check("the phone number field itself still matches", engine.matchFieldPath("Phone Number"), "identity.phone");
check("SMS/WhatsApp consent question is not caught by the loose email rule",
  engine.matchFieldPath("Would you like to receive communications via SMS and/or WhatsApp to the number provided about your application process? If you select no, we will only communicate with you via email and/or telephone calls."),
  null);
check("a real email field still matches", engine.matchFieldPath("Email Address"), "identity.email");


// --- restricted pages -----------------------------------------------------
// The toolbar icon is visible on every page, so clicking it on a chrome:// tab
// is an ordinary thing to do. Chrome refuses the injection with "Cannot access
// a chrome:// URL", which was landing in chrome://extensions under Errors and
// reading as a fault in the extension rather than an unsupported page.
check("a chrome:// page is recognised as restricted", background.isRestrictedUrl("chrome://extensions"), true);
check("the new tab page is restricted", background.isRestrictedUrl("chrome://newtab/"), true);
check("another extension's page is restricted", background.isRestrictedUrl("chrome-extension://abc/options.html"), true);
check("devtools is restricted", background.isRestrictedUrl("devtools://devtools/bundled/inspector.html"), true);
check("view-source is restricted", background.isRestrictedUrl("view-source:https://example.com"), true);
check("the Chrome Web Store is restricted despite being https", background.isRestrictedUrl("https://chromewebstore.google.com/search/autofill"), true);
check("the legacy Web Store host is restricted", background.isRestrictedUrl("https://chrome.google.com/webstore/category/extensions"), true);
check("a real job posting is not restricted", background.isRestrictedUrl("https://job-boards.greenhouse.io/anthropic/jobs/4020350008"), false);
check("a non-webstore path on chrome.google.com is not restricted", background.isRestrictedUrl("https://chrome.google.com/"), false);
// tab.url is only populated when the extension has access to the tab, which a
// restricted page withholds — so an unknown URL must fall through to the
// injection attempt rather than being pre-emptively refused.
check("an unknown URL is not pre-emptively treated as restricted", background.isRestrictedUrl(undefined), false);
check("a malformed URL is not treated as restricted", background.isRestrictedUrl("not a url"), false);

check("Chrome's chrome:// refusal is classified as a restricted page, not a fault",
  background.isRestrictedPageError(new Error("Cannot access a chrome:// URL")), true);
check("the Web Store refusal is classified the same way",
  background.isRestrictedPageError(new Error("Cannot access contents of the page. Extension manifest must request permission to access the extension gallery.")), true);
check("a genuine failure is still reported as a fault",
  background.isRestrictedPageError(new Error("Frame with ID 0 was removed")), false);

console.log(failures ? `\n${failures} FAILED` : `\nall checks passed`);
process.exit(failures ? 1 : 0);
