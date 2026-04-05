// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    // ── 1. Verify caller is authenticated ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 2. Verify caller is admin or director ──
    const { data: callerProfile } = await supabaseUser
      .from("profiles")
      .select("emp_id, acc_role, status")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.status !== "active") {
      return new Response(JSON.stringify({ error: "Account inactive" }), {
        status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const isAdmin = callerProfile.emp_id === "admin" || callerProfile.acc_role === "director";
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Only admins can create users" }), {
        status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 3. Parse and validate body ──
    const body = await req.json();
    const { name, empId, dept, team, accRole, password } = body;

    if (!name || !empId || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields: name, empId, password" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Service role key not configured" }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const email = empId.trim().toLowerCase() + "@kingsmen.internal";

    // ── 4. Create auth user using service role (does NOT affect caller session) ──
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 5. Insert profile row ──
    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: newUser.user.id,
      name: name.trim(),
      emp_id: empId.trim(),
      dept: dept || "",
      team: team || "",
      acc_role: accRole || "employee",
      xp: 0,
      streak: 0,
      check_ins: [],
      read_lessons: [],
      path_progress: {},
      status: "active",
    });

    if (profileErr) {
      // Rollback: delete auth user if profile insert fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: "Profile error: " + profileErr.message }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error: " + err.message }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
