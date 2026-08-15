let tripId = null;
let tripData = null;
let members = [];
let budgetItems = [];
let expenses = [];
let expenseParticipants = [];

document.addEventListener("DOMContentLoaded", async () => {
  tripId = tripIdFromUrl();
  const client = getSupabase();
  if (!client || !tripId) {
    document.getElementById("finance-loading").textContent = "Ungültige Anfrage — bitte vom Dashboard eine Reise wählen.";
    return;
  }

  try {
    await completeAuthFromUrl(client);
    const session = await waitForAuthSession(client);
    if (!session) {
      redirectToReisenLogin(`/reisen/finanzen.html?id=${encodeURIComponent(tripId)}`);
      return;
    }

    const access = await loadTripAccess(client, tripId, session.user.id);
    if (!access.trip || !access.isMember) {
      document.getElementById("finance-loading").textContent = "Kein Zugriff auf diese Reise.";
      return;
    }

    tripData = access.trip;
    setTripTitle(tripData.name?.trim() || `${tripData.start_location} – ${tripData.end_location}`);
    document.title = `Finanzen – ${tripData.name || "Reise"}`;

    await loadFinanceData(client);
    renderAll();
    wireAddButtons();

    document.getElementById("finance-loading").classList.add("d-none");
    document.getElementById("finance-content").classList.remove("d-none");
  } catch (err) {
    document.getElementById("finance-loading").textContent = err?.message || "Finanzen konnten nicht geladen werden.";
  }
});

async function loadFinanceData(client) {
  const [membersRes, budgetRes, expensesRes] = await Promise.all([
    client.from("trip_members").select("*").eq("trip_id", tripId).order("joined_at"),
    client.from("trip_budget_items").select("*").eq("trip_id", tripId).order("sort_order"),
    client.from("trip_expenses").select("*").eq("trip_id", tripId).order("expense_date"),
  ]);
  for (const res of [membersRes, budgetRes, expensesRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  members = membersRes.data || [];
  budgetItems = budgetRes.data || [];
  expenses = expensesRes.data || [];

  expenseParticipants = [];
  if (expenses.length) {
    const { data, error } = await client
      .from("trip_expense_participants")
      .select("*")
      .in("expense_id", expenses.map((e) => e.id));
    if (error) throw new Error(error.message);
    expenseParticipants = data || [];
  }
}

function renderAll() {
  renderBudget();
  renderExpenses();
  renderBalances();
}

const saveTimers = new Map();
function debouncedSave(key, fn) {
  clearTimeout(saveTimers.get(key));
  saveTimers.set(key, setTimeout(() => runSave(fn), 600));
}

async function runSave(fn) {
  const client = getSupabase();
  showAutoSaveFeedback(null, "pending");
  try {
    await fn(client);
    showAutoSaveFeedback(null, "ok");
  } catch (err) {
    showAutoSaveFeedback(null, "error", err?.message || "Speichern fehlgeschlagen.");
  }
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

function renderBudget() {
  const el = document.getElementById("budget-list");
  el.innerHTML = budgetItems.length
    ? budgetItems.map((item) => `
        <div class="builder-row reisen-budget-row" data-budget-id="${item.id}">
          <input type="text" class="form-control form-control-sm reisen-budget-category" placeholder="Posten (z.B. Unterkünfte)" value="${escapeHtml(item.category || "")}">
          <input type="number" step="0.01" class="form-control form-control-sm reisen-budget-amount" placeholder="Betrag p.P." value="${item.amount_per_person ?? ""}">
          <input type="text" class="form-control form-control-sm reisen-budget-currency" value="${escapeHtml(item.currency || "CHF")}">
          <input type="text" class="form-control form-control-sm reisen-budget-notes" placeholder="Notiz" value="${escapeHtml(item.notes || "")}">
          <button type="button" class="btn btn-sm btn-outline-danger" data-remove-budget="${item.id}" title="Entfernen">×</button>
        </div>`).join("")
    : `<p class="text-muted small planning-empty">Noch keine Budget-Positionen.</p>`;

  const totals = new Map();
  budgetItems.forEach((item) => {
    const amount = Number(item.amount_per_person);
    if (!amount || Number.isNaN(amount)) return;
    const cur = item.currency || "CHF";
    totals.set(cur, (totals.get(cur) || 0) + amount);
  });
  document.getElementById("budget-total").textContent = totals.size
    ? `Total pro Person: ${[...totals.entries()].map(([cur, sum]) => formatMoney(sum, cur)).join(" + ")}`
    : "";

  el.querySelectorAll(".reisen-budget-row").forEach((row) => {
    const id = row.dataset.budgetId;
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        const item = budgetItems.find((b) => b.id === id);
        if (!item) return;
        item.category = row.querySelector(".reisen-budget-category").value.trim();
        const amountVal = row.querySelector(".reisen-budget-amount").value.trim();
        item.amount_per_person = amountVal === "" ? null : Number(amountVal);
        item.currency = row.querySelector(".reisen-budget-currency").value.trim() || "CHF";
        item.notes = row.querySelector(".reisen-budget-notes").value.trim();
        renderBudgetTotalOnly();
        debouncedSave(`budget.${id}`, async (client) => {
          const { error } = await client.from("trip_budget_items").update({
            category: item.category,
            amount_per_person: item.amount_per_person,
            currency: item.currency,
            notes: item.notes,
          }).eq("id", id);
          if (error) throw new Error(formatDbError(error.message));
        });
      });
    });
  });

  el.querySelectorAll("[data-remove-budget]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.removeBudget;
      await runSave(async (client) => {
        const { error } = await client.from("trip_budget_items").delete().eq("id", id);
        if (error) throw new Error(formatDbError(error.message));
        budgetItems = budgetItems.filter((b) => b.id !== id);
        renderBudget();
      });
    });
  });
}

