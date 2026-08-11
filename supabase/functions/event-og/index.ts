import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = Deno.env.get("TROUVO_SITE_URL") || "https://riozma.ch";

const BOT_UA = /facebookexternalhit|WhatsApp|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|SkypeUriPreview|Pinterest|redditbot|Google-InspectionTool/i;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const guestUrl = slug
    ? `${SITE_URL}/trouvo/e/?slug=${encodeURIComponent(slug)}`
    : `${SITE_URL}/trouvo/`;

  const userAgent = req.headers.get("user-agent") || "";
  const isBot = BOT_UA.test(userAgent);

  if (!slug || !isBot) {
    return Response.redirect(guestUrl, 302);
  }

  const event = await fetchEvent(slug);
  if (!event || !event.is_published) {
    return Response.redirect(guestUrl, 302);
  }

  const title = event.name || "Trouvo";
  const description = buildDescription(event);
  const imageUrl = event.cover_image_path
    ? `${SUPABASE_URL}/storage/v1/object/public/event-covers/${event.cover_image_path}`
    : "";

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(guestUrl)}">
${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ""}
<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ""}
<meta http-equiv="refresh" content="0; url=${escapeHtml(guestUrl)}">
</head>
<body></body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

async function fetchEvent(slug: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?slug=eq.${encodeURIComponent(slug)}&select=name,description,event_date,start_time,is_published,cover_image_path,cover_image_expires_at&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const event = rows?.[0];
  if (!event) return null;
  if (event.cover_image_expires_at && new Date(event.cover_image_expires_at) < new Date()) {
    event.cover_image_path = null;
  }
  return event;
}

function buildDescription(event: { description?: string; event_date?: string; start_time?: string }) {
  if (event.description) return event.description.slice(0, 200);
  const dateStr = event.event_date
    ? new Date(`${event.event_date}T12:00:00`).toLocaleDateString("de-CH")
    : "";
  const timeStr = event.start_time ? String(event.start_time).slice(0, 5) : "";
  return [dateStr, timeStr].filter(Boolean).join(", ") || "Anmeldung über Trouvo";
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
