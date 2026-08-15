function tripIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

function followReisenAuthRedirect(session) {
  if (!session) return false;
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || sessionStorage.getItem("auth_return_to");
  if (!next || !next.startsWith("/reisen/") || next.startsWith("//")) return false;
  sessionStorage.removeItem("auth_return_to");
  window.location.replace(next);
  return true;
}

function formatTripDateRange(trip) {
  if (!trip?.start_date || !trip?.end_date) return "";
  const start = new Date(`${trip.start_date}T00:00:00`);
  const end = new Date(`${trip.end_date}T00:00:00`);
  const fmt = { day: "numeric", month: "long", year: "numeric" };
  const startStr = start.toLocaleDateString("de-CH", fmt);
  if (trip.start_date === trip.end_date) return startStr;
  const endStr = end.toLocaleDateString("de-CH", fmt);
  return `${startStr} – ${endStr}`;
}

function formatDayDate(isoDate) {
  if (!isoDate) return "";
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("de-CH", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  });
}

function getTripStatus(trip) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${trip.start_date}T00:00:00`);
  const end = new Date(`${trip.end_date}T00:00:00`);
  if (end < today) return "past";
  if (start > today) return "upcoming";
  return "ongoing";
}

const TRIP_ITEM_STATUSES = {
  idea: { label: "Idee", cls: "reisen-badge-idea" },
  considering: { label: "In Prüfung", cls: "reisen-badge-considering" },
  booked: { label: "Gebucht", cls: "reisen-badge-booked" },
};

function statusOptionsHtml(selected) {
  return Object.entries(TRIP_ITEM_STATUSES)
    .map(([value, s]) => `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHtml(s.label)}</option>`)
    .join("");
}

function statusBadgeHtml(status) {
  const s = TRIP_ITEM_STATUSES[status] || TRIP_ITEM_STATUSES.idea;
  return `<span class="reisen-badge ${s.cls}">${escapeHtml(s.label)}</span>`;
}

const TRANSPORT_MODE_LABELS = {
  zug: "Zug",
  flug: "Flug",
  auto: "Auto",
  faehre: "Fähre",
  bus: "Bus",
  sonstiges: "Sonstiges",
};

function transportModeOptionsHtml(selected) {
  return Object.entries(TRANSPORT_MODE_LABELS)
    .map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  const n = Number(amount);
  if (Number.isNaN(n)) return "";
  return `${currency || "CHF"} ${n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function memberLabel(member) {
  if (!member) return "";
  return member.display_name?.trim() || (member.is_placeholder ? "Unbenannt" : "Mitglied");
}

function memberOptionsHtml(members, selectedId, includeEmpty) {
  const empty = includeEmpty ? `<option value="">–</option>` : "";
  return empty + members
    .map((m) => `<option value="${m.id}"${m.id === selectedId ? " selected" : ""}>${escapeHtml(memberLabel(m))}</option>`)
    .join("");
}

async function loadTripAccess(client, tripId, userId) {
  const { data: trip, error } = await client.from("trips").select("*").eq("id", tripId).single();
  if (error || !trip) return { trip: null, isMember: false, isCreator: false, member: null };

  const isCreator = trip.creator_id === userId;
  let member = null;
  if (userId) {
    const { data } = await client
      .from("trip_members")
      .select("*")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();
    member = data || null;
  }
  return { trip, isMember: isCreator || !!member, isCreator, member };
}
