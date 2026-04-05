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
      return new Response(JSON.stringify({ error: "Forbidden: Only admins can update users" }), {
        status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 3. Parse body ──
    const body = await req.json();
    const { targetUserId, newEmpId } = body;

    if (!targetUserId || !newEmpId) {
      return new Response(JSON.stringify({ error: "Missing targetUserId or newEmpId" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Service role key not configured" }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 4. Update auth email using service role ──
    const newEmail = newEmpId.trim().toLowerCase() + "@kingsmen.internal";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      email: newEmail,
    });

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to update email: " + updateErr.message }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, newEmail }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error: " + err.message }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
