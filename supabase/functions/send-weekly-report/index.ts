import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    // We use the service key to bypass RLS for fetching data
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let body = {};
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        body = await req.json();
      }
    } catch (e) {}

    const isManual = body.manual === true;

    // ── 1. Authentication & Checks ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    if (isManual) {
      // Manually triggered from the dashboard -> Must be an admin
      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
      if (authErr || !user) throw new Error("Unauthorized caller");

      const { data: callerProfile } = await supabaseUser.from("profiles").select("emp_id, acc_role, status").eq("id", user.id).single();
      if (!callerProfile || callerProfile.status !== "active") throw new Error("Account inactive");
      
      const isAdmin = callerProfile.emp_id === "admin" || callerProfile.acc_role === "director";
      if (!isAdmin) throw new Error("Forbidden: Only admins can send reports manually");
    } else {
      // Automated -> Verify it is called securely (must use SERVICE_ROLE_KEY)
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (token !== supabaseServiceKey) {
        return new Response(JSON.stringify({ error: "Unauthorized: Automated triggers must use the Service Role Key" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      // Verify settings
      const { data: settingsRow } = await supabaseAdmin.from("settings").select("config").eq("id", 1).single();
      if (!settingsRow?.config?.autoWeeklyReportEnabled) {
        return new Response(JSON.stringify({ success: true, message: "Automated reports disabled in settings" }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
    }

    // ── 2. SMTP Configuration ──
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPass) {
      throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD is not configured in Supabase Secrets");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    // ── 3. Data Gathering ──
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isoDate = sevenDaysAgo.toISOString();

    // Get profiles that want the report
    const { data: targetProfiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, name, dept, team, real_email")
      .eq("status", "active")
      .eq("receive_weekly_report", true)
      .not("real_email", "is", null);

    if (pErr) throw new Error("Failed to fetch profiles: " + pErr.message);
    if (!targetProfiles || targetProfiles.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No users configured to receive reports", sentCount: 0 }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // Get all results in the past 7 days for global stats
    const { data: weeklyResults, error: rErr } = await supabaseAdmin
      .from("results")
      .select("emp_id, pct, passed, time_taken")
      .gte("created_at", isoDate);

    if (rErr) throw new Error("Failed to fetch results: " + rErr.message);

    const totalCompanyQuizzes = weeklyResults.length;
    const companyAvgPct = totalCompanyQuizzes > 0 ? Math.round(weeklyResults.reduce((sum, r) => sum + r.pct, 0) / totalCompanyQuizzes) : 0;

    // ── 4. Generate & Send Emails ──
    let sentCount = 0;

    for (const profile of targetProfiles) {
      if (!profile.real_email || !profile.real_email.includes("@")) continue;

      const userResults = weeklyResults.filter((r) => r.emp_id === profile.id);
      const userQuizzes = userResults.length;
      const userAvgPct = userQuizzes > 0 ? Math.round(userResults.reduce((sum, r) => sum + r.pct, 0) / userQuizzes) : 0;

      const htmlBody = `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #2196f3; text-align: center; border-bottom: 2px solid #2196f3; padding-bottom: 10px;">Báo Cáo Năng Lực Tuần</h2>
          <p>Xin chào <b>${profile.name}</b>,</p>
          <p>Đây là báo cáo hoạt động đào tạo của bạn trong 7 ngày qua trên nền tảng Kingsmen.</p>
          
          <div style="background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #555;">📊 Thành tích cá nhân</h3>
            <ul style="list-style: none; padding: 0;">
              <li>Tài khoản: ${profile.dept} ${profile.team ? ` - ${profile.team}` : ""}</li>
              <li>Số bài thi hoàn thành: <b>${userQuizzes}</b></li>
              <li>Điểm trung bình: <b style="color: ${userAvgPct >= 70 ? 'green' : 'red'};">${userAvgPct}%</b></li>
            </ul>
          </div>

          <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1565c0;">🌐 Tổng quan toàn công ty</h3>
            <ul style="list-style: none; padding: 0;">
              <li>Tổng số bài thi toàn công ty: <b>${totalCompanyQuizzes}</b></li>
              <li>Điểm trung bình toàn công ty: <b>${companyAvgPct}%</b></li>
            </ul>
          </div>

          <p style="font-size: 13px; color: #777; text-align: center; margin-top: 30px;">
            Kingsmen Training Platform <br/>
            <i>Email này được gửi tự động, vui lòng không phản hồi.</i>
          </p>
        </div>
      `;

      try {
        await transporter.sendMail({
          from: \`"Kingsmen Training" <\${gmailUser}>\`,
          to: profile.real_email,
          subject: "📊 Báo Cáo Năng Lực Tuần - Kingsmen",
          html: htmlBody,
        });
        sentCount++;
      } catch (sendErr) {
        console.error("Failed to send email to", profile.real_email, sendErr);
      }
    }

    return new Response(JSON.stringify({ success: true, sentCount }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error in send-weekly-report:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
