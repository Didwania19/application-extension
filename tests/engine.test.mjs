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
  ];
  const factory = new Function(`${source}\nreturn {${exposed.join(",")}};`);
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

console.log(failures ? `\n${failures} FAILED` : `\nall checks passed`);
process.exit(failures ? 1 : 0);
