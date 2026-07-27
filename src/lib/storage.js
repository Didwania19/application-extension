// Typed wrapper over chrome.storage.local for the profile data model.
// Everything lives under a single "profile" key so reads/writes are atomic
// from the extension's point of view.

export const QUOTA_BYTES = 10485760; // chrome.storage.local.QUOTA_BYTES (~10MB)
export const QUOTA_WARN_RATIO = 0.8;

export const DEFAULT_PROFILE = {
  identity: {
    firstName: "",
    lastName: "",
    preferredName: "",
    email: "",
    phone: "",
    linkedin: "",
    github: "",
    portfolio: "",
    pronouns: "",
  },
  location: {
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    willingToRelocate: false,
  },
  work: {
    currentTitle: "",
    currentCompany: "",
    yearsExperience: "",
    desiredSalary: "",
    earliestStartDate: "",
    noticePeriod: "",
  },
  authorization: {
    // Citizenship is a separate fact from where you live: export-licensing
    // questions ask for country of citizenship / permanent residence, which is
    // often not the country in `location`.
    citizenshipCountry: "",
    authorizedToWork: "", // "yes" | "no" | ""
    requiresSponsorship: "", // legacy/general flag, kept for the synonym matcher
    requiresSponsorshipNow: "", // "yes" | "no" | ""
    requiresSponsorshipFuture: "", // "yes" | "no" | ""
    visaStatusNote: "",
  },
  education: [],
  experience: [],
  documents: {
    resumeFile: "", // base64
    resumeFileName: "",
    coverLetterFile: "", // base64
    coverLetterFileName: "",
  },
  eeo: {
    gender: "Prefer not to say",
    // US EEO reporting asks Hispanic/Latino ethnicity as its own question,
    // separate from the race question, so forms need it as a separate answer.
    hispanicLatino: "Prefer not to say",
    race: "Prefer not to say",
    veteranStatus: "Prefer not to say",
    disabilityStatus: "Prefer not to say",
  },
  answers: [], // [{ pattern, response }]
};

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Deep-merges `stored` onto a clone of `defaults`, so a profile saved by an
// older version of the extension still gets any new fields we've added.
// Arrays are taken as-is from `stored` when present — they're user-managed
// lists (education, experience, answers), not schemas to merge field-by-field.
function mergeDefaults(defaults, stored) {
  if (!isPlainObject(stored)) return structuredClone(defaults);
  const result = structuredClone(defaults);
  for (const key of Object.keys(result)) {
    if (!(key in stored)) continue;
    if (isPlainObject(result[key]) && isPlainObject(stored[key])) {
      result[key] = mergeDefaults(result[key], stored[key]);
    } else {
      result[key] = stored[key];
    }
  }
  return result;
}

export async function getProfile() {
  const { profile } = await chrome.storage.local.get("profile");
  return mergeDefaults(DEFAULT_PROFILE, profile);
}

export async function saveProfile(profile) {
  await chrome.storage.local.set({ profile });
}

// Fetch, apply `updater(profile)` in place (or return a new object), save, return result.
export async function updateProfile(updater) {
  const profile = await getProfile();
  const next = (await updater(profile)) ?? profile;
  await saveProfile(next);
  return next;
}

export async function getStorageUsage() {
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  return {
    bytesInUse,
    quotaBytes: QUOTA_BYTES,
    ratio: bytesInUse / QUOTA_BYTES,
    nearQuota: bytesInUse / QUOTA_BYTES >= QUOTA_WARN_RATIO,
  };
}

export async function exportProfileJSON() {
  const profile = await getProfile();
  return JSON.stringify(profile, null, 2);
}

export async function importProfileJSON(json) {
  const parsed = JSON.parse(json);
  const merged = mergeDefaults(DEFAULT_PROFILE, parsed);
  await saveProfile(merged);
  return merged;
}

// --- dotted-path helpers, used by the options-page form binder ---

export function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split(".");
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!isPlainObject(cursor[key]) && !Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return obj;
}
