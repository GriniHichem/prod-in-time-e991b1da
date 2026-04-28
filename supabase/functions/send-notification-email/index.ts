import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface InvokeBody {
  notification_id?: string;
  recipient_email?: string;
  subject?: string;
  html?: string;
  text?: string;
  dedup_key?: string;
}

async function loadSettings(admin: any): Promise<Record<string,string>> {
  const { data } = await admin.from("app_settings").select("key, value").in("key", [
    "smtp_host","smtp_port","smtp_user","smtp_password","smtp_secure",
    "smtp_from_email","smtp_from_name","app_name","support_email","notif_email_enabled",
  ]);
  const cfg: Record<string,string> = {};
  for (const s of data || []) cfg[s.key] = s.value || "";
  return cfg;
}

async function sendSMTP(cfg: Record<string,string>, to: string, subject: string, html: string, text?: string) {
  const port = parseInt(cfg.smtp_port || "587");
  const secure = (cfg.smtp_secure || "tls").toLowerCase();
  const tls = secure === "ssl" || port === 465;
  const client = new SMTPClient({
    connection: {
      hostname: cfg.smtp_host, port, tls,
      auth: { username: cfg.smtp_user, password: cfg.smtp_password },
    },
  });
  const fromName = cfg.smtp_from_name || cfg.app_name || "Notifications";
  const fromEmail = cfg.smtp_from_email || cfg.smtp_user;
  await client.send({
    from: `${fromName} <${fromEmail}>`,
    to, subject, html,
    content: text || subject,
  } as any);
  await client.close();
}

