import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = normalizeFromEmail(Deno.env.get("TROUVO_FROM_EMAIL"));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { registration_id: registrationId } = await req.json();
    if (!registrationId) {
      return json({ error: "registration_id fehlt" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reg, error: regErr } = await supabase
      .from("event_registrations")
      .select("id, guest_name, guest_email, party_size, event_id")
      .eq("id", registrationId)
      .single();

    if (regErr || !reg?.guest_email) {
      return json({ skipped: true, reason: "no_email" }, 200);
    }

    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("name, event_date, start_time, location, send_registration_email")
      .eq("id", reg.event_id)
      .single();

    if (evErr || !event?.send_registration_email) {
      return json({ skipped: true, reason: "disabled" }, 200);
    }

    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY nicht gesetzt" }, 503);
    }

    const dateStr = event.event_date
      ? new Date(`${event.event_date}T12:00:00`).toLocaleDateString("de-CH")
      : "";
    const timeStr = event.start_time ? String(event.start_time).slice(0, 5) : "";
    const partyNote = reg.party_size > 1 ? " (inkl. Begleitung)" : "";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [reg.guest_email],
        subject: `Anmeldung bestätigt: ${event.name}`,
        html: `
          <p>Hallo ${escapeHtml(reg.guest_name)}${partyNote},</p>
          <p>deine Anmeldung für <strong>${escapeHtml(event.name)}</strong> ist eingegangen.</p>
          ${dateStr ? `<p>Datum: ${dateStr}${timeStr ? `, ${timeStr}` : ""}</p>` : ""}
          ${event.location ? `<p>Ort: ${escapeHtml(event.location)}</p>` : ""}
          <p>Freundliche Grüsse<br>Trouvo</p>
        `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return json({ error: body || "Resend-Fehler" }, 502);
    }

    return json({ sent: true }, 200);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeFromEmail(raw: string | undefined) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "Trouvo <onboarding@resend.dev>";
  if (trimmed.includes("<")) return trimmed;
  return `Trouvo <${trimmed}>`;
}
