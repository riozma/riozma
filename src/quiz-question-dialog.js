function showQuizQuestionDialog({ quizId, question, options }) {
  return new Promise((resolve) => {
    const client = getSupabase();
    const isEdit = !!question;
    const initialMode = question?.answer_mode || "four";
    const initialOptions = options && options.length
      ? options
      : [
        { option_text: "", is_correct: false },
        { option_text: "", is_correct: false },
        { option_text: "", is_correct: false },
        { option_text: "", is_correct: false },
      ];
    let currentImagePath = question?.image_path || null;
    let uploading = false;

    const overlay = document.createElement("div");
    overlay.className = "trouvo-dialog-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    function optionRowHtml(opt, idx, mode) {
      const visible = mode === "two" ? idx < 2 : true;
      const tile = QUIZ_TILE_STYLES[idx];
      return `
        <div class="quiz-option-row" data-option-row="${idx}" ${visible ? "" : "hidden"}>
          <span class="quiz-option-color" style="background:${tile.color}">${quizShapeSvg(tile.shape)}</span>
          <input type="text" class="form-control" data-option-text="${idx}" placeholder="Antwort ${idx + 1}" value="${escapeHtml(opt.option_text || "")}">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" data-option-correct="${idx}" id="quiz-opt-correct-${idx}" ${opt.is_correct ? "checked" : ""}>
            <label class="form-check-label small" for="quiz-opt-correct-${idx}">richtig</label>
          </div>
        </div>`;
    }

    overlay.innerHTML = `
      <div class="trouvo-dialog quiz-question-dialog">
        <h2 class="trouvo-dialog-title">${isEdit ? "Frage bearbeiten" : "Neue Frage"}</h2>

        <div class="mb-3">
          <label class="form-label">Frage</label>
          <textarea class="form-control" id="quiz-q-text" rows="2" placeholder="Fragetext">${escapeHtml(question?.question_text || "")}</textarea>
        </div>

        <div class="mb-3">
          <label class="form-label">Bild (optional)</label>
          <input type="file" accept="image/*" class="form-control" id="quiz-q-image-input">
          <img id="quiz-q-image-preview" class="quiz-question-image-preview ${currentImagePath ? "" : "d-none"}" src="${currentImagePath ? escapeHtml(quizImageUrl(currentImagePath)) : ""}">
          <p id="quiz-q-image-status" class="form-text"></p>
        </div>

        <div class="row g-2 mb-3">
          <div class="col-6">
            <label class="form-label">Antwortmodus</label>
            <select class="form-select" id="quiz-q-mode">
              <option value="four" ${initialMode === "four" ? "selected" : ""}>4 Antworten</option>
              <option value="two" ${initialMode === "two" ? "selected" : ""}>2 Antworten</option>
            </select>
          </div>
          <div class="col-6">
            <label class="form-label">Zeit (Sek.)</label>
            <input type="number" min="5" max="120" class="form-control" id="quiz-q-time" value="${question?.time_limit_sec || 20}">
          </div>
        </div>

        <div id="quiz-q-options">
          ${initialOptions.map((o, i) => optionRowHtml(o, i, initialMode)).join("")}
        </div>

        <p id="quiz-q-error" class="quiz-error"></p>

        <div class="trouvo-dialog-actions trouvo-dialog-actions-split">
          <div class="trouvo-dialog-actions-start">
            <button type="button" class="btn btn-outline-secondary" data-dialog-action="cancel">Abbrechen</button>
          </div>
          <div class="trouvo-dialog-actions-end">
            ${isEdit ? '<button type="button" class="btn btn-outline-danger" data-dialog-action="delete">Löschen</button>' : ""}
            <button type="button" class="btn btn-primary" data-dialog-action="save">Speichern</button>
          </div>
        </div>
      </div>`;

    function close(result) {
      overlay.remove();
      document.body.classList.remove("trouvo-dialog-open");
      resolve(result);
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    overlay.querySelector("#quiz-q-mode").addEventListener("change", (e) => {
      const mode = e.target.value;
      overlay.querySelectorAll("[data-option-row]").forEach((row) => {
        const idx = Number(row.dataset.optionRow);
        row.hidden = mode === "two" && idx >= 2;
      });
    });

    overlay.querySelector("#quiz-q-image-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const statusEl = overlay.querySelector("#quiz-q-image-status");
      const preview = overlay.querySelector("#quiz-q-image-preview");
      uploading = true;
      statusEl.textContent = "Lädt hoch…";
      try {
        const prepared = await compressImageFile(file, { maxEdge: 1200, quality: 0.85 });
        const path = `${quizId}/${crypto.randomUUID()}.jpg`;
        const { error } = await client.storage.from("quiz-images").upload(path, prepared, { upsert: true });
        if (error) throw storageUploadError(error);
        currentImagePath = path;
        preview.src = quizImageUrl(path);
        preview.classList.remove("d-none");
        statusEl.textContent = "✓ Bild hochgeladen";
      } catch (err) {
        statusEl.textContent = err.message || "Upload fehlgeschlagen.";
      } finally {
        uploading = false;
      }
    });

    overlay.querySelectorAll("[data-dialog-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.dialogAction;
        if (action === "cancel") {
          close(null);
          return;
        }
        if (action === "delete") {
          close({ action: "delete" });
          return;
        }
        if (uploading) {
          overlay.querySelector("#quiz-q-error").textContent = "Bitte warten, bis das Bild hochgeladen ist.";
          return;
        }

        const errorEl = overlay.querySelector("#quiz-q-error");
        const text = overlay.querySelector("#quiz-q-text").value.trim();
        const mode = overlay.querySelector("#quiz-q-mode").value;
        const timeLimit = Number(overlay.querySelector("#quiz-q-time").value) || 20;
        const optionCount = mode === "two" ? 2 : 4;

        const opts = [];
        for (let i = 0; i < optionCount; i++) {
          const optText = overlay.querySelector(`[data-option-text="${i}"]`).value.trim();
          const isCorrect = overlay.querySelector(`[data-option-correct="${i}"]`).checked;
          opts.push({ sort_order: i, option_text: optText, is_correct: isCorrect });
        }

        if (!text) {
          errorEl.textContent = "Bitte einen Fragetext eingeben.";
          return;
        }
        if (opts.some((o) => !o.option_text)) {
          errorEl.textContent = "Bitte alle Antwortfelder ausfüllen.";
          return;
        }
        if (!opts.some((o) => o.is_correct)) {
          errorEl.textContent = "Bitte mindestens eine richtige Antwort markieren.";
          return;
        }

        close({
          action: "save",
          question_text: text,
          image_path: currentImagePath,
          answer_mode: mode,
          time_limit_sec: timeLimit,
          options: opts,
        });
      });
    });

    document.body.classList.add("trouvo-dialog-open");
    document.body.appendChild(overlay);
    overlay.querySelector("#quiz-q-text")?.focus();
  });
}
