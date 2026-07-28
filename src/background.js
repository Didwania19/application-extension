// Pages the browser refuses to let any extension touch. Clicking the toolbar
// icon on one of these is a perfectly ordinary thing for someone to do — the
// icon is visible everywhere — so it must not surface as an extension error.
// Chrome reports it as "Cannot access a chrome:// URL", which lands in
// chrome://extensions under Errors and looks like a fault in the extension.
const RESTRICTED_SCHEMES = ["chrome:", "chrome-extension:", "devtools:", "edge:", "about:", "view-source:"];

// The Web Store is blocked separately from the schemes above: it is an https://
// page, but extensions are not permitted to script it. The current domain is
// off-limits entirely; the legacy one is a general Google host where only the
// /webstore path is the gallery.
const RESTRICTED_HOST = "chromewebstore.google.com";
const LEGACY_STORE_HOST = "chrome.google.com";

function isRestrictedUrl(url) {
  if (!url) return false; // unknown — let the injection attempt decide
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return false;
  }
  if (RESTRICTED_SCHEMES.includes(parsed.protocol)) return true;
  if (parsed.hostname === RESTRICTED_HOST) return true;
  return parsed.hostname === LEGACY_STORE_HOST && parsed.pathname.startsWith("/webstore");
}

// Same condition, recognised from the failure instead of the URL. `tab.url` is
// only populated when the extension has access to that tab, which is precisely
// what a restricted page withholds — so on those pages the pre-check above sees
// nothing and the attempt has to be the thing that tells us.
function isRestrictedPageError(err) {
  return /cannot access|extension gallery|chrome:\/\/|showing a modal dialog/i.test(String(err?.message || err));
}

// The only feedback available on a page we cannot script: the toolbar badge.
// Scoped to the tab so it never appears on an unrelated one, and cleared after
// a moment so it does not linger as if it were a persistent state.
async function flashBadge(tabId, text) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#96181f" });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {}), 2500);
  } catch (e) {
    // The tab closed before the badge could be set — nothing worth reporting.
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  if (isRestrictedUrl(tab.url)) {
    await flashBadge(tab.id, "n/a");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["src/content/field-map.js", "src/content/fill-engine.js", "src/content/content.js"],
    });
  } catch (err) {
    if (isRestrictedPageError(err)) {
      await flashBadge(tab.id, "n/a");
      return;
    }
    console.error("Fieldwork: injection failed", err);
    await flashBadge(tab.id, "!");
  }
});
