import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Utilisateur non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const to = body?.to as string | undefined;
    if (!to) {
      return new Response(JSON.stringify({ error: "Destinataire (to) requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "smtp_host","smtp_port","smtp_user","smtp_password",
        "smtp_from_email","smtp_from_name","smtp_secure",
        "app_name","support_email",
      ]);

    const cfg: Record<string, string> = {};
    for (const s of settings || []) cfg[s.key] = s.value || "";

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_password) {
      return new Response(JSON.stringify({ error: "Configuration SMTP incomplète (host, user, password)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const port = parseInt(cfg.smtp_port || "587");
    const secure = (cfg.smtp_secure || "tls").toLowerCase();
    const tls = secure === "ssl" || port === 465;

    const client = new SMTPClient({
      connection: {
        hostname: cfg.smtp_host,
        port,
        tls,
        auth: { username: cfg.smtp_user, password: cfg.smtp_password },
      },
    });

    const fromName = cfg.smtp_from_name || cfg.app_name || "Application";
    const fromEmail = cfg.smtp_from_email || cfg.smtp_user;
    const appName = cfg.app_name || "Application";
    const support = cfg.support_email || fromEmail;

    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5">
        <div style="background:#0f172a;color:#fff;padding:16px 24px;font-size:18px;font-weight:600">${appName}</div>
        <div style="padding:24px;color:#1f2937">
          <h2 style="margin:0 0 12px;font-size:20px">Email de test SMTP</h2>
          <p style="margin:0 0 12px;line-height:1.5">Cet email confirme que la configuration SMTP de <b>${appName}</b> fonctionne correctement.</p>
          <p style="margin:0;color:#6b7280;font-size:13px">Envoyé le ${new Date().toLocaleString("fr-FR")} via ${cfg.smtp_host}:${port} (${secure}).</p>
        </div>
        <div style="background:#f9fafb;color:#6b7280;padding:12px 24px;font-size:12px;border-top:1px solid #e5e5e5">Support : ${support}</div>
      </div></body></html>`;

    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject: `[${appName}] Test de configuration SMTP`,
      html,
      content: "Email de test SMTP - configuration validée.",
    } as any);
    await client.close();

    await admin.from("audit_logs").insert({
      action: "send_test_email",
      table_name: "emails",
      user_id: user.id,
      new_values: { to, host: cfg.smtp_host, port, secure },
    });

    return new Response(JSON.stringify({ success: true, message: `Email de test envoyé à ${to}` }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("send-test-email error:", msg);
    return new Response(JSON.stringify({ error: `Échec de l'envoi: ${msg}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
