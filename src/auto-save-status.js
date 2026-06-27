function ensureAutoSaveIndicator(el) {
  const wrap = el.closest(".field-save-wrap");
  if (!wrap) return null;
  let indicator = wrap.querySelector(".auto-save-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "auto-save-indicator";
    indicator.setAttribute("aria-live", "polite");
    wrap.appendChild(indicator);
  }
  return indicator;
}

function showAutoSaveFeedback(el, state, message) {
  const indicator = el ? ensureAutoSaveIndicator(el) : null;
  const bar = document.getElementById("edit-save-status");

  if (indicator) {
    indicator.className = "auto-save-indicator";
    indicator.textContent = "";
    if (state === "pending") {
      indicator.classList.add("auto-save-pending");
      indicator.textContent = "…";
    } else if (state === "ok") {
      indicator.classList.add("auto-save-ok");
      indicator.textContent = "✓";
    } else if (state === "error") {
      indicator.classList.add("auto-save-error");
      indicator.textContent = "✕";
      if (message) {
        indicator.title = message;
        const msgEl = document.createElement("span");
        msgEl.className = "auto-save-error-text";
        msgEl.textContent = message;
        indicator.appendChild(msgEl);
      }
    } else if (state === "idle") {
      indicator.textContent = "";
    }
  }

  if (!bar) return;

  bar.className = "edit-save-status-bar";
  if (state === "pending") {
    bar.classList.add("edit-save-status-pending");
    bar.textContent = "Speichern…";
  } else if (state === "ok") {
    bar.classList.add("edit-save-status-ok");
    bar.textContent = "Gespeichert";
    setTimeout(() => {
      if (bar.classList.contains("edit-save-status-ok")) {
        bar.textContent = "";
        bar.className = "edit-save-status-bar";
      }
    }, 2000);
  } else if (state === "error") {
    bar.classList.add("edit-save-status-error");
    bar.textContent = message || "Speichern fehlgeschlagen";
  } else if (state === "idle") {
    bar.textContent = "";
  }
}

function updateLiveStatusUI(isLive, hasEventId) {
  const label = document.getElementById("ev-live-label");
  const hint = document.getElementById("ev-live-hint");
  const toggle = document.getElementById("ev-live");
  if (toggle) {
    toggle.disabled = !hasEventId;
    toggle.checked = !!isLive;
  }
  if (label) {
    label.textContent = isLive ? "Live" : "Offline";
    label.classList.toggle("ev-live-on", !!isLive);
    label.classList.toggle("ev-live-off", !isLive);
  }
  if (hint) {
    hint.textContent = isLive
      ? "Öffentliche Gästeseite ist erreichbar."
      : hasEventId
        ? "Nur für Veranstalter sichtbar — keine öffentliche Seite."
        : "Erst speichern (Name, Datum, Start), dann kann live geschaltet werden.";
  }
}
