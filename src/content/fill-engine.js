// Best-effort form filler: matches visible inputs/selects/radios to profile
// fields by label text (not by id/name, which vary per ATS tenant), then
// sets values the same way a user typing would, so framework-bound forms
// (React/Vue) pick up the change. Never touches file inputs — browsers don't
// allow scripts to populate those, so resume/cover-letter upload stays manual.

function getPathValue(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

// Web-component forms (SmartRecruiters' oneclick UI, for one) keep their real
// inputs inside shadow roots. A plain document query returns nothing at all
// there, so ids, labels and listboxes must be resolved against the element's
// own root rather than the document.
function rootOf(el) {
  const root = el.getRootNode();
  return root && typeof root.querySelector === "function" ? root : document;
}

// Collects fields across the document and every open shadow root, in document
// order per root. Closed shadow roots stay invisible to any extension.
// Workday renders some single-select questions as a native
// <button aria-haspopup="listbox">, not react-select's <input role="combobox">
// — a plain input/select/textarea query misses these entirely, which is why
// they looked completely unfillable rather than mismatched.
function collectFields(root, out = [], depth = 0) {
  if (depth > 12) return out;
  out.push(...root.querySelectorAll('input, select, textarea, button[aria-haspopup="listbox"]'));
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) collectFields(el.shadowRoot, out, depth + 1);
  }
  return out;
}

function deepQueryAll(selector, root = document, out = [], depth = 0) {
  if (depth > 12) return out;
  try {
    out.push(...root.querySelectorAll(selector));
  } catch (e) {
    return out; // malformed selector — nothing to collect
  }
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) deepQueryAll(selector, el.shadowRoot, out, depth + 1);
  }
  return out;
}

// An option's visible label is not always its textContent. Component libraries
// render the option shell in a shadow root and project the text in through a
// <slot>, and slotted text belongs to the light DOM, so textContent reads as
// empty. Checking the slot's assigned nodes recovers it.
function optionLabel(el) {
  const direct = (el.textContent || "").trim();
  if (direct) return direct;
  const slotted = [...el.querySelectorAll("slot")]
    .flatMap((slot) => slot.assignedNodes({ flatten: true }).map((n) => n.textContent || ""))
    .join(" ")
    .trim();
  if (slotted) return slotted;
  if (el.shadowRoot) {
    const inner = (el.shadowRoot.textContent || "").trim();
    if (inner) return inner;
  }
  return el.getAttribute("aria-label") || "";
}

function humanizeName(name) {
  return normText((name || "").replace(/([a-z])([A-Z])/g, "$1 $2"));
}

function getLabelText(doc, el) {
  const root = rootOf(el);
  if (el.id) {
    try {
      const lab = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab && lab.innerText.trim()) return lab.innerText;
    } catch (e) {
      // invalid id for a CSS selector — ignore and fall through
    }
  }
  const wrappingLabel = el.closest("label");
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true);
    clone.querySelectorAll("input, select, textarea").forEach((n) => n.remove());
    if (clone.innerText.trim()) return clone.innerText;
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => root.getElementById?.(id)?.innerText || "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  if (el.placeholder) return el.placeholder;
  let node = el.parentElement;
  for (let hops = 0; hops < 4 && node; hops++) {
    const prev = node.previousElementSibling;
    if (prev && prev.innerText && prev.innerText.trim().length < 80) return prev.innerText;
    node = node.parentElement;
  }
  return humanizeName(el.name || el.id || "");
}

function getRadioGroupLabel(doc, radio) {
  const fieldset = radio.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    if (legend && legend.innerText.trim()) return legend.innerText;
  }
  let node = (radio.closest("label") || radio).parentElement;
  for (let hops = 0; hops < 5 && node; hops++) {
    const cand = node.querySelector(":scope > label, :scope > legend, :scope > p, :scope > span, :scope > div > label");
    if (cand && cand.innerText.trim() && !cand.contains(radio)) return cand.innerText;
    node = node.parentElement;
  }
  return "";
}

function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
}

