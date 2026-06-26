let supabaseClient = null;

const PRODUCTION_SITE_URL = "https://riozma.ch";
const PRODUCTION_HOSTS = new Set(["riozma.ch", "www.riozma.ch"]);

function isLocalDevHost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function isProductionHost() {
  return PRODUCTION_HOSTS.has(window.location.hostname);
}

function forceHttpsOnProduction() {
  if (!isProductionHost() || window.location.protocol === "https:") return;
  window.location.replace(
    `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

forceHttpsOnProduction();

function storeAuthReturnTo() {
  sessionStorage.setItem("auth_return_to", `${window.location.pathname}${window.location.search}`);
}

function siteOrigin() {
  if (isLocalDevHost()) return window.location.origin;
  if (isProductionHost()) return `https://${window.location.hostname}`;
  const configured = (window.SITE_URL || PRODUCTION_SITE_URL).replace(/\/$/, "");
  return configured;
}

function siteUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${normalized}`;
}

function oauthReturnUrl() {
  return authCallbackUrl();
}

function authCallbackUrl() {
  return siteUrl("/auth/callback.html");
}

function authRedirectUrl() {
  return authCallbackUrl();
}

function createAuthStorage() {
  return {
    getItem(key) {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    },
    setItem(key, value) {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
    },
    removeItem(key) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    },
  };
}

async function completeAuthFromUrl(client) {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("error_description") || params.get("error");
  const code = params.get("code");
  const cleanPath = `${window.location.pathname}${window.location.search}`;

  if (authError) {
    window.history.replaceState({}, document.title, window.location.pathname);
    return { error: authError };
  }

  if (code) {
    const { data: { session: existing } } = await client.auth.getSession();
    if (!existing) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      window.history.replaceState({}, document.title, window.location.pathname);
      if (error) return { error: error.message };
    } else {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return { error: null };
  }

  if (window.location.hash.includes("access_token")) {
    const { error } = await client.auth.getSession();
    window.history.replaceState({}, document.title, cleanPath);
    if (error) return { error: error.message };
  }

  return { error: null };
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.warn("Supabase nicht konfiguriert.");
    return null;
  }
  if (window.SUPABASE_URL.includes("DEIN-PROJEKT") || window.SUPABASE_ANON_KEY.includes("DEIN-ANON")) {
    console.warn("Bitte src/supabase-config.js mit echten Werten ausfüllen.");
    return null;
  }
  if (!window.supabase) {
    console.warn("Supabase JS SDK nicht geladen.");
    return null;
  }
  supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storage: createAuthStorage(),
    },
  });
  return supabaseClient;
}

function storagePublicUrl(bucket, path) {
  const client = getSupabase();
  if (!client || !path) return "";
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "beitrag";
}

function formatDateDE(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function renderParagraphs(text) {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function googleMapsSearchUrl(location) {
  if (!location || !location.trim()) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}

function googleMapsEmbedUrl(location) {
  if (!location || !location.trim()) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(location.trim())}&output=embed`;
}

function renderLocationBlock(location) {
  if (!location || !location.trim()) return "";
  const mapsUrl = googleMapsSearchUrl(location);
  const embedUrl = googleMapsEmbedUrl(location);
  return `
    <div class="location-block">
      <p class="guest-event-location">
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(location)} ↗</a>
      </p>
      <div class="map-embed-wrap">
        <iframe class="map-embed" src="${embedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen title="Karte: ${escapeHtml(location)}"></iframe>
      </div>
    </div>`;
}

function getAttendeeVisibility(event) {
  if (event.attendee_visibility) return event.attendee_visibility;
  return event.show_attendee_list ? "full" : "none";
}

