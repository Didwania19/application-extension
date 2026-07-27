import {
  getProfile,
  saveProfile,
  getPath,
  setPath,
  getStorageUsage,
  exportProfileJSON,
  importProfileJSON,
} from "../lib/storage.js";
import { extractPdfText, parseResumeText } from "../lib/resumeParser.js";

let profile = await getProfile();

const saveStatusEl = document.getElementById("save-status");

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const persist = debounce(async () => {
  await saveProfile(profile);
  saveStatusEl.textContent = "Saved";
  setTimeout(() => {
    if (saveStatusEl.textContent === "Saved") saveStatusEl.textContent = "";
  }, 1500);
  await refreshStorageUsage();
}, 300);

// --- static fields (identity, location, work, authorization, eeo) ---

function refreshStaticFields() {
  document.querySelectorAll("[data-path]").forEach((el) => {
    const value = getPath(profile, el.dataset.path);
    if (el.type === "checkbox") {
      el.checked = Boolean(value);
    } else {
      el.value = value ?? "";
    }
  });
}

function bindStaticFields() {
  document.querySelectorAll("[data-path]").forEach((el) => {
    const path = el.dataset.path;
    el.addEventListener("input", () => {
      const v = el.type === "checkbox" ? el.checked : el.value;
      setPath(profile, path, v);
      persist();
    });
  });
  refreshStaticFields();
}

// --- dynamic lists: education, experience, answers ---

const LIST_CONFIG = {
  education: { containerId: "education-list", templateId: "education-row-template" },
  experience: { containerId: "experience-list", templateId: "experience-row-template" },
  answers: { containerId: "answers-list", templateId: "answers-row-template" },
};

function renderList(arrayName) {
  const { containerId, templateId } = LIST_CONFIG[arrayName];
  const container = document.getElementById(containerId);
  const template = document.getElementById(templateId);
  container.innerHTML = "";
  profile[arrayName].forEach((item, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelectorAll("[data-field]").forEach((fieldEl) => {
      const field = fieldEl.dataset.field;
      const value = item[field];
      if (fieldEl.type === "checkbox") {
        fieldEl.checked = Boolean(value);
      } else {
        fieldEl.value = value ?? "";
      }
      fieldEl.addEventListener("input", () => {
        const v = fieldEl.type === "checkbox" ? fieldEl.checked : fieldEl.value;
        profile[arrayName][index][field] = v;
        persist();
      });
    });
    row.querySelector("[data-remove]").addEventListener("click", () => {
      profile[arrayName].splice(index, 1);
      persist();
      renderList(arrayName);
    });
    container.appendChild(row);
  });
}

const EMPTY_ROW = {
  education: { school: "", degree: "", field: "", startYear: "", endYear: "", gpa: "" },
  experience: { company: "", title: "", startDate: "", endDate: "", current: false, summary: "" },
  answers: { pattern: "", response: "" },
};

document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const arrayName = btn.dataset.add;
    profile[arrayName].push({ ...EMPTY_ROW[arrayName] });
    persist();
    renderList(arrayName);
  });
});

function renderAllLists() {
  Object.keys(LIST_CONFIG).forEach(renderList);
}

// --- documents: resume / cover letter upload ---

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function fillBlankFields(section, extracted) {
  let filledAny = false;
  for (const [field, value] of Object.entries(extracted)) {
    if (!value) continue;
    if (getPath(profile, `${section}.${field}`)) continue; // don't clobber existing data
    setPath(profile, `${section}.${field}`, value);
    filledAny = true;
  }
  return filledAny;
}

function fillBlankLists(extracted) {
  let filledAny = false;
  for (const arrayName of ["education", "experience"]) {
    if (profile[arrayName].length === 0 && extracted[arrayName]?.length) {
      profile[arrayName] = extracted[arrayName];
      filledAny = true;
    }
  }
  return filledAny;
}

function setupFileInput(inputId, statusId, base64Field, nameField, { parseForAutofill = false } = {}) {
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);

  function renderStatus() {
    const name = profile.documents[nameField];
    if (!name) {
      status.textContent = "No file uploaded.";
      return;
    }
    const base64 = profile.documents[base64Field];
    const approxBytes = base64 ? Math.floor((base64.length * 3) / 4) : 0;
    status.textContent = `${name} (${formatBytes(approxBytes)})`;
  }

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    profile.documents[base64Field] = arrayBufferToBase64(buffer);
    profile.documents[nameField] = file.name;
    renderStatus();
    persist();

    if (parseForAutofill) {
      status.textContent += " — reading resume…";
      try {
        const text = await extractPdfText(buffer);
        const extracted = parseResumeText(text);
        const filledScalar = fillBlankFields("identity", extracted.identity);
        const filledWork = fillBlankFields("work", extracted.work);
        const filledLists = fillBlankLists(extracted);
        if (filledScalar || filledWork || filledLists) {
          refreshStaticFields();
          renderAllLists();
          persist();
          saveStatusEl.textContent = "Prefilled from resume — please review";
        } else {
          saveStatusEl.textContent = "Resume read, nothing new to prefill";
        }
        setTimeout(() => {
          if (saveStatusEl.textContent.startsWith("Prefilled") || saveStatusEl.textContent.startsWith("Resume read")) {
            saveStatusEl.textContent = "";
          }
        }, 4000);
      } catch (err) {
        console.error("Resume parsing failed", err);
        saveStatusEl.textContent = "Could not auto-read resume — fill fields manually";
      }
      renderStatus();
    }
  });

  renderStatus();
}

// --- storage usage meter ---

async function refreshStorageUsage() {
  const usage = await getStorageUsage();
  const fill = document.getElementById("storage-bar-fill");
  const text = document.getElementById("storage-usage-text");
  const warning = document.getElementById("storage-warning");
  const pct = Math.min(100, usage.ratio * 100);
  fill.style.width = `${pct}%`;
  text.textContent = `Storage: ${formatBytes(usage.bytesInUse)} / ${formatBytes(usage.quotaBytes)}`;
  warning.classList.toggle("hidden", !usage.nearQuota);
}

// --- export / import ---

document.getElementById("export-btn").addEventListener("click", async () => {
  const json = await exportProfileJSON();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "job-autofill-profile.json";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  profile = await importProfileJSON(text);
  renderEverything();
  saveStatusEl.textContent = "Imported";
  setTimeout(() => (saveStatusEl.textContent = ""), 1500);
  await refreshStorageUsage();
  e.target.value = "";
});

function renderEverything() {
  bindStaticFields();
  renderAllLists();
}

renderEverything();
setupFileInput("resume-file", "resume-status", "resumeFile", "resumeFileName", { parseForAutofill: true });
setupFileInput("cover-letter-file", "cover-letter-status", "coverLetterFile", "coverLetterFileName");
await refreshStorageUsage();
