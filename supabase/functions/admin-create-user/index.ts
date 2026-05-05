// Edge function: create a new user as an admin without logging the caller out.
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

    // Service-role client for admin checks + provisioning
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: caller.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const { email, password, first_name, last_name, poste, role } = body ?? {};
    if (!email || !password) return json({ error: "email & password required" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name, poste },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const newUserId = created.user!.id;

    // Ensure profile exists (trigger should have done it, but be safe)
    await admin.from("profiles").upsert(
      {
        user_id: newUserId,
        first_name: first_name ?? "",
        last_name: last_name ?? "",
        poste: poste ?? null,
      },
      { onConflict: "user_id" },
    );

    if (role) {
      const { error: roleErr } = await admin
        .from("user_roles")
        .insert({ user_id: newUserId, role });
      if (roleErr) {
        return json({ user_id: newUserId, warning: `User created, role failed: ${roleErr.message}` });
      }
    }

    return json({ user_id: newUserId, ok: true });
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