function renderBudgetTotalOnly() {
  const totals = new Map();
  budgetItems.forEach((item) => {
    const amount = Number(item.amount_per_person);
    if (!amount || Number.isNaN(amount)) return;
    const cur = item.currency || "CHF";
    totals.set(cur, (totals.get(cur) || 0) + amount);
  });
  document.getElementById("budget-total").textContent = totals.size
    ? `Total pro Person: ${[...totals.entries()].map(([cur, sum]) => formatMoney(sum, cur)).join(" + ")}`
    : "";
}

// ---------------------------------------------------------------------------
// Ausgaben
// ---------------------------------------------------------------------------

function renderExpenses() {
  const el = document.getElementById("expenses-list");
  el.innerHTML = expenses.length
    ? expenses.map((exp) => renderExpenseRow(exp)).join("")
    : `<p class="text-muted small planning-empty">Noch keine Ausgaben erfasst.</p>`;

  expenses.forEach((exp) => bindExpenseRow(exp));
}

function renderExpenseRow(exp) {
  const participants = expenseParticipants.filter((p) => p.expense_id === exp.id);
  const participantIds = new Set(participants.map((p) => p.member_id));
  return `
    <div class="reisen-option-row reisen-expense-row" data-expense-id="${exp.id}">
      <div class="reisen-option-grid reisen-expense-grid">
        <div>
          <label class="form-label form-label-sm">Beschreibung</label>
          <input type="text" class="form-control form-control-sm" data-e-field="description" placeholder="z.B. Abendessen Piran" value="${escapeHtml(exp.description || "")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Betrag</label>
          <input type="number" step="0.01" class="form-control form-control-sm" data-e-field="amount" value="${exp.amount ?? ""}">
        </div>
        <div>
          <label class="form-label form-label-sm">Währung</label>
          <input type="text" class="form-control form-control-sm" data-e-field="currency" value="${escapeHtml(exp.currency || "CHF")}">
        </div>
        <div>
          <label class="form-label form-label-sm">Bezahlt von</label>
          <select class="form-select form-select-sm" data-e-field="paid_by_member_id">${memberOptionsHtml(members, exp.paid_by_member_id, false)}</select>
        </div>
        <div>
          <label class="form-label form-label-sm">Datum</label>
          <input type="date" class="form-control form-control-sm" data-e-field="expense_date" value="${exp.expense_date || ""}">
        </div>
      </div>
      <div class="reisen-expense-participants">
        <span class="form-label form-label-sm">Dabei waren:</span>
        ${members.map((m) => `
          <label class="reisen-participant-check">
            <input type="checkbox" data-e-participant="${m.id}" ${participantIds.has(m.id) ? "checked" : ""}>
            ${escapeHtml(memberLabel(m))}
          </label>`).join("")}
      </div>
      <div class="reisen-option-footer">
        <button type="button" class="btn btn-sm btn-outline-danger" data-remove-expense title="Entfernen">×</button>
      </div>
    </div>`;
}