function fireEvents(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function selectOption(el, value) {
  if (!normText(String(value))) return false;
  const candidates = valueCandidates(value);
  for (const opt of el.options) {
    if (candidates.some((c) => optionMatches(opt.text, c) || optionMatches(opt.value, c))) {
      el.value = opt.value;
      fireEvents(el);
      return true;
    }
  }
  return false;
}

function yesNoText(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

// The same intent is worded differently per ATS, so a single stored answer has
// to be matched against each form's phrasing. Only used to find an existing
// option to click — never to invent an answer the user didn't choose.
const VALUE_SYNONYMS = {
  "prefer not to say": ["decline to self identify", "i don't wish to answer", "i do not wish to answer", "i do not want to answer", "prefer not to disclose", "decline to answer", "do not wish to disclose"],
};

// Resumes name a specific degree; ATS dropdowns usually offer only the generic
// tier ("Master's Degree"). Mapped by the degree's leading words so "Master of
// Science" and "MS" both reach the same option. MBA is listed separately by
// most forms, so it stays distinct rather than collapsing into Master's.
const DEGREE_TIERS = [
  { re: /\bm\.?b\.?a\b|master of business/i, options: ["Master of Business Administration (M.B.A.)", "MBA", "Master's Degree"] },
  { re: /\bph\.?d\b|doctor of philosophy|doctorate/i, options: ["Doctor of Philosophy (Ph.D.)", "Doctorate", "PhD"] },
  { re: /\bj\.?d\b|juris doctor/i, options: ["Juris Doctor (J.D.)", "Law Degree"] },
  { re: /\bm\.?d\b|doctor of medicine/i, options: ["Doctor of Medicine (M.D.)"] },
  // Never list a bare "Master"/"Bachelor" here: as a substring it also matches
  // "Master of Business Administration (M.B.A.)", which would claim a degree
  // the candidate does not hold.
  { re: /\bmaster\b|\bm\.?s\.?c?\b|\bm\.?a\b|\bm\.?eng\b/i, options: ["Master's Degree", "Masters Degree"] },
  { re: /\bbachelor\b|\bb\.?s\b|\bb\.?a\b|\bb\.?e\b|\bb\.?tech\b/i, options: ["Bachelor's Degree", "Bachelors Degree"] },
  { re: /\bassociate\b|\ba\.?a\b|\ba\.?s\b/i, options: ["Associate's Degree", "Associates Degree"] },
  { re: /high school|diploma|\bg\.?e\.?d\b/i, options: ["High School", "High School or equivalent"] },
];

function degreeTierOptions(value) {
  const tier = DEGREE_TIERS.find((t) => t.re.test(String(value)));
  return tier ? tier.options : [];
}

function valueCandidates(value) {
  const extra = VALUE_SYNONYMS[normText(String(value))] || [];
  return [value, ...extra, ...degreeTierOptions(value)];
}


function valueTokens(s) {
  // "+" kept so a dial code like "+1" survives as its own token.
  return normText(s).split(/[^a-z0-9+]+/).filter(Boolean);
}

function containsTokenRun(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

// Substring matching is unsafe for short answers: "Latino" contains "no", so a
// stored "No" would match the option "Yes, I am Hispanic or Latino", and "not"
// inside "I do not want to answer" would match "No". Whenever either side is
// short, require it to appear as a whole word.
// Compares by whole words rather than by raw substring. Substring matching is
// actively unsafe for answer values: "female" contains "male", so a stored
// "Female" would select the "Male" option; "Latino" contains "no", so "No"
// would select "Yes, I am Hispanic or Latino". Requiring a run of complete
// words rules those out, and it makes punctuation differences irrelevant, so
// "California State University, Fullerton" still matches the same school
// written "California State University - Fullerton".
function optionMatches(optionText, candidate) {
  const option = valueTokens(optionText);
  const wanted = valueTokens(candidate);
  if (!option.length || !wanted.length) return false;
  return containsTokenRun(option, wanted) || containsTokenRun(wanted, option);
}

// Candidate order is priority order: scan all options for the first candidate
// before moving to the looser ones. Scanning options first instead would let
// DOM order decide, so a loose synonym could win over an exact match that sits
// further down the list.
function findMatchingOption(options, candidates) {
  for (const candidate of candidates) {
    const hit = options.find((o) => optionMatches(optionLabel(o), candidate));
    if (hit) return hit;
  }
  return undefined;
}

function fillYesNoRadioGroup(radios, rawValue) {
  const value = yesNoText(rawValue);
  const wantYes = /^y(es)?$/i.test(value);
  const wantNo = /^n(o)?$/i.test(value);
  if (!wantYes && !wantNo) return false;
  for (const r of radios) {
    const label = normText(getLabelText(r.ownerDocument, r));
    const val = normText(r.value);
    const isYes = /^yes\b/.test(label) || val === "yes" || val === "1" || val === "true";
    const isNo = /^no\b/.test(label) || val === "no" || val === "0" || val === "false";
    if ((wantYes && isYes) || (wantNo && isNo)) {
      r.checked = true;
      fireEvents(r);
      return true;
    }
  }
  return false;
}

// "password" is here on purpose: a form may put a password next to fields we do
// recognise (Ashby asks for a "Portfolio Password" beside the portfolio link),
// and nothing in a stored profile is ever the right thing to type into one.
const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "button", "file", "image", "reset", "password"]);

// react-select and similar ARIA comboboxes (Greenhouse's dropdowns, custom
// Yes/No questions, country pickers) don't carry their value on the visible
// input at all — the real state lives in the framework, and the rendered
// "selected" text is a sibling element. Setting .value directly is silently
// ignored or leaves the widget visually blank. The only reliable way in is
// the same path a real user takes: open the listbox, click the option.
function isComboboxInput(el) {
  return el.tagName === "INPUT" && el.getAttribute("role") === "combobox";
}

// Workday's <button aria-haspopup="listbox"> pattern. Distinct from
// isComboboxInput above — same idea (open a listbox, click an option), but a
// real button rather than react-select's text input, and its own visible
// text is the selected value rather than a separate node.
function isListboxButton(el) {
  return el.tagName === "BUTTON" && el.getAttribute("aria-haspopup") === "listbox";
}

// The button's own aria-label is often just boilerplate ("Select One
// Required"), not the question — that lives in the enclosing fieldset's
// <legend>, the same place a plain radio group's label lives (see
// getRadioGroupLabel). Checked first so the boilerplate never wins.
function getListboxButtonLabel(doc, btn) {
  const fieldset = btn.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    if (legend && legend.innerText.trim()) return legend.innerText;
  }
  return getLabelText(doc, btn);
}

