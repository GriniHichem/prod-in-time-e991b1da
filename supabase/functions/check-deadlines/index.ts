import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Auth: cron secret OR admin JWT
  const cronSecret = req.headers.get("x-cron-secret") || "";
  const authHeader = req.headers.get("Authorization") || "";
  let authorized = false;
  const { data: secretRow } = await admin.from("app_settings").select("value").eq("key", "cron_secret").maybeSingle();
  if (cronSecret && secretRow?.value && cronSecret === secretRow.value) authorized = true;
  if (!authorized && authHeader) {
    const token = authHeader.replace("Bearer ", "");
    if (token === serviceKey) authorized = true;
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: settings } = await admin.from("app_settings").select("key, value")
    .in("key", ["notif_rappel_jours_defaut","notif_email_enabled"]);
  const cfg: Record<string,string> = {};
  for (const s of settings || []) cfg[s.key] = s.value || "";
  const N = Math.max(1, Math.min(30, parseInt(cfg.notif_rappel_jours_defaut || "3")));

  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = new Date(today.getTime() + N * 24*3600*1000);
  const todayStr = today.toISOString().slice(0,10);
  const horizonStr = horizon.toISOString().slice(0,10);

  const summary = { scanned: 0, notifications_created: 0, errors: [] as string[] };

  async function emit(params: {
    module: string; event_type: string; entity_type: string; entity_id: string;
    entity_code?: string | null; entity_label?: string | null;
    title: string; message: string; severity: string; recipient_role: string;
  }) {
    summary.scanned++;
    const dedupKey = `deadline:${params.entity_type}:${params.entity_id}:${params.event_type}:${todayStr}`;
    // Skip if already a notification today
    const { data: dup } = await admin.from("notifications")
      .select("id").eq("deduplication_key", dedupKey).limit(1);
    if (dup && dup.length > 0) return;

    // Find a matching active rule with email channel
    const { data: rules } = await admin.from("notification_rules")
      .select("*").eq("is_active", true).eq("module", params.module).eq("event_type", params.event_type);

    if (!rules || rules.length === 0) return;

    for (const r of rules) {
      const targetRoles: string[] = Array.isArray(r.target_roles) ? r.target_roles : [];
      const recipients = targetRoles.length ? targetRoles : [params.recipient_role];
      for (const role of recipients) {
        const { data: ins, error } = await admin.from("notifications").insert({
          title: params.title,
          message: params.message,
          notification_type: params.event_type,
          module: params.module,
          entity_type: params.entity_type,
          entity_id: params.entity_id,
          entity_code: params.entity_code ?? null,
          entity_label: params.entity_label ?? null,
          severity: params.severity,
          recipient_role: role,
          source: "cron",
          deduplication_key: dedupKey,
          rule_id: r.id,
          is_critical: r.is_critical || params.severity === "critical",
        }).select("id").maybeSingle();
        if (error) { summary.errors.push(error.message); continue; }
        summary.notifications_created++;

        const channels: string[] = Array.isArray(r.channels) ? r.channels : [];
        if (channels.includes("email") && (cfg.notif_email_enabled || "true") === "true" && ins?.id) {
          // Fire-and-forget invoke send-notification-email
          fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ notification_id: ins.id, dedup_key: dedupKey }),
          }).catch((e) => console.warn("invoke send-notification-email failed", e));
        }
      }
    }
  }

  try {
    // Tickets with échéance
    const { data: tickets } = await admin.from("tickets")
      .select("id, numero, titre, echeance, statut")
      .not("statut", "in", "(resolu,ferme)")
      .not("echeance", "is", null)
      .lte("echeance", horizonStr);
    for (const t of tickets || []) {
      const overdue = t.echeance < todayStr;
      await emit({
        module: "tickets",
        event_type: overdue ? "ticket_overdue" : "ticket_due_soon",
        entity_type: "ticket", entity_id: t.id,
        entity_code: t.numero, entity_label: t.titre,
        title: overdue ? `Ticket en retard : ${t.numero}` : `Ticket à échéance : ${t.numero}`,
        message: `${t.titre} — échéance ${t.echeance}`,
        severity: overdue ? "high" : "medium",
        recipient_role: "resp_maintenance",
      });
    }

    // Preventif with next_due_date
    const { data: prev } = await admin.from("preventive_plans")
      .select("id, code, titre, next_due_date, is_active")
      .eq("is_active", true)
      .not("next_due_date", "is", null)
      .lte("next_due_date", horizonStr);
    for (const p of prev || []) {
      const overdue = p.next_due_date < todayStr;
      await emit({
        module: "preventif",
        event_type: overdue ? "preventive_late" : "preventive_due",
        entity_type: "preventif", entity_id: p.id,
        entity_code: p.code, entity_label: p.titre,
        title: overdue ? `Préventif en retard : ${p.code || p.titre}` : `Préventif à échéance : ${p.code || p.titre}`,
        message: `${p.titre} — échéance ${p.next_due_date}`,
        severity: overdue ? "high" : "medium",
        recipient_role: "resp_maintenance",
      });
    }

    // OF with date_fin_prevue
    const { data: ofs } = await admin.from("ordres_fabrication")
      .select("id, numero, date_fin_prevue, statut")
      .not("statut", "in", "(termine,annule)")
      .not("date_fin_prevue", "is", null)
      .lte("date_fin_prevue", horizonStr);
    for (const o of ofs || []) {
      const overdue = o.date_fin_prevue < todayStr;
      await emit({
        module: "of",
        event_type: overdue ? "of_overdue" : "of_due_soon",
        entity_type: "of", entity_id: o.id,
        entity_code: o.numero, entity_label: o.numero,
        title: overdue ? `OF en retard : ${o.numero}` : `OF à échéance : ${o.numero}`,
        message: `Échéance prévue ${o.date_fin_prevue}`,
        severity: overdue ? "high" : "medium",
        recipient_role: "resp_production",
      });
    }
  } catch (e) {
    summary.errors.push(e instanceof Error ? e.message : String(e));
  }

  return new Response(JSON.stringify({ success: true, ...summary }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
