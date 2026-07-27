// Entry point, injected on demand (by clicking the toolbar icon) into the
// active tab and every frame on it — application forms are often embedded
// in a same-origin iframe (e.g. iCIMS), which is why allFrames matters.
(async function () {
  try {
    const { profile } = await chrome.storage.local.get("profile");
    if (!profile) return;

    const { filledCount, report } = await fillDocument(document, profile);

    const frameLabel = window.top === window ? "top frame" : `iframe (${location.hostname})`;
    if (report.length) {
      console.groupCollapsed(`Job Application Autofill — ${frameLabel}: ${filledCount} filled, ${report.length} fields recognized`);
      console.table(report);
      console.groupEnd();
    } else {
      console.log(`Job Application Autofill — ${frameLabel}: recognized no fields on this page`);
    }

    if (window.top === window) {
      const failed = report.filter((r) => r.status === "failed");
      showAutofillToast(filledCount, failed);
    }
  } catch (err) {
    console.error("Job Application Autofill: fill failed", err);
  }
})();

function showAutofillToast(count, failed) {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;top:16px;right:16px;z-index:2147483647;background:#1f2937;color:#fff;" +
    "padding:10px 14px;border-radius:8px;font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;" +
    "box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:340px;";

  const summary = document.createElement("div");
  summary.textContent =
    count > 0
      ? `Job Application Autofill: filled ${count} field${count === 1 ? "" : "s"} — review before submitting.`
      : "Job Application Autofill: found nothing to fill on this page.";
  el.appendChild(summary);

  if (failed.length) {
    const heading = document.createElement("div");
    heading.textContent = `Couldn't fill (fill these manually):`;
    heading.style.cssText = "margin-top:8px;font-weight:600;";
    el.appendChild(heading);

    const list = document.createElement("ul");
    list.style.cssText = "margin:4px 0 0;padding-left:18px;";
    for (const f of failed) {
      const item = document.createElement("li");
      item.textContent = `${f.label.replace(/\*$/, "").trim()} — ${f.detail}`;
      list.appendChild(item);
    }
    el.appendChild(list);
  }

  document.body.appendChild(el);
  setTimeout(() => el.remove(), failed.length ? 12000 : 6000);
}