const LISTBOX_PLACEHOLDER_RE = /^select one$|^select\.\.\.$|^please select$|^choose one$/i;

function listboxButtonHasAnswer(btn) {
  const text = btn.innerText.trim();
  return Boolean(text) && !LISTBOX_PLACEHOLDER_RE.test(text);
}

// There is no hidden input or "single value" node to read back the way
// react-select needs (readComboboxSelection) — the button's own visible text
// carries the selection, so verification is just comparing that text against
// the value asked for. openCombobox/closeCombobox/getComboboxOptions and
// waitForMatchingOption are reused as-is: they work generically off
// aria-expanded/aria-controls and never assumed an <input> specifically.
async function fillListboxButton(doc, btn, rawValue) {
  const value = yesNoText(rawValue);
  const candidates = valueCandidates(value);
  openCombobox(btn);
  const { match } = await waitForMatchingOption(doc, btn, candidates, 400);
  if (!match) {
    closeCombobox(btn);
    return "no-match";
  }
  clickOption(match);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const landed = btn.innerText.trim();
  closeCombobox(btn);
  return candidates.some((c) => optionMatches(landed, c)) ? "filled" : "not-applied";
}

// Combobox widgets render extra bare inputs alongside the real one (react-select
// adds an unlabelled dummy input). Those have no label of their own, so the
// ancestor label-walk in getLabelText attributes the whole question to them and
// we type the raw value in as literal text — which is how "true" ended up
// visible in a Yes/No dropdown. Anything sharing a widget with a combobox but
// not being that combobox is not ours to touch.
function hasOwnLabel(doc, el) {
  if (el.id) {
    try {
      if (rootOf(el).querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
    } catch (e) {
      // unusable id as a selector — fall through to the other signals
    }
  }
  return Boolean(el.closest("label") || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"));
}

// The bare inputs a combobox widget adds internally have no label of their own,
// so getLabelText falls back to an ancestor walk, attributes the whole question
// to them, and we type the raw value in as literal text. Skip those. A field
// with a real label association is always a genuine field, even when it sits
// next to a combobox — a phone input beside a country-code picker, say — so
// checking for a label first keeps this from swallowing legitimate fields.
function isForeignWidgetInput(doc, el) {
  if (isComboboxInput(el)) return false;
  if (hasOwnLabel(doc, el)) return false;
  let node = el.parentElement;
  for (let hops = 0; hops < 2 && node; hops++) {
    if (node.querySelector('[role="combobox"]')) return true;
    node = node.parentElement;
  }
  // Workday's listbox-button (isListboxButton) pairs each question with an
  // invisible plain <input type="text"> in the same fieldset that stores the
  // chosen option's internal GUID. Not excluded by type — it is not
  // type="hidden" — so it must be excluded by proximity, the same as a
  // react-select combobox's own bare companion input above. Currently always
  // skipped anyway since it already holds a value once answered, but a blank
  // one would otherwise get a raw label like "Yes" typed into a field that
  // expects an internal id, not real user input.
  const fieldset = el.closest("fieldset");
  if (fieldset && fieldset.querySelector('button[aria-haspopup="listbox"]')) return true;
  return false;
}

function openCombobox(el) {
  el.focus();
  // Many comboboxes (react-select included) already open on focus; sending
  // a click on top of that toggles them straight back closed.
  if (el.getAttribute("aria-expanded") === "true") return;
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function closeCombobox(el) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  el.blur();
}

// Only ever returns options belonging to *this* combobox. A document-wide
// '[role="listbox"]' fallback is unsafe: when this widget's menu fails to open,
// it picks up whichever other menu happens to be open and we then click an
// option inside a different question — observed setting Country to Lebanon
// while filling an unrelated field, and reporting that field as failed.
function getComboboxOptions(doc, el) {
  const root = rootOf(el);
  const ownedId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
  let listbox = ownedId ? root.getElementById?.(ownedId) ?? null : null;
  if (!listbox && ownedId) {
    // The menu is often portalled into a different shadow root than the input
    // it belongs to, so fall back to searching every root — still by the id the
    // input itself points at, so this cannot pick up an unrelated widget's menu.
    listbox = deepQueryAll(`[id="${CSS.escape(ownedId)}"]`)[0] || null;
  }
  if (!listbox) {
    // no aria wiring — accept a listbox only from inside this widget's own markup
    let node = el.parentElement;
    for (let hops = 0; hops < 3 && node && !listbox; hops++) {
      listbox = node.querySelector('[role="listbox"]');
      node = node.parentElement;
    }
  }
  return listbox ? deepQueryAll('[role="option"]', listbox) : [];
}

// Mouse events alone are not enough: react-select (Greenhouse's dropdowns)
// tracks pointer events, so a mousedown/mouseup/click trio is ignored and the
// option never gets selected. Sending the full pointer sequence first makes
// the selection land on the exact option we picked.
// Server-filtered lists need time for the request to come back; measured at
// roughly 1s for Greenhouse's school search. Kept near that measurement rather
// than padded, because this wait is paid per search attempt per dropdown and a
// school lookup can take up to three attempts.
const TYPEAHEAD_TIMEOUT_MS = 900;

// Above this many options a list is assumed to be server-filtered or paged, so
// searching it can reveal entries that are not on screen yet.
const STATIC_LIST_MAX = 40;

// A server-side search often returns nothing for a full stored string:
// "California State University, Fullerton" finds no school, while
// "California State University" does. So try the whole value, then the part
// before a comma/dash qualifier, then just the leading words — the match is
// still verified against the option text, so a broad query cannot widen what
// gets selected, only what becomes visible to match against.
function searchQueries(value) {
  const full = String(value).trim();
  const queries = [full];
  const beforeQualifier = full.split(/\s*[,–—-]\s*/)[0].trim();
  if (beforeQualifier && beforeQualifier !== full) queries.push(beforeQualifier);
  const leadingWords = beforeQualifier.split(/\s+/).slice(0, 3).join(" ");
  if (leadingWords && !queries.includes(leadingWords)) queries.push(leadingWords);
  return queries;
}

// Polls for the wanted option rather than for "any options", because a stale
// list is usually still on screen right after typing — waiting only for a
// non-empty list would return the pre-search options and miss the match.
// Timeouts are kept tight where possible: an application form can carry 25
// dropdowns, and each wait is paid per dropdown.
async function waitForMatchingOption(doc, el, candidates, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const options = getComboboxOptions(doc, el);
    const match = findMatchingOption(options, candidates);
    if (match) return { match, options };
    if (Date.now() >= deadline) return { match: null, options };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function clickOption(opt) {
  const init = { bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, button: 0 };
  opt.dispatchEvent(new PointerEvent("pointerover", init));
  opt.dispatchEvent(new PointerEvent("pointerenter", init));
  opt.dispatchEvent(new PointerEvent("pointerdown", init));
  opt.dispatchEvent(new MouseEvent("mousedown", init));
  opt.dispatchEvent(new PointerEvent("pointerup", init));
  opt.dispatchEvent(new MouseEvent("mouseup", init));
  opt.dispatchEvent(new MouseEvent("click", init));
}

// Reads back what the widget renders as its current selection. The visible
// input's own .value is not it — libraries keep the real state internally and
// either mirror it into a hidden input (for form submission) or render it as
// a sibling "single value" node. Used to verify a click actually took, since
// a synthetic click that the framework ignores otherwise looks like success.
function readComboboxSelection(el) {
  let node = el.parentElement;
  for (let hops = 0; hops < 5 && node; hops++) {
    const hidden = node.querySelector('input[type="hidden"]');
    if (hidden && hidden.value) return hidden.value;
    const single = node.querySelector('[class*="singleValue"], [class*="single-value"]');
    if (single && single.textContent.trim()) return single.textContent;
    node = node.parentElement;
  }
  return "";
}

function valueMatchesSelection(wanted, selection) {
  return Boolean(selection) && optionMatches(selection, wanted);
}

function sameTokens(a, b) {
  const ta = valueTokens(a).join(" ");
  return Boolean(ta) && ta === valueTokens(b).join(" ");
}

// Frameworks may commit selection state asynchronously, so poll briefly rather
// than reading back once — a single synchronous read would report false
// failures on widgets that are actually working. Accepts a match against
// either the profile value or the chosen option's own text, because some
// widgets render a compact form of the option once selected (a country picker
// showing "+1" for "United States +1").
async function waitForSelection(el, candidates, timeoutMs = 150) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const selection = readComboboxSelection(el);
    if (candidates.some((c) => valueMatchesSelection(c, selection))) return selection;
    if (Date.now() >= deadline) return "";
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// Returns "filled" | "already-correct" | "already-answered" | "no-match" | "not-applied".
async function fillCombobox(doc, el, rawValue) {
  const value = yesNoText(rawValue);
  const candidates = valueCandidates(value);
  openCombobox(el);

  // Wait briefly for the menu to render, then look for our option.
  let { match, options } = await waitForMatchingOption(doc, el, candidates, 150);

  // Long lists (schools, cities) are filtered server-side, so the entry we want
  // is usually absent from the initial page of options — searching is the only
  // way to surface it. Typing must therefore be tried whenever nothing matched,
  // not merely when the list came back empty.
  // A short list is the whole list: it is rendered client-side, so if the value
  // is not in it, typing cannot conjure it and each search attempt is a wasted
  // round of waiting. Only long lists (schools, cities, countries) are worth
  // searching. This is the difference between a fast miss and ~3s per field.
  const isSearchableList = options.length === 0 || options.length > STATIC_LIST_MAX;

  let typedFallback = false;
  if (!match && isSearchableList) {
    for (const query of searchQueries(value)) {
      setNativeValue(el, query);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      typedFallback = true;
      ({ match, options } = await waitForMatchingOption(doc, el, candidates, TYPEAHEAD_TIMEOUT_MS));
      if (match) break;
    }
  }
  const alreadySelected = options.find((o) => o.getAttribute("aria-selected") === "true");

  function abort(outcome) {
    if (typedFallback) {
      setNativeValue(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    closeCombobox(el);
    return outcome;
  }

  if (alreadySelected && alreadySelected !== match) return abort("already-answered");
  if (alreadySelected && alreadySelected === match) return abort("already-correct");
  if (!match) return abort("no-match");

  // Deliberately click-only (see clickOption for the pointer-event detail).
  // Keyboard-driven selection (ArrowDown + Enter) was tried and rejected: on
  // react-select, synthetic ArrowDown does not move the focused option, but
  // Enter still commits whichever option the widget has focused internally —
  // the first one. On a question like "Are you open to relocation?" that
  // silently answers the wrong thing on a real application, which is worse
  // than leaving it blank. Clicking a specific option can only ever select
  // that option, so it under-fills rather than mis-answers.
  const chosenLabel = optionLabel(match);
  clickOption(match);
  if (await waitForSelection(el, [...valueCandidates(value), chosenLabel])) return "filled";
  // Some widgets show the chosen option in the input itself rather than in a
  // separate node. Require an exact match against the option we clicked: a
  // token-run check would accept our own leftover search text ("Irvine" inside
  // "Irvine, CA, US") and report a selection that never happened. An option may
  // render as several lines ("California State University, Fullerton" above a
  // "Fullerton, US" sub-line) while the input keeps only the first, so that
  // line counts as an exact match too.
  const primaryLine = chosenLabel.split("\n")[0].trim();
  if (sameTokens(el.value, chosenLabel) || sameTokens(el.value, primaryLine)) return "filled";
  return abort("not-applied");
}

// Per-job "Responsibilities" fields can't be matched to a single flat profile
// path — the data lives in profile.experience[i].summary. ATS forms almost
// always render a work-history entry's fields together in document order
// (employer, title, dates, responsibilities, [next entry...]), so scanning
// backward from the responsibilities field to the nearest employer/title
// values — stopping at the previous responsibilities field, which marks the
// start of the prior entry — recovers which job it belongs to without
// needing a clean DOM container to scope by.
function findExperienceSummary(doc, fields, currentIndex, profile) {
  let company = "";
  let title = "";
  for (let i = currentIndex - 1; i >= 0; i--) {
    const label = normText(getLabelText(doc, fields[i]));
    if (/responsibilit(y|ies)|description of duties|key duties/.test(label)) break;
    if (!fields[i].value) continue;
    if (!company && /employer|company name/.test(label)) company = fields[i].value;
    if (!title && /job title|title\b/.test(label)) title = fields[i].value;
    if (company && title) break;
  }
  if (!company && !title) return "";
  const nCompany = normText(company);
  const nTitle = normText(title);
  const match = profile.experience.find((e) => {
    const c = normText(e.company);
    const t = normText(e.title);
    return (nCompany && c && (c === nCompany || c.includes(nCompany) || nCompany.includes(c))) ||
      (nTitle && t && (t === nTitle || t.includes(nTitle) || nTitle.includes(t)));
  });
  return match ? match.summary : "";
}

// Education is a repeated group, and ATS forms index each row's fields
// (school--0, degree--1, …) while adding rows through an "Add another" button.
// The generic label matcher cannot express "the school of the second degree",
// so rows are filled here by index; the elements are then excluded from the
// generic pass, which would otherwise mis-map "Start date month" onto the
// unrelated "when can you start work?" field.
const EDUCATION_ROW_FIELDS = [
  { idPrefix: "school", key: "school" },
  { idPrefix: "degree", key: "degree" },
  { idPrefix: "discipline", key: "field" },
  { idPrefix: "start-month", key: "startMonth" },
  { idPrefix: "start-year", key: "startYear" },
  { idPrefix: "end-month", key: "endMonth" },
  { idPrefix: "end-year", key: "endYear" },
];

function educationRowExists(doc, index) {
  return Boolean(doc.getElementById(`school--${index}`));
}

// Only the "Add another" that belongs to the education group — a form may have
// one per repeated section (education, experience, links).
function findEducationAddButton(doc) {
  const buttons = [...doc.querySelectorAll("button, a")].filter((b) => /add another/i.test(b.innerText || ""));
  return buttons.find((b) => {
    let node = b.parentElement;
    for (let hops = 0; hops < 6 && node; hops++) {
      if (node.querySelector('[id^="school--"]')) return true;
      node = node.parentElement;
    }
    return false;
  });
}

async function addEducationRow(doc, index) {
  const button = findEducationAddButton(doc);
  if (!button) return false;
  clickOption(button);
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline && !educationRowExists(doc, index)) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return educationRowExists(doc, index);
}

// Education and experience sections are often collapsed behind an "Add" button,
// so the page has no fields to match against until a row is created.
// `identifyingPaths` deliberately lists only fields unique to a row, never
// description/summary: forms carry a standalone "Summary" box of their own, and
// counting that as an existing experience row meant the Add button was never
// pressed and Company/Title never appeared.
const ROW_SECTIONS = [
  {
    name: "education",
    identifyingPaths: ["education.0.school", "education.0.degree"],
    addPattern: /add (an? )?(education|school|degree)( entry)?/i,
    entriesOf: (p) => (p.education || []).filter((e) => e && (e.school || e.degree)),
  },
  {
    name: "experience",
    identifyingPaths: ["experience.0.company", "experience.0.title"],
    addPattern: /add (an? )?(experience|employment|work|job|position)( entry)?/i,
    entriesOf: (p) => (p.experience || []).filter((e) => e && (e.company || e.title)),
  },
];

function hasFieldForPaths(doc, paths) {
  return collectFields(doc).some((el) => paths.includes(matchFieldPath(getLabelText(doc, el))));
}

// Which fields mark the start of a new row. Only these advance the row cursor;
// a description or field-of-study repeating does not, since forms also carry
// standalone summary boxes outside any row.
const ROW_IDENTIFYING_KEYS = { education: ["school", "degree"], experience: ["company", "title"] };

function countRows(doc, section) {
  const identifying = ROW_IDENTIFYING_KEYS[section].map((k) => `${section}.0.${k}`);
  const perKey = new Map();
  for (const el of collectFields(doc)) {
    const path = matchFieldPath(getLabelText(doc, el));
    if (identifying.includes(path)) perKey.set(path, (perKey.get(path) || 0) + 1);
  }
  return perKey.size ? Math.max(...perKey.values()) : 0;
}

// Rules name a row path as `<section>.0.<key>`; the 0 is a placeholder. Walking
// the fields in document order, each repeat of an identifying key means a new
// row has started, so the profile entry advances with it. Without this every
// row on the page is filled from entry 0 — adding a second job row just
// duplicates the first.
function resolveRowPath(path, cursor) {
  const match = /^(education|experience)\.\d+\.(.+)$/.exec(path);
  if (!match) return path;
  const [, section, key] = match;
  const state = cursor[section] || (cursor[section] = { index: 0, seen: new Set() });
  if (ROW_IDENTIFYING_KEYS[section].includes(key)) {
    if (state.seen.has(key)) {
      state.index++;
      state.seen = new Set();
    }
    state.seen.add(key);
  }
  return `${section}.${state.index}.${key}`;
}

// Some ATS date-range widgets (Workday's included) give both halves of the
// range the identical accessible label "Month" or "Year" — the only thing
// that says which half a given input is is its own id or name. Only handled
// when that id/name explicitly says "start" or "end" and names the section
// ("experience"/"workExperience" or "education"), so an unrelated date field
// with no such marker — a birthdate, say — is left alone exactly as before.
function dateSubfieldRole(el) {
  const idish = `${el.id} ${el.name}`.toLowerCase();
  if (/start/.test(idish)) return "start";
  if (/end/.test(idish)) return "end";
  return null;
}

function dateSubfieldSection(el) {
  const idish = `${el.id} ${el.name}`.toLowerCase();
  if (/experience|employment/.test(idish)) return "experience";
  if (/education|school/.test(idish)) return "education";
  return null;
}

function matchDateSubfield(el, label) {
  const unit = normText(label);
  if (unit !== "month" && unit !== "year") return null;
  const role = dateSubfieldRole(el);
  const section = dateSubfieldSection(el);
  if (!role || !section) return null;
  return { section, role, unit };
}

// Reads which profile entry the row cursor is currently on without advancing
// it — "__date__" is never an identifying key for either section (see
// ROW_IDENTIFYING_KEYS), so this call cannot itself move the cursor forward.
// Safe to call any number of times for the month and year halves of the same
// row, and for both the start and end pair.
function currentRowIndex(section, rowCursor) {
  const probe = resolveRowPath(`${section}.0.__date__`, rowCursor);
  return Number(probe.split(".")[1]);
}

function resolveDateSubfieldValue(descriptor, profile, rowCursor) {
  const entry = (profile[descriptor.section] || [])[currentRowIndex(descriptor.section, rowCursor)];
  if (!entry) return "";
  if (descriptor.section === "education") {
    // Stored education dates are graduation years only, with no month.
    if (descriptor.unit !== "year") return "";
    return (descriptor.role === "start" ? entry.startYear : entry.endYear) || "";
  }
  if (entry.current && descriptor.role === "end") return ""; // still employed there
  const iso = descriptor.role === "start" ? entry.startDate : entry.endDate;
  if (!iso) return "";
  const [year, month] = iso.split("-");
  return descriptor.unit === "year" ? year : String(Number(month));
}

// "Job Title" and "Company" are genuinely ambiguous the same way Month/Year
// are: on a flat form they mean the single top-level work.currentTitle /
// work.currentCompany fields, but inside a repeated work-experience row
// (Workday's included) the identical label belongs to that specific entry.
// Without this, "Job Title" was caught by the earlier, flat currentTitle rule
// before the row-scoped rule ever ran — every row read the one flat field, so
// all rows showed the same title while Company (whose flat rule needs the
// word "name" and so does not also match the bare label) correctly advanced.
// That mismatch is what looked like "add another" duplicating the job.
function matchRowContextOverride(el, label) {
  const t = normText(label);
  const idish = `${el.id} ${el.name}`;
  if (!/workExperience|employment/i.test(idish)) return null;
  if (t === "job title" || t === "title") return "experience.0.title";
  if (t === "company" || t === "company name" || t === "employer") return "experience.0.company";
  return null;
}

function findAddEntryButton(pattern) {
  const candidates = deepQueryAll('button, a, [role="button"], spl-button');
  return candidates.find((b) => pattern.test(b.getAttribute("aria-label") || "") || pattern.test(optionLabel(b)));
}

// Only opens a row when there is data to put in it, and only when the section
// has no matching field yet — so re-running does not keep appending blank rows.
async function ensureRowSections(doc, profile) {
  for (const section of ROW_SECTIONS) {
    const entries = section.entriesOf(profile);
    if (!entries.length) continue;
    let rows = countRows(doc, section.name);
    // Open one row per profile entry. Bounded, and abandoned the moment a click
    // stops producing a new row, so a form whose button behaves unexpectedly
    // cannot be spammed with blank rows.
    for (let attempt = 0; rows < entries.length && attempt < 8; attempt++) {
      const button = findAddEntryButton(section.addPattern);
      if (!button) break;
      clickOption(button);
      const deadline = Date.now() + 1500;
      while (Date.now() < deadline && countRows(doc, section.name) === rows) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const grown = countRows(doc, section.name);
      if (grown === rows) break;
      rows = grown;
    }
  }
}

async function fillEducationRows(doc, profile) {
  const report = [];
  const handled = new Set();
  const entries = (profile.education || []).filter((e) => e && (e.school || e.degree));
  if (!entries.length) return { report, handled };
  // Forms that index their rows are filled here; the rest are left to the
  // generic label pass, which by now has fields to match against.
  if (!educationRowExists(doc, 0)) return { report, handled };

  let filledCount = 0;
  for (let i = 0; i < entries.length; i++) {
    if (!educationRowExists(doc, i) && !(await addEducationRow(doc, i))) {
      report.push({
        label: `Education entry ${i + 1} (${entries[i].school || entries[i].degree})`,
        path: `education[${i}]`,
        status: "failed",
        detail: "could not add another row — add it yourself, then re-run",
      });
      break;
    }
    for (const field of EDUCATION_ROW_FIELDS) {
      const el = doc.getElementById(`${field.idPrefix}--${i}`);
      if (!el) continue;
      handled.add(el); // claimed either way, so the generic pass leaves it alone
      const path = `education[${i}].${field.key}`;
      const label = `${getLabelText(doc, el)} (entry ${i + 1})`;
      const value = entries[i][field.key];
      if (value === undefined || value === null || value === "") {
        report.push({ label, path, status: "skipped", detail: "no data in profile" });
        continue;
      }
      if (el.value) {
        report.push({ label, path, status: "skipped", detail: `already has a value ("${el.value}")` });
        continue;
      }
      if (isComboboxInput(el)) {
        const outcome = await fillCombobox(doc, el, value);
        if (outcome === "filled") {
          filledCount++;
          report.push({ label, path, status: "filled", detail: value });
        } else if (outcome === "already-answered" || outcome === "already-correct") {
          report.push({ label, path, status: "skipped", detail: "already answered" });
        } else {
          report.push({ label, path, status: "failed", detail: `could not select "${value}"` });
        }
      } else {
        setNativeValue(el, String(value));
        fireEvents(el);
        filledCount++;
        report.push({ label, path, status: "filled", detail: value });
      }
    }
  }
  return { report, handled, filledCount };
}

async function fillDocument(doc, profile) {
  // Both run before the snapshot below, because they add fields to the page.
  await ensureRowSections(doc, profile);
  const education = await fillEducationRows(doc, profile);

  let filledCount = education.filledCount || 0;
  const seenRadioNames = new Set();
  const rowCursor = {};
  const fields = collectFields(doc);
  const report = [...education.report];

  function record(label, path, status, detail) {
    report.push({ label, path, status, detail: detail ?? "" });
  }

  for (let index = 0; index < fields.length; index++) {
    const el = fields[index];
    if (el.disabled) continue;
    if (education.handled.has(el)) continue; // owned by the education pass above

    if (isListboxButton(el)) {
      // Checked ahead of the SKIP_INPUT_TYPES filter below: a native button's
      // own .type is literally "button", which that filter exists to exclude.
      const label = getListboxButtonLabel(doc, el);
      const matchedPath = matchRowContextOverride(el, label) || matchFieldPath(label);
      if (!matchedPath) continue;
      // Resolved before the already-answered check, same reason as elsewhere:
      // the cursor still has to advance past a row the form already answered.
      const path = resolveRowPath(matchedPath, rowCursor);
      if (listboxButtonHasAnswer(el)) {
        record(label, path, "skipped", "already answered");
        continue;
      }
      const value = getPathValue(profile, path);
      if (!value) {
        record(label, path, "skipped", "no data in profile");
        continue;
      }
      const outcome = await fillListboxButton(doc, el, value);
      if (outcome === "filled") {
        filledCount++;
        record(label, path, "filled", value);
      } else if (outcome === "not-applied") {
        record(label, path, "failed", `page rejected the selection "${value}" — pick it by hand`);
      } else {
        record(label, path, "failed", `no dropdown option matched "${value}"`);
      }
      continue;
    }

    if (el.readOnly && !isComboboxInput(el)) continue; // comboboxes are click-only by design
    const type = (el.type || "").toLowerCase();
    if (SKIP_INPUT_TYPES.has(type)) continue;
    if (isForeignWidgetInput(doc, el)) continue;

    if (isComboboxInput(el)) {
      const label = getLabelText(doc, el);
      const matchedPath = matchRowContextOverride(el, label) || matchFieldPath(label);
      if (!matchedPath) continue;
      // Row-resolved here too, not only on plain inputs: a repeated row's
      // Company/Title are dropdowns on some forms, and skipping the cursor for
      // them refills every row from the first profile entry.
      const path = resolveRowPath(matchedPath, rowCursor);
      const value = getPathValue(profile, path);
      if (!value) {
        record(label, path, "skipped", "no data in profile");
        continue;
      }
      const outcome = await fillCombobox(doc, el, value);
      if (outcome === "filled") {
        filledCount++;
        record(label, path, "filled", value);
      } else if (outcome === "already-answered") {
        record(label, path, "skipped", "already answered (different option selected)");
      } else if (outcome === "already-correct") {
        record(label, path, "skipped", "already answered (matches our data)");
      } else if (outcome === "not-applied") {
        record(label, path, "failed", `page rejected the selection "${value}" — pick it by hand`);
      } else {
        record(label, path, "failed", `no dropdown option matched "${value}"`);
      }
      continue;
    }

    if (type === "radio") {
      if (!el.name || seenRadioNames.has(el.name)) continue;
      seenRadioNames.add(el.name);
      let group;
      try {
        // scoped to the element's own root so shadow-DOM groups resolve
        group = rootOf(el).querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
      } catch (e) {
        continue;
      }
      const groupLabel = getRadioGroupLabel(doc, el);
      const matchedPath = matchFieldPath(groupLabel);
      if (!matchedPath) continue;
      const path = resolveRowPath(matchedPath, rowCursor);
      if ([...group].some((r) => r.checked)) {
        record(groupLabel, path, "skipped", "already answered");
        continue;
      }
      const value = getPathValue(profile, path);
      if (!value) {
        record(groupLabel, path, "skipped", "no data in profile");
        continue;
      }
      if (fillYesNoRadioGroup(group, value)) {
        filledCount++;
        record(groupLabel, path, "filled", value);
      } else {
        record(groupLabel, path, "failed", `no Yes/No option matched "${value}"`);
      }
      continue;
    }

    if (type === "checkbox") {
      const label = getLabelText(doc, el);
      const matchedPath = matchFieldPath(label);
      if (!matchedPath) continue;
      // A repeated row's own checkbox ("I currently work here") needs the same
      // row resolution as its other fields — without this, a second row's
      // checkbox still resolves to experience.0.current, same class of bug as
      // the earlier combobox one.
      const path = resolveRowPath(matchedPath, rowCursor);
      const value = getPathValue(profile, path);
      // A checkbox may only be driven by a genuinely boolean profile field.
      // Without this, a text value ticks any box whose label happens to match:
      // "Vatican City (Holy See)" in a country checklist matches the /city/
      // rule and gets ticked from location.city, answering a real application
      // question wrongly.
      if (typeof value !== "boolean") continue;
      if (el.checked) {
        record(label, path, "skipped", "already checked");
        continue;
      }
      if (!value) {
        record(label, path, "skipped", "no data in profile");
        continue;
      }
      el.checked = true;
      fireEvents(el);
      filledCount++;
      record(label, path, "filled", value);
      continue;
    }

    const label = getLabelText(doc, el);

    const dateSubfield = matchDateSubfield(el, label);
    if (dateSubfield) {
      const reportPath = `${dateSubfield.section}[row].${dateSubfield.role}Date.${dateSubfield.unit}`;
      if (el.value) {
        record(label, reportPath, "skipped", `already has a value ("${el.value}")`);
        continue;
      }
      const value = resolveDateSubfieldValue(dateSubfield, profile, rowCursor);
      if (!value) {
        record(label, reportPath, "skipped", "no data in profile");
        continue;
      }
      setNativeValue(el, String(value));
      fireEvents(el);
      filledCount++;
      record(label, reportPath, "filled", value);
      continue;
    }

    const matchedPath = matchRowContextOverride(el, label) || matchFieldPath(label);
    if (!matchedPath) continue;
    // Resolved before the skip checks below so the cursor still advances for
    // rows the form already filled in; otherwise later rows shift onto the
    // wrong profile entry.
    const path = resolveRowPath(matchedPath, rowCursor);

    if (el.value) {
      record(label, path, "skipped", `already has a value ("${el.value}")`);
      continue;
    }

    let value;
    if (path === "identity.fullName") {
      value = `${profile.identity.firstName} ${profile.identity.lastName}`.trim();
    } else if (path === "experience[].summary") {
      value = findExperienceSummary(doc, fields, index, profile);
    } else {
      value = getPathValue(profile, path);
    }
    if (value === undefined || value === null || value === "") {
      record(label, path, "skipped", "no data in profile");
      continue;
    }

    // A boolean flag reads as "true"/"false" if stringified straight into a
    // field; render it the way a form expects to be answered.
    value = yesNoText(value);

    if (el.tagName === "SELECT") {
      if (selectOption(el, value)) {
        filledCount++;
        record(label, path, "filled", value);
      } else {
        record(label, path, "failed", `no dropdown option matched "${value}"`);
      }
    } else {
      setNativeValue(el, String(value));
      fireEvents(el);
      filledCount++;
      record(label, path, "filled", value);
    }
  }

  return { filledCount, report };
}
