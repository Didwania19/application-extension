import * as pdfjsLib from "../vendor/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("src/vendor/pdfjs/pdf.worker.min.mjs");

// A PDF has no spaces — only glyphs at coordinates — so whether two runs are
// separated is a question about geometry. Appending a space after every run
// breaks any word whose styling splits it: a small-caps heading emits "H" and
// "ARSHITA" as separate runs, which naive joining turns into "H ARSHITA".
const SPACE_GAP_RATIO = 0.2; // of font size; a real space is roughly 0.25em

function separatorBetween(previous, next) {
  if (previous.hasEOL) return "\n";
  const fontSize = Math.abs(next.transform[0]) || Math.abs(previous.transform[0]) || 10;
  if (Math.abs(next.transform[5] - previous.transform[5]) > fontSize * 0.5) return "\n";
  if (!previous.width) return " "; // no geometry to judge by — keep them apart
  const gap = next.transform[4] - (previous.transform[4] + previous.width);
  return gap > fontSize * SPACE_GAP_RATIO ? " " : "";
}

export async function extractPdfText(arrayBuffer) {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    let previous = null;
    for (const item of content.items) {
      if (previous) text += separatorBetween(previous, item);
      text += item.str;
      previous = item;
    }
    text += "\n";
  }
  return text;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+\/?/i;
const URL_RE = /https?:\/\/[^\s,)]+/g;

function firstMatch(text, re) {
  const m = text.match(re);
  return m ? m[0].trim() : "";
}

function guessPortfolio(text) {
  const urls = text.match(URL_RE) || [];
  const other = urls.find((u) => !LINKEDIN_RE.test(u) && !GITHUB_RE.test(u));
  return other || "";
}

function normalizeUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Second line of defence for the small-caps split, for PDFs where the runs
// carry no width to measure. Only applied to an all-caps heading, and only to
// a lone letter glued onto a following all-caps word ("H ARSHITA" -> "HARSHITA"),
// so a name written with real initials ("J K Rowling") is left alone.
function repairSmallCapsHeading(line) {
  if (!/^[A-Z][A-Z\s.'-]*$/.test(line)) return line;
  return line.replace(/\b([A-Z]) (?=[A-Z]{2,}\b)/g, "$1");
}

function guessName(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const rawLine of lines.slice(0, 5)) {
    if (EMAIL_RE.test(rawLine) || PHONE_RE.test(rawLine)) continue;
    const line = repairSmallCapsHeading(rawLine);
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Z][a-zA-Z.'-]*$/.test(words[0])) {
      return line;
    }
  }
  return "";
}

// --- section splitting ---

const SECTION_HEADERS = {
  work: ["WORKHISTORY", "EXPERIENCE", "EMPLOYMENTHISTORY", "PROFESSIONALEXPERIENCE", "WORKEXPERIENCE"],
  education: ["EDUCATION"],
};

const ALL_HEADER_WORDS = new Set([
  "PROFESSIONALSUMMARY",
  "SUMMARY",
  "OBJECTIVE",
  "SKILLS",
  "TECHNICALSKILLS",
  "CERTIFICATIONS",
  "PROJECTS",
  "REFERENCES",
  "AWARDS",
  "PUBLICATIONS",
  "LANGUAGES",
  "INTERESTS",
  ...SECTION_HEADERS.work,
  ...SECTION_HEADERS.education,
]);

function normalizeHeader(line) {
  return line.replace(/\s+/g, "").toUpperCase();
}

function extractSection(lines, key) {
  const headers = SECTION_HEADERS[key];
  const startIdx = lines.findIndex((l) => headers.includes(normalizeHeader(l)));
  if (startIdx === -1) return [];
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (ALL_HEADER_WORDS.has(normalizeHeader(lines[i]))) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx);
}

// --- work history ---

const JOB_LINE_RE = /^(.+?),\s*(\d{1,2}\/\d{4})\s*[-–—]\s*(\d{1,2}\/\d{4}|current)\s*$/i;
const BULLET_RE = /^[•▪◦*-]\s+/;

function monthYearToISO(mmYYYY) {
  const [mm, yyyy] = mmYYYY.split("/");
  return `${yyyy}-${mm.padStart(2, "0")}-01`;
}

// Resumes list jobs as "Title, MM/YYYY - MM/YYYY" lines, sometimes several
// titles in a row (promotions) sharing the one company line that follows,
// then bullets describing the role(s) until the next job line.
function parseWorkHistory(lines) {
  const entries = [];
  let pendingTitles = [];
  let currentBlockEntries = [];
  let bullets = [];

  function flushBullets() {
    if (currentBlockEntries.length && bullets.length) {
      const summary = bullets.join("\n");
      for (const e of currentBlockEntries) e.summary = summary;
    }
    bullets = [];
    currentBlockEntries = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const jobMatch = line.match(JOB_LINE_RE);
    if (jobMatch) {
      flushBullets();
      pendingTitles.push({ title: jobMatch[1].trim(), start: jobMatch[2], end: jobMatch[3] });
      continue;
    }
    if (BULLET_RE.test(line)) {
      bullets.push(line.replace(BULLET_RE, "").trim());
      continue;
    }
    if (pendingTitles.length) {
      for (const t of pendingTitles) {
        const isCurrent = /current/i.test(t.end);
        const entry = {
          company: line,
          title: t.title,
          startDate: monthYearToISO(t.start),
          endDate: isCurrent ? "" : monthYearToISO(t.end),
          current: isCurrent,
          summary: "",
        };
        entries.push(entry);
        currentBlockEntries.push(entry);
      }
      pendingTitles = [];
    }
  }
  flushBullets();
  return entries;
}

function guessYearsExperience(text) {
  const m = text.match(/(\d+)(\+)?\s*years?\s+(?:of\s+)?experience/i);
  return m ? `${m[1]}${m[2] || ""}` : "";
}

// --- education ---

const EDU_LINE_RE = /^(.+?):\s*(.+?),\s*\d{1,2}\/(\d{4})\s*$/;

function parseEducation(lines) {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  const entries = [];
  for (let i = 0; i < clean.length; i++) {
    const m = clean[i].match(EDU_LINE_RE);
    if (!m) continue;
    entries.push({
      school: clean[i + 1] || "",
      degree: m[1].trim(),
      field: m[2].trim(),
      startYear: "",
      endYear: m[3],
      gpa: "",
    });
  }
  return entries;
}

// Best-effort regex extraction from resume text. Runs fully offline (no
// network calls) so it doesn't break the extension's local-only privacy claim.
export function parseResumeText(text) {
  const lines = text.split("\n");
  const fullName = guessName(text);
  const [firstName, ...rest] = fullName ? fullName.split(/\s+/) : [""];

  const experience = parseWorkHistory(extractSection(lines, "work"));
  const education = parseEducation(extractSection(lines, "education"));
  const currentJob = experience.find((e) => e.current) || experience[0];

  return {
    identity: {
      firstName: firstName || "",
      lastName: rest.join(" ") || "",
      email: firstMatch(text, EMAIL_RE),
      phone: firstMatch(text, PHONE_RE),
      linkedin: normalizeUrl(firstMatch(text, LINKEDIN_RE)),
      github: normalizeUrl(firstMatch(text, GITHUB_RE)),
      portfolio: normalizeUrl(guessPortfolio(text)),
    },
    work: {
      currentTitle: currentJob?.title || "",
      currentCompany: currentJob?.company || "",
      yearsExperience: guessYearsExperience(text),
    },
    experience,
    education,
  };
}
