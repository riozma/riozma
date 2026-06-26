const SITE_ADMIN_EMAIL = "manuelzeltner@gmail.com";

function isSiteAdmin(session) {
  const email = session?.user?.email;
  return email && email.toLowerCase() === SITE_ADMIN_EMAIL.toLowerCase();
}

function showStatus(el, text, type = "info", scrollTarget) {
  if (!el) return;
  el.classList.remove("status-success", "status-error", "status-info");
  if (!text) {
    el.textContent = "";
    return;
  }
  el.classList.add(`status-${type}`);
  el.textContent = text;
  scrollToFeedback(el, scrollTarget);
}

function scrollToFeedback(messageEl, focusEl) {
  const fieldTarget = focusEl && focusEl !== messageEl ? focusEl : null;
  if (!messageEl && !fieldTarget) return;
  window.requestAnimationFrame(() => {
    if (fieldTarget?.focus) {
      try {
        fieldTarget.focus({ preventScroll: true });
      } catch (_) {
        /* ignore */
      }
      fieldTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      if (messageEl) {
        setTimeout(() => {
          messageEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 350);
      }
      return;
    }
    (messageEl || fieldTarget).scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function showFormFeedback(messageEl, text, type, focusEl) {
  showStatus(messageEl, text, type, focusEl || messageEl);
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

    if (messageEl && successMessage) showStatus(messageEl, successMessage, "success", messageEl);
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
    const friendly = typeof formatDbError === "function" ? formatDbError(msg) : msg;
    if (messageEl) showStatus(messageEl, friendly, "error", messageEl);
    if (err?.focusField) {
      err.focusField.classList.add("is-invalid");
      scrollToFeedback(messageEl, err.focusField);
    }
    if (button && snapshot) restoreButton(button, snapshot);
    return false;
  }
}
