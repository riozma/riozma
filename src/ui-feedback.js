const SITE_ADMIN_EMAIL = "manuelzeltner@gmail.com";

function isSiteAdmin(session) {
  const email = session?.user?.email;
  return email && email.toLowerCase() === SITE_ADMIN_EMAIL.toLowerCase();
}

function showStatus(el, text, type = "info") {
  if (!el) return;
  el.classList.remove("status-success", "status-error", "status-info");
  if (!text) {
    el.textContent = "";
    return;
  }
  el.classList.add(`status-${type}`);
  el.textContent = text;
}

function restoreButton(btn, snapshot) {
  if (!btn || !snapshot) return;
  btn.disabled = snapshot.disabled;
  btn.textContent = snapshot.text;
  btn.className = snapshot.className;
}

function flashButtonSuccess(btn, snapshot, successLabel = "✓ Gespeichert", ms = 2200) {
  if (!btn) return;
  btn.classList.add("is-success-flash");
  btn.textContent = successLabel;
  btn.disabled = false;
  setTimeout(() => restoreButton(btn, snapshot), ms);
}

async function withActionFeedback({
  button,
  messageEl,
  loadingLabel = "Wird gespeichert…",
  successLabel = "✓ Gespeichert",
  successMessage,
  errorMessage,
  run,
  onSuccess,
  redirectTo,
  redirectDelay = 700,
}) {
  const snapshot = button
    ? { text: button.textContent, disabled: button.disabled, className: button.className }
    : null;

  if (button) {
    button.disabled = true;
    button.textContent = loadingLabel;
  }

  try {
    const result = await run();
    if (result === false) {
      if (button && snapshot) restoreButton(button, snapshot);
      return false;
    }

    if (messageEl && successMessage) showStatus(messageEl, successMessage, "success");
    if (button) flashButtonSuccess(button, snapshot, successLabel);

    if (onSuccess) await onSuccess(result);

    if (redirectTo) {
      setTimeout(() => {
        window.location.href = redirectTo;
      }, redirectDelay);
    }

    return result;
  } catch (err) {
    const msg = err?.message || errorMessage || "Etwas ist schiefgelaufen.";
    if (messageEl) showStatus(messageEl, msg, "error");
    if (button && snapshot) restoreButton(button, snapshot);
    return false;
  }
}