function bindExpenseRow(exp) {
  const row = document.querySelector(`[data-expense-id="${exp.id}"]`);
  if (!row) return;

  row.querySelectorAll("[data-e-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const field = input.dataset.eField;
      let value = input.value.trim();
      if (field === "amount") value = value === "" ? 0 : Number(value);
      exp[field] = value;
      renderBalances();
      debouncedSave(`expense.${exp.id}.${field}`, async (client) => {
        const { error } = await client.from("trip_expenses").update({ [field]: value }).eq("id", exp.id);
        if (error) throw new Error(formatDbError(error.message));
      });
    });
  });

  row.querySelectorAll("[data-e-participant]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const memberId = cb.dataset.eParticipant;
      await runSave(async (client) => {
        if (cb.checked) {
          const { data, error } = await client
            .from("trip_expense_participants")
            .insert({ expense_id: exp.id, member_id: memberId })
            .select("*")
            .single();
          if (error) throw new Error(formatDbError(error.message));
          expenseParticipants.push(data);
        } else {
          const { error } = await client
            .from("trip_expense_participants")
            .delete()
            .eq("expense_id", exp.id)
            .eq("member_id", memberId);
          if (error) throw new Error(formatDbError(error.message));
          expenseParticipants = expenseParticipants.filter(
            (p) => !(p.expense_id === exp.id && p.member_id === memberId),
          );
        }
        renderBalances();
      });
    });
  });

  row.querySelector("[data-remove-expense]")?.addEventListener("click", async () => {
    if (!confirm("Ausgabe wirklich entfernen?")) return;
    await runSave(async (client) => {
      const { error } = await client.from("trip_expenses").delete().eq("id", exp.id);
      if (error) throw new Error(formatDbError(error.message));
      expenses = expenses.filter((e) => e.id !== exp.id);
      expenseParticipants = expenseParticipants.filter((p) => p.expense_id !== exp.id);
      renderExpenses();
      renderBalances();
    });
  });
}

function wireAddButtons() {
  document.getElementById("btn-add-budget").addEventListener("click", async () => {
    await runSave(async (client) => {
      const { data, error } = await client
        .from("trip_budget_items")
        .insert({ trip_id: tripId, sort_order: budgetItems.length })
        .select("*")
        .single();
      if (error) throw new Error(formatDbError(error.message));
      budgetItems.push(data);
      renderBudget();
      document.querySelector(`[data-budget-id="${data.id}"] .reisen-budget-category`)?.focus();
    });
  });

  document.getElementById("btn-add-expense").addEventListener("click", async () => {
    if (!members.length) {
      showAutoSaveFeedback(null, "error", "Zuerst Mitreisende hinzufügen.");
      return;
    }
    await runSave(async (client) => {
      const { data, error } = await client
        .from("trip_expenses")
        .insert({ trip_id: tripId, paid_by_member_id: members[0].id })
        .select("*")
        .single();
      if (error) throw new Error(formatDbError(error.message));
      expenses.push(data);

      const rows = members.map((m) => ({ expense_id: data.id, member_id: m.id }));
      const { data: parts, error: pErr } = await client
        .from("trip_expense_participants")
        .insert(rows)
        .select("*");
      if (pErr) throw new Error(formatDbError(pErr.message));
      expenseParticipants.push(...(parts || []));

      renderExpenses();
      renderBalances();
      document.querySelector(`[data-expense-id="${data.id}"] [data-e-field="description"]`)?.focus();
    });
  });
}

