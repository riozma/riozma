import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Schickt manuelzeltner@gmail.com eine Mail, wenn jemand Zugriff auf den Stammbaum anfragt.
// Empfänger ist fest; der Aufrufer muss angemeldet sein und kann nur seine eigene Anfrage melden (einmalig).
const ADMIN_EMAIL = "manuelzeltner@gmail.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("TROUVO_FROM_EMAIL") || "Stammbaum <onboarding@resend.dev>";
const CORS = {
  "Access-Control-Allow-Origin": "https://riozma.ch",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: "Anmeldung erforderlich" }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row } = await admin.from("stammbaum_access").select("*")
      .eq("user_id", u.user.id).eq("status", "pending").is("notified_at", null).maybeSingle();
    if (!row) return json({ skipped: true });
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY nicht gesetzt" }, 503);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        subject: `Stammbaum: Freigabeanfrage von ${row.name}`,
        html: `<p><strong>${esc(row.name)}</strong> (${esc(row.email)}) möchte den Stammbaum sehen.</p>
          ${row.message ? `<p>Nachricht: ${esc(row.message)}</p>` : ""}
          <p><a href="https://riozma.ch/stammbaum/">Jetzt freigeben oder ablehnen</a> (Anmelden mit ${ADMIN_EMAIL})</p>`,
      }),
    });
    if (!res.ok) return json({ error: (await res.text()) || "Resend-Fehler" }, 502);
    await admin.from("stammbaum_access").update({ notified_at: new Date().toISOString() }).eq("user_id", row.user_id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function esc(s: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}
