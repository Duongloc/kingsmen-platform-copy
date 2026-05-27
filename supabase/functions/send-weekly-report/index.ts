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

      const today = new Date().toISOString().split('T')[0];
      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          
          <!-- Header -->
          <div style="background-color: #0e7356; color: #fff; padding: 20px;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">📘 BÁO CÁO NĂNG LỰC — KINGSMEN</h2>
            <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Báo cáo tuần • ${today}</p>
          </div>

          <div style="padding: 20px;">
            <p style="margin-top: 0; font-size: 14px; color: #333;">Xin chào <b>${profile.name}</b>,</p>
            
            <!-- 4 Cards -->
            <div style="display: flex; gap: 10px; margin-bottom: 25px;">
              <!-- Card 1 -->
              <div style="flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.3;">Bài thi<br/>đã làm</div>
                <div style="font-size: 22px; font-weight: bold; color: #0e7356;">${userQuizzes}</div>
              </div>
              
              <!-- Card 2 -->
              <div style="flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.3;">Điểm<br/>trung bình</div>
                <div style="font-size: 22px; font-weight: bold; color: #0d6efd;">${userAvgPct}%</div>
              </div>

              <!-- Card 3 -->
              <div style="flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.3;">Số bài<br/>công ty</div>
                <div style="font-size: 22px; font-weight: bold; color: #dc3545;">${totalCompanyQuizzes}</div>
              </div>

              <!-- Card 4 -->
              <div style="flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.3;">Điểm TB<br/>công ty</div>
                <div style="font-size: 22px; font-weight: bold; color: #fd7e14;">${companyAvgPct}%</div>
              </div>
            </div>

            <!-- Section 1 -->
            <h3 style="color: #0e7356; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🚨 Chi tiết cá nhân</h3>
            <div style="background: #fdf5e6; border-left: 3px solid #f5b041; padding: 10px; margin-bottom: 8px; border-radius: 4px; font-size: 13px; color: #333;">
              <b>Tài khoản:</b> ${profile.dept} ${profile.team ? ` - ${profile.team}` : ""}
            </div>
            <div style="background: ${userAvgPct >= 70 ? '#e8f6f0' : '#fdeded'}; border-left: 3px solid ${userAvgPct >= 70 ? '#0e7356' : '#e74c3c'}; padding: 10px; margin-bottom: 20px; border-radius: 4px; font-size: 13px; color: #333;">
              <b>Đánh giá:</b> ${userAvgPct >= 70 ? "Đạt chuẩn yêu cầu tuần này" : "Cần cố gắng cải thiện điểm số"}
            </div>

            <!-- Section 2 -->
            <h3 style="color: #0e7356; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🌐 Nhận xét chung</h3>
            <p style="font-size: 13px; color: #555; line-height: 1.5;">
              Tuần qua, toàn công ty đã hoàn thành <b>${totalCompanyQuizzes}</b> bài thi với điểm số trung bình là <b>${companyAvgPct}%</b>. Hãy tiếp tục duy trì thói quen học tập để nâng cao kỹ năng!
            </p>

            <!-- Footer -->
            <p style="font-size: 12px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
              Kingsmen Training Platform<br/>
              <i>Email tự động, vui lòng không phản hồi.</i>
            </p>
          </div>
        </div>
      `;

      try {
        await transporter.sendMail({
          from: `"Kingsmen Training" <${gmailUser}>`,
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