// ---------------------------------------------------------------------------
// Salden & Ausgleich (pro Währung)
// ---------------------------------------------------------------------------

function computeBalances() {
  // Map: currency -> Map(member_id -> balance). balance > 0 = bekommt Geld.
  const byCurrency = new Map();

  expenses.forEach((exp) => {
    const amount = Number(exp.amount);
    if (!amount || Number.isNaN(amount)) return;
    const cur = exp.currency || "CHF";
    if (!byCurrency.has(cur)) byCurrency.set(cur, new Map());
    const balances = byCurrency.get(cur);

    const participants = expenseParticipants.filter((p) => p.expense_id === exp.id);
    if (!participants.length) return;

    balances.set(exp.paid_by_member_id, (balances.get(exp.paid_by_member_id) || 0) + amount);

    const customTotal = participants.reduce((sum, p) => sum + (Number(p.share_amount) || 0), 0);
    const useCustom = exp.split_mode === "custom" && customTotal > 0;
    participants.forEach((p) => {
      const share = useCustom ? (Number(p.share_amount) || 0) : amount / participants.length;
      balances.set(p.member_id, (balances.get(p.member_id) || 0) - share);
    });
  });

  return byCurrency;
}

function renderBalances() {
  const byCurrency = computeBalances();
  const balancesEl = document.getElementById("balances-list");
  const settleEl = document.getElementById("settleup-list");

  if (!byCurrency.size) {
    balancesEl.innerHTML = `<p class="text-muted small planning-empty">Noch keine Ausgaben — keine Salden.</p>`;
    settleEl.innerHTML = `<p class="text-muted small planning-empty">Nichts auszugleichen.</p>`;
    return;
  }

  const balanceBlocks = [];
  const settleBlocks = [];

  byCurrency.forEach((balances, cur) => {
    const rows = members
      .map((m) => ({ member: m, balance: balances.get(m.id) || 0 }))
      .filter((r) => Math.abs(r.balance) >= 0.005);

    balanceBlocks.push(`
      <div class="reisen-balance-block">
        <h4 class="reisen-balance-currency">${escapeHtml(cur)}</h4>
        ${rows.length
          ? rows.map((r) => `
              <div class="reisen-balance-row${r.balance > 0 ? " reisen-balance-positive" : " reisen-balance-negative"}">
                <span>${escapeHtml(memberLabel(r.member))}</span>
                <span>${r.balance > 0 ? "+" : ""}${formatMoney(r.balance, cur)}</span>
              </div>`).join("")
          : `<p class="text-muted small">Alles ausgeglichen.</p>`}
      </div>`);

    const settlements = computeSettleUp(rows);
    settleBlocks.push(`
      <div class="reisen-balance-block">
        <h4 class="reisen-balance-currency">${escapeHtml(cur)}</h4>
        ${settlements.length
          ? settlements.map((s) => `
              <div class="reisen-settle-row">
                <span>${escapeHtml(memberLabel(s.from))} → ${escapeHtml(memberLabel(s.to))}</span>
                <span>${formatMoney(s.amount, cur)}</span>
              </div>`).join("")
          : `<p class="text-muted small">Nichts auszugleichen.</p>`}
      </div>`);
  });

  balancesEl.innerHTML = balanceBlocks.join("");
  settleEl.innerHTML = settleBlocks.join("");
}

function computeSettleUp(rows) {
  const debtors = rows.filter((r) => r.balance < -0.005).map((r) => ({ member: r.member, amount: -r.balance }));
  const creditors = rows.filter((r) => r.balance > 0.005).map((r) => ({ member: r.member, amount: r.balance }));
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const pay = Math.min(debtors[di].amount, creditors[ci].amount);
    settlements.push({ from: debtors[di].member, to: creditors[ci].member, amount: pay });
    debtors[di].amount -= pay;
    creditors[ci].amount -= pay;
    if (debtors[di].amount < 0.005) di += 1;
    if (creditors[ci].amount < 0.005) ci += 1;
  }
  return settlements;
}
