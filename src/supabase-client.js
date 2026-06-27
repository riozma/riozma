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
  const path = `${window.location.pathname}${window.location.search}`;
  sessionStorage.setItem("auth_return_to", path);
  writeCookie(RETURN_COOKIE, path);
}

function getAuthReturnTo() {
  return sessionStorage.getItem("auth_return_to") || readCookie(RETURN_COOKIE) || "/trouvo/";
}

function siteOrigin() {
  if (isLocalDevHost()) return window.location.origin;
  return (window.SITE_URL || PRODUCTION_SITE_URL).replace(/\/$/, "");
}

function siteUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${normalized}`;
}

function canonicalPageUrl() {
  return `${siteOrigin()}${window.location.pathname}${window.location.search}`;
}

function oauthReturnUrl() {
  return canonicalPageUrl();
}

function authCallbackUrl() {
  return siteUrl("/auth/callback.html");
}

function authRedirectUrl() {
  return oauthReturnUrl();
}

const PKCE_COOKIE = "riozma_pkce_verifier";
const RETURN_COOKIE = "riozma_auth_return";

function readCookie(name) {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value, maxAgeSec = 900) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

function deleteCookie(name) {
  document.cookie = `${name}=; Path=/; Max-Age=0`;
}

function authStorageKeySuffix() {
  const ref = (window.SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];
  return ref ? `sb-${ref}-auth-token` : "sb-auth-token";
}

function persistPkceVerifierToCookie() {
  const suffix = authStorageKeySuffix();
  const key = `${suffix}-code-verifier`;
  const value =
    localStorage.getItem(key)
    ?? sessionStorage.getItem(key)
    ?? readCookie(PKCE_COOKIE);
  if (value) writeCookie(PKCE_COOKIE, value);
}

function restorePkceVerifierFromCookie() {
  const cookieVal = readCookie(PKCE_COOKIE);
  if (!cookieVal) return;
  const key = `${authStorageKeySuffix()}-code-verifier`;
  if (!localStorage.getItem(key)) localStorage.setItem(key, cookieVal);
  if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, cookieVal);
}

function createAuthStorage() {
  const pkceSuffix = "-code-verifier";
  return {
    getItem(key) {
      const fromLocal = localStorage.getItem(key);
      if (fromLocal != null) return fromLocal;
      const fromSession = sessionStorage.getItem(key);
      if (fromSession != null) return fromSession;
      if (key.endsWith(pkceSuffix)) return readCookie(PKCE_COOKIE);
      return null;
    },
    setItem(key, value) {
      localStorage.setItem(key, value);
      try {
        sessionStorage.setItem(key, value);
      } catch (_) {
        /* sessionStorage can fail in private mode */
      }
      if (key.endsWith(pkceSuffix)) writeCookie(PKCE_COOKIE, value);
    },
    removeItem(key) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      if (key.endsWith(pkceSuffix)) deleteCookie(PKCE_COOKIE);
    },
  };
}

async function waitForAuthSession(client, timeoutMs = 5000) {
  if (!client) return null;

  const { data: { session: initial } } = await client.auth.getSession();
  if (initial?.user?.id) return initial;

  return new Promise((resolve) => {
    let finished = false;
    let subscription = null;
    const timer = setTimeout(() => finish(null), timeoutMs);

    const finish = (session) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(session?.user?.id ? session : null);
    };

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (
        session?.user?.id
        && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
      ) {
        finish(session);
      }
    });
    subscription = data.subscription;

    client.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) finish(session);
    });
  });
}

async function ensureWriteSession(client) {
  if (!client) throw new Error("Supabase nicht konfiguriert.");

  let { data: { session } } = await client.auth.getSession();
  if (!session?.refresh_token) {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.id) throw new Error("Bitte erneut anmelden.");
    ({ data: { session } } = await client.auth.getSession());
  }

  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const tokenStale = !session?.access_token || expiresAtMs < Date.now() + 60_000;
  if (tokenStale && session?.refresh_token) {
    const { data: refreshed, error } = await client.auth.refreshSession(session);
    if (error || !refreshed.session?.access_token) {
      throw new Error("Sitzung abgelaufen – bitte erneut anmelden.");
    }
    session = refreshed.session;
  }

  const { data: { user: verified }, error: verifyError } = await client.auth.getUser();
  if (verifyError || !verified?.id) {
    throw new Error("Anmeldung ungültig – bitte erneut anmelden.");
  }

  return { session, user: verified };
}

async function requireAuthUser(client) {
  const { user } = await ensureWriteSession(client);
  return user;
}

function redirectToTrouvoLogin(returnPath) {
  const path = returnPath || `${window.location.pathname}${window.location.search}`;
  sessionStorage.setItem("auth_return_to", path);
  const next = encodeURIComponent(path);
  window.location.replace(`/trouvo/?next=${next}`);
}

function formatDbError(message) {
  if (!message) return "Etwas ist schiefgelaufen.";
  if (message.includes("row-level security") || message.includes("Not authenticated")) {
    return "Keine Berechtigung – bitte abmelden und erneut anmelden.";
  }
  return message;
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
    restorePkceVerifierFromCookie();
    const { data: { session: existing } } = await client.auth.getSession();
    if (!existing) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      window.history.replaceState({}, document.title, window.location.pathname);
      deleteCookie(PKCE_COOKIE);
      if (error) return { error: error.message };
    } else {
      window.history.replaceState({}, document.title, window.location.pathname);
      deleteCookie(PKCE_COOKIE);
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

function getEventLastDate(event) {
  return event.end_date || event.event_date;
}

function isMultiDayEvent(event) {
  return !!(event.end_date && event.end_date !== event.event_date);
}

function listEventDates(event) {
  const dates = [];
  let cur = event.event_date;
  const last = getEventLastDate(event);
  if (!cur) return dates;
  while (cur <= last) {
    dates.push(cur);
    const d = new Date(`${cur}T12:00:00`);
    d.setDate(d.getDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return dates;
}

function formatEventDateRange(event, short = false) {
  const startDate = new Date(event.event_date);
  const lastDate = new Date(getEventLastDate(event));
  const start = (event.start_time || "").slice(0, 5);
  const end = (event.end_time || "").slice(0, 5);
  const fmt = short
    ? { weekday: "short", day: "numeric", month: "long", year: "numeric" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric" };

  if (!isMultiDayEvent(event)) {
    const dateStr = startDate.toLocaleDateString("de-CH", fmt);
    if (event.open_end) return `${dateStr}, ab ${start} Uhr`;
    return end ? `${dateStr}, ${start}–${end} Uhr` : `${dateStr}, ${start} Uhr`;
  }

  const startStr = startDate.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
  const endStr = lastDate.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
  const range = `${startStr} – ${endStr}`;
  if (event.open_end) return `${range}, ab ${start} Uhr`;
  return end ? `${range}, ${start}–${end} Uhr` : `${range}, ab ${start} Uhr`;
}

function formatTimetableDay(isoDate) {
  if (!isoDate) return "";
  return new Date(isoDate).toLocaleDateString("de-CH", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function getEventDateTimes(event) {
  const start = new Date(`${event.event_date}T${(event.start_time || "00:00").slice(0, 8)}`);
  const lastDate = getEventLastDate(event);
  let end;
  if (event.open_end) {
    end = new Date(`${lastDate}T23:59:59`);
  } else if (event.end_time) {
    end = new Date(`${lastDate}T${event.end_time.slice(0, 8)}`);
    if (!isMultiDayEvent(event) && end <= start) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  return { start, end };
}

function isEventPast(event) {
  const { end } = getEventDateTimes(event);
  return end < new Date();
}

function computeEventCoverExpiry(event) {
  const { end } = getEventDateTimes(event);
  const expires = new Date(end.getTime());
  expires.setDate(expires.getDate() + 14);
  return expires.toISOString();
}

function renderEventCover(event) {
  if (!event.cover_image_path) return "";
  if (event.cover_image_expires_at && new Date(event.cover_image_expires_at) < new Date()) return "";
  const url = storagePublicUrl("event-covers", event.cover_image_path);
  if (!url) return "";
  return `<div class="guest-event-cover"><img src="${escapeHtml(url)}" alt="${escapeHtml(event.name || "Event")}"></div>`;
}

async function maybePurgeExpiredCovers(client) {
  const key = "trouvo_covers_purged_at";
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last < 3600000) return;
  try {
    await client.rpc("purge_expired_event_covers");
    sessionStorage.setItem(key, String(Date.now()));
  } catch (_) {
    /* ignore – optional cleanup */
  }
}

function eventSortTimestamp(event) {
  return getEventDateTimes(event).start.getTime();
}

function renderEventPhotosSection(event) {
  const url = event.photos_upload_url?.trim() || event.photos_gallery_url?.trim();
  if (!url) return "";

  return `
    <section class="guest-section event-photos-section event-photos-active">
      <h2>Event-Fotos</h2>
      <p>Fotos hochladen oder ansehen – über den Link des Veranstalters.</p>
      <div class="event-photos-actions">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn btn-primary">Zu den Event-Fotos</a>
      </div>
    </section>`;
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