function renderTemplate(cfg: Record<string,string>, n: { title: string; message: string; severity: string; action_url?: string | null }, baseUrl: string): string {
  const appName = cfg.app_name || "Application";
  const support = cfg.support_email || cfg.smtp_from_email || cfg.smtp_user || "";
  const sevColor = ({ critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#6b7280", info: "#2563eb" } as Record<string,string>)[n.severity] || "#2563eb";
  const link = n.action_url ? `${baseUrl}${n.action_url}` : null;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;margin:0">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5">
      <div style="background:#0f172a;color:#fff;padding:16px 24px;font-size:18px;font-weight:600">${appName}</div>
      <div style="padding:24px;color:#1f2937">
        <div style="display:inline-block;background:${sevColor}15;color:${sevColor};border:1px solid ${sevColor}40;padding:4px 10px;border-radius:4px;font-size:11px;text-transform:uppercase;font-weight:600;margin-bottom:12px">${n.severity}</div>
        <h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(n.title)}</h2>
        <p style="margin:0 0 16px;line-height:1.6;color:#374151">${escapeHtml(n.message || "")}</p>
        ${link ? `<a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">Ouvrir dans l'application</a>` : ""}
      </div>
      <div style="background:#f9fafb;color:#6b7280;padding:12px 24px;font-size:12px;border-top:1px solid #e5e5e5">
        Notification automatique de ${appName}.${support ? ` Support : <a href="mailto:${support}" style="color:#6b7280">${support}</a>` : ""}
      </div>
    </div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" } as Record<string,string>)[c]);
}

async function resolveRecipients(admin: any, notification: any): Promise<{ user_id: string | null; email: string }[]> {
  const out: { user_id: string | null; email: string }[] = [];
  if (notification.recipient_user_id) {
    const { data: u } = await admin.auth.admin.getUserById(notification.recipient_user_id);
    if (u?.user?.email) out.push({ user_id: notification.recipient_user_id, email: u.user.email });
  } else if (notification.recipient_role) {
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", notification.recipient_role);
    for (const row of roleRows || []) {
      const { data: u } = await admin.auth.admin.getUserById(row.user_id);
      if (u?.user?.email) out.push({ user_id: row.user_id, email: u.user.email });
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth: user JWT OR cron secret OR service role bearer
    const authHeader = req.headers.get("Authorization") || "";
    const cronSecret = req.headers.get("x-cron-secret") || "";
    let authorized = false;

    if (cronSecret) {
      const { data: row } = await admin.from("app_settings").select("value").eq("key", "cron_secret").maybeSingle();
      if (row?.value && row.value === cronSecret) authorized = true;
    }
    if (!authorized && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (token === serviceKey) {
        authorized = true;
      } else {
        const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
        const { data: { user } } = await userClient.auth.getUser();
        if (user) authorized = true;
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as InvokeBody;
    const cfg = await loadSettings(admin);

    if ((cfg.notif_email_enabled || "true") !== "true") {
      await admin.from("notification_email_log").insert({
        notification_id: body.notification_id ?? null,
        recipient_email: body.recipient_email ?? "",
        subject: body.subject ?? "",
        status: "skipped",
        error: "notif_email_enabled=false",
        dedup_key: body.dedup_key ?? null,
      });
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_password) {
      return new Response(JSON.stringify({ error: "SMTP non configuré" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = (req.headers.get("origin") || "").replace(/\/$/, "");

    // Mode 1: from notification_id
    if (body.notification_id) {
      const { data: notif } = await admin.from("notifications").select("*").eq("id", body.notification_id).maybeSingle();
      if (!notif) {
        return new Response(JSON.stringify({ error: "Notification introuvable" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify rule has email channel
      if (notif.rule_id) {
        const { data: rule } = await admin.from("notification_rules").select("channels").eq("id", notif.rule_id).maybeSingle();
        const channels = Array.isArray(rule?.channels) ? rule!.channels : [];
        if (!channels.includes("email")) {
          return new Response(JSON.stringify({ success: true, skipped: true, reason: "rule has no email channel" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const recipients = await resolveRecipients(admin, notif);
      const subject = `[${cfg.app_name || "Notif"}] ${notif.title}`;
      const html = renderTemplate(cfg, notif, baseUrl);
      const dedupKey = body.dedup_key || `notif:${notif.id}`;

      const results: any[] = [];
      for (const r of recipients) {
        // Dedup last 24h
        const since = new Date(Date.now() - 24*3600*1000).toISOString();
        const { data: dup } = await admin.from("notification_email_log")
          .select("id").eq("dedup_key", dedupKey).eq("recipient_email", r.email)
          .eq("status", "sent").gte("created_at", since).limit(1);
        if (dup && dup.length > 0) {
          results.push({ to: r.email, status: "skipped", reason: "dedup" });
          continue;
        }
        try {
          await sendSMTP(cfg, r.email, subject, html);
          await admin.from("notification_email_log").insert({
            notification_id: notif.id, recipient_email: r.email, recipient_user_id: r.user_id,
            subject, status: "sent", dedup_key: dedupKey, sent_at: new Date().toISOString(),
          });
          results.push({ to: r.email, status: "sent" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await admin.from("notification_email_log").insert({
            notification_id: notif.id, recipient_email: r.email, recipient_user_id: r.user_id,
            subject, status: "failed", error: msg, dedup_key: dedupKey,
          });
          results.push({ to: r.email, status: "failed", error: msg });
        }
      }
      return new Response(JSON.stringify({ success: true, results }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode 2: direct recipient_email
    if (body.recipient_email && body.subject) {
      const html = body.html || `<p>${escapeHtml(body.subject)}</p>`;
      try {
        await sendSMTP(cfg, body.recipient_email, body.subject, html, body.text);
        await admin.from("notification_email_log").insert({
          recipient_email: body.recipient_email, subject: body.subject,
          status: "sent", dedup_key: body.dedup_key ?? null, sent_at: new Date().toISOString(),
        });
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("notification_email_log").insert({
          recipient_email: body.recipient_email, subject: body.subject,
          status: "failed", error: msg, dedup_key: body.dedup_key ?? null,
        });
        return new Response(JSON.stringify({ error: msg }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "notification_id ou (recipient_email + subject) requis" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("send-notification-email error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
