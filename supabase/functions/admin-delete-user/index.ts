// Edge function: delete a user as an admin.
// Self-hostable: uses VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token" }, 401);
    }

    // Caller identity
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: caller } = await callerClient.auth.getUser();
    if (!caller?.user) return json({ error: "Not authenticated" }, 401);

    // Service-role client for admin checks + deletion
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: caller.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const userId = body?.user_id;
    if (!userId || typeof userId !== "string") {
      return json({ error: "user_id required" }, 400);
    }
    if (userId === caller.user.id) {
      return json({ error: "Vous ne pouvez pas supprimer votre propre compte." }, 400);
    }

    // Capture profile snapshot for the audit trail before deletion.
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("first_name, last_name, poste")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    // Best-effort cleanup of related rows (cascade should handle these).
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("entity_images").delete().eq("entity_type", "user").eq("entity_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 400);

    const fullName = targetProfile
      ? `${targetProfile.first_name ?? ""} ${targetProfile.last_name ?? ""}`.trim()
      : userId;

    // Audit log
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", caller.user.id)
      .maybeSingle();

    await admin.from("audit_logs").insert({
      user_id: caller.user.id,
      user_email: caller.user.email ?? null,
      user_full_name: callerProfile
        ? `${callerProfile.first_name ?? ""} ${callerProfile.last_name ?? ""}`.trim()
        : null,
      action: "delete",
      action_type: "delete",
      action_label: "Suppression d'utilisateur",
      table_name: "profiles",
      record_id: userId,
      entity_type: "user",
      entity_id: userId,
      entity_label: fullName,
      module: "parametres",
      severity: "warning",
      description: `Suppression définitive de l'utilisateur ${fullName}`,
      old_values: {
        profile: targetProfile ?? null,
        roles: (targetRoles ?? []).map((r) => r.role),
      },
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
