// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Require a valid Supabase auth token ──────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized", detail: authError?.message || "Invalid token" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 2. Require active account — all active users may call this proxy ──────
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, emp_id, acc_role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.status !== "active") {
      return new Response(JSON.stringify({ error: "Account inactive" }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 3. Forward request to Anthropic ────────────────────────────────────
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured on server" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let clientBody;
    try {
      clientBody = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid request body: " + e.message }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 4. Enforce model and token limits server-side — admins get higher cap ─
    const ALLOWED_MODEL = "claude-sonnet-4-6";
    const isAdminOrDirector = profile.emp_id === "admin" || profile.acc_role === "director";
    // Admins/directors: 6000 tokens (quiz gen, knowledge AI, analysis)
    // Regular employees: 2000 tokens (essay grading only)
    const MAX_TOKENS_LIMIT = isAdminOrDirector ? 6000 : 2000;

    const safeBody = {
      ...clientBody,
      model: ALLOWED_MODEL,
      max_tokens: Math.min(
        typeof clientBody.max_tokens === "number" ? clientBody.max_tokens : MAX_TOKENS_LIMIT,
        MAX_TOKENS_LIMIT
      ),
    };

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(safeBody),
    });

    const data = await anthropicRes.json();

    return new Response(JSON.stringify(data), {
      status: anthropicRes.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error: " + err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