function getEventDateTimes(event) {
  const start = new Date(`${event.event_date}T${(event.start_time || "00:00").slice(0, 8)}`);
  let end;
  if (event.open_end) {
    end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  } else if (event.end_time) {
    end = new Date(`${event.event_date}T${event.end_time.slice(0, 8)}`);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  return { start, end };
}

function isEventPast(event) {
  const { end } = getEventDateTimes(event);
  return end < new Date();
}

function isPhotosUploadClosed(event) {
  if (!event.photos_closes_at) return false;
  const close = new Date(`${event.photos_closes_at}T23:59:59`);
  return close < new Date();
}

function renderEventPhotosSection(event) {
  const showPreview = event.photos_show_preview;
  const uploadEnabled = event.photos_upload_enabled && event.photos_upload_url;
  if (!showPreview && !uploadEnabled) return "";

  const past = isEventPast(event);
  const uploadClosed = uploadEnabled && isPhotosUploadClosed(event);
  const previewText = event.photos_preview_text?.trim()
    || "Nach dem Event könnt ihr hier eure Fotos teilen. Der Upload-Link erscheint dann auf dieser Seite.";
  const galleryUrl = event.photos_gallery_url?.trim() || event.photos_upload_url?.trim();
  const closesLabel = event.photos_closes_at
    ? new Date(event.photos_closes_at).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" })
    : "";

  if (uploadEnabled && !uploadClosed) {
    return `
      <section class="guest-section event-photos-section event-photos-active">
        <h2>Event-Fotos</h2>
        <p>Lade deine Fotos in Originalqualität hoch – der Upload läuft über einen externen Dienst (z.&nbsp;B. Google Drive oder Dropbox).</p>
        ${closesLabel ? `<p class="event-photos-deadline">Upload möglich bis ${closesLabel}.</p>` : ""}
        <div class="event-photos-actions">
          <a href="${escapeHtml(event.photos_upload_url)}" target="_blank" rel="noopener" class="btn btn-primary">Fotos hochladen</a>
          ${event.photos_gallery_url && event.photos_gallery_url !== event.photos_upload_url
    ? `<a href="${escapeHtml(event.photos_gallery_url)}" target="_blank" rel="noopener" class="btn btn-outline-secondary">Alle Fotos ansehen</a>`
    : ""}
        </div>
        <p class="text-muted small event-photos-hint">Tipp: Am Handy den Link im Browser öffnen. Für beste Qualität «Original» bzw. volle Auflösung wählen.</p>
      </section>`;
  }

  if (uploadEnabled && uploadClosed) {
    return `
      <section class="guest-section event-photos-section event-photos-closed">
        <h2>Event-Fotos</h2>
        <p>Der Upload ist geschlossen${closesLabel ? ` (bis ${closesLabel} war er offen)` : ""}.</p>
        ${galleryUrl
    ? `<div class="event-photos-actions"><a href="${escapeHtml(galleryUrl)}" target="_blank" rel="noopener" class="btn btn-primary">Fotos ansehen / herunterladen</a></div>`
    : `<p class="text-muted">Der Veranstalter stellt die Fotos bald bereit.</p>`}
      </section>`;
  }

  if (showPreview && past) {
    return `
      <section class="guest-section event-photos-section event-photos-soon">
        <h2>Event-Fotos</h2>
        <p>${escapeHtml(previewText)}</p>
        <p class="text-muted small">Der Upload-Link erscheint hier, sobald der Veranstalter ihn freischaltet.</p>
      </section>`;
  }

  if (showPreview) {
    return `
      <section class="guest-section event-photos-section event-photos-preview">
        <h2>Event-Fotos</h2>
        <p>${escapeHtml(previewText)}</p>
      </section>`;
  }

  return "";
}

function toIcsDateTime(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}

function escapeIcsText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function buildEventIcs(event) {
  const { start, end } = getEventDateTimes(event);
  const uid = `${event.id}@trouvo`;
  const now = toIcsDateTime(new Date());
  const desc = [event.description, event.organizer_phone ? `Kontakt: ${event.organizer_phone}` : ""]
    .filter(Boolean)
    .join("\\n\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trouvo//riozma//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsDateTime(start)}`,
    `DTEND:${toIcsDateTime(end)}`,
    `SUMMARY:${escapeIcsText(event.name)}`,
    desc ? `DESCRIPTION:${escapeIcsText(desc)}` : "",
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function downloadEventIcs(event) {
  const ics = buildEventIcs(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(event.name || "event")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderOrganizerContact(event) {
  if (!event.organizer_phone) return "";
  const tel = event.organizer_phone.replace(/\s/g, "");
  return `
    <p class="organizer-contact">
      Fragen oder Änderungswünsche? Kontakt:
      <a href="tel:${escapeHtml(tel)}">${escapeHtml(event.organizer_phone)}</a>
    </p>`;
}

function trouvoLogoHtml(className = "trouvo-wordmark") {
  return `<span class="${className}">Trouvo</span>`;
}

async function userCanManageEvent(client, eventId, userId) {
  if (!client || !eventId || !userId) return { canManage: false, isCreator: false };
  const { data: event } = await client.from("events").select("organizer_id").eq("id", eventId).single();
  if (!event) return { canManage: false, isCreator: false };
  if (event.organizer_id === userId) return { canManage: true, isCreator: true };
  const { data: co } = await client
    .from("event_co_organizers")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  return { canManage: !!co, isCreator: false };
}

async function userIsEventOrganizer(client, event, userId) {
  if (!event || !userId) return false;
  if (event.organizer_id === userId) return true;
  const { data: co } = await client
    .from("event_co_organizers")
    .select("user_id")
    .eq("event_id", event.id)
    .eq("user_id", userId)
    .maybeSingle();
  return !!co;
}
