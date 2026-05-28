import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

// ── HTML escape helper — prevents injection attacks in email body ──
const escapeHtml = (str: string): string =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// Restrict CORS to your domain. Set ALLOWED_ORIGIN in Supabase Secrets.
// Falls back to "*" if not configured (less secure — set this in production).
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const getCorsHeaders = (req: Request) => {
  // Use the request's Origin header (strip trailing slash) to avoid CORS mismatch
  const origin = (req.headers.get("Origin") || "").replace(/\/+$/, "");
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN === "*" ? (origin || "*") : ALLOWED_ORIGIN.replace(/\/+$/, ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

Deno.serve(async (req) => {
  const CORS_HEADERS = getCorsHeaders(req);
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

      // ── Rate limiting: enforce 1-hour cooldown between manual sends ──
      const { data: rlSettings } = await supabaseAdmin.from("settings").select("config").eq("id", 1).single();
      const lastSent = rlSettings?.config?.lastManualReportSentAt;
      if (lastSent) {
        const diffMs = Date.now() - new Date(lastSent).getTime();
        if (diffMs < 60 * 60 * 1000) {
          const minutesLeft = Math.ceil((60 * 60 * 1000 - diffMs) / 60000);
          return new Response(
            JSON.stringify({ error: `Report was sent recently. Please wait ${minutesLeft} more minute(s) before sending again.` }),
            { status: 429, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }
      }
    } else {
      // Automated -> Verify it is called securely (must use SERVICE_ROLE_KEY)
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      // Constant-time comparison to prevent timing attacks
      const enc = new TextEncoder();
      const tokenBytes = enc.encode(token);
      const keyBytes = enc.encode(supabaseServiceKey);
      let diff = tokenBytes.length ^ keyBytes.length;
      const maxLen = Math.max(tokenBytes.length, keyBytes.length);
      for (let i = 0; i < maxLen; i++) diff |= (tokenBytes[i] ?? 0) ^ (keyBytes[i] ?? 0);
      if (diff !== 0) {
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

    // ── 3. Fetch data ──
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isoDate = sevenDaysAgo.toISOString();

    // Get profiles that want the report (include streak, read_lessons for competency calc)
    const { data: targetProfiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, name, dept, team, real_email, streak, read_lessons")
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

    // Get total knowledge count for competency calc
    const { count: totalKnowledge } = await supabaseAdmin
      .from("knowledge")
      .select("id", { count: "exact", head: true });

    const totalCompanyQuizzes = weeklyResults.length;
    const companyAvgPct = totalCompanyQuizzes > 0 ? Math.round(weeklyResults.reduce((sum, r) => sum + r.pct, 0) / totalCompanyQuizzes) : 0;

    // ── Competency definitions (mirrored from frontend) ──
    const CORE_COMPETENCIES = [
      { id: "thinking", name: "Tư duy & Xử lý thông tin", icon: "🧠" },
      { id: "knowledge", name: "Hiểu công việc & Áp dụng kiến thức", icon: "📖" },
      { id: "problem", name: "Giải quyết vấn đề & Ra quyết định", icon: "🎯" },
      { id: "communication", name: "Giao tiếp & Phối hợp", icon: "🤝" },
      { id: "discipline", name: "Trách nhiệm, Kỷ luật & Tuân thủ", icon: "📋" },
      { id: "learning", name: "Học hỏi, Thích nghi & Cải tiến", icon: "🚀" },
    ];
    const POS_COMPETENCIES: Record<string, { id: string; name: string; icon: string }[]> = {
      "Kinh doanh": [{ id: "sales", name: "Kỹ năng bán hàng & Tư vấn", icon: "💼" }, { id: "customer", name: "Chăm sóc khách hàng", icon: "🎧" }],
      "Kỹ thuật": [{ id: "technical", name: "Chuyên môn kỹ thuật", icon: "🔧" }, { id: "quality", name: "Kiểm soát chất lượng", icon: "✅" }],
      "Marketing": [{ id: "creative", name: "Tư duy sáng tạo", icon: "🎨" }, { id: "digital", name: "Marketing số", icon: "📱" }],
      "Kho vận": [{ id: "logistics", name: "Quản lý kho & Logistics", icon: "📦" }, { id: "accuracy", name: "Độ chính xác", icon: "🎯" }],
      "Quản lý": [{ id: "leadership", name: "Lãnh đạo & Quản lý", icon: "👔" }, { id: "strategy", name: "Tư duy chiến lược", icon: "♟️" }],
      "CSKH": [{ id: "empathy", name: "Đồng cảm & Kiên nhẫn", icon: "💛" }, { id: "resolve", name: "Xử lý khiếu nại", icon: "🛡️" }],
    };

    const evalCompetency = (results: any[], streak: number, readCount: number, totalKn: number) => {
      const total = results.length;
      const avg = total > 0 ? results.reduce((s, r) => s + r.pct, 0) / total : 0;
      const passRate = total > 0 ? results.filter(r => r.passed).length / total * 100 : 0;
      const perfect = results.filter(r => r.pct === 100).length;
      const recent = results.slice(-5);
      const recentAvg = recent.length > 0 ? recent.reduce((s, r) => s + r.pct, 0) / recent.length : 0;
      const readPct = totalKn > 0 ? readCount / totalKn * 100 : 0;
      return {
        thinking: Math.min(100, Math.round(avg * 0.6 + (perfect > 0 ? 20 : 0) + (recentAvg > avg ? 20 : 0))),
        knowledge: Math.min(100, Math.round(readPct * 0.5 + avg * 0.3 + passRate * 0.2)),
        problem: Math.min(100, Math.round(avg * 0.4 + passRate * 0.3 + (recentAvg > 70 ? 30 : recentAvg * 0.3))),
        communication: Math.min(100, Math.round(passRate * 0.4 + (streak > 7 ? 30 : streak * 4) + (total > 5 ? 30 : total * 6))),
        discipline: Math.min(100, Math.round((streak > 14 ? 40 : streak * 3) + passRate * 0.3 + (total > 3 ? 30 : total * 10))),
        learning: Math.min(100, Math.round(readPct * 0.3 + (recentAvg - avg > 0 ? 30 : 10) + (streak > 7 ? 20 : streak * 3) + (total > 5 ? 20 : total * 4))),
      };
    };

    const getLevel = (score: number) => {
      if (score >= 85) return { label: "Xuất sắc", color: "#28a745" };
      if (score >= 70) return { label: "Tốt", color: "#0d6efd" };
      if (score >= 50) return { label: "Đạt", color: "#fd7e14" };
      return { label: "Cần cải thiện", color: "#dc3545" };
    };

    const IMPROVEMENT_ACTIONS: Record<string, string> = {
      thinking: "Làm thêm bài kiểm tra nâng cao, tập trung phân tích câu hỏi kỹ trước khi trả lời",
      knowledge: "Đọc hết tài liệu kiến thức, ôn lại các bài chưa đạt",
      problem: "Tập trung vào bài thi tình huống, phân tích kỹ từng phương án",
      discipline: "Duy trì đăng nhập hàng ngày, hoàn thành bài kiểm tra đúng hạn",
      learning: "Chủ động học bài mới, thi lại bài chưa đạt để cải thiện điểm",
      communication: "Tiếp tục rèn luyện và thực hành thường xuyên",
    };

    // ── 4. Generate & Send Emails ──
    let sentCount = 0;

    for (const profile of targetProfiles) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!profile.real_email || !emailRegex.test(profile.real_email)) continue;

      // Weekly stats
      const userWeeklyResults = weeklyResults.filter((r) => r.emp_id === profile.id);
      const userQuizzes = userWeeklyResults.length;
      const userAvgPct = userQuizzes > 0 ? Math.round(userWeeklyResults.reduce((sum, r) => sum + r.pct, 0) / userQuizzes) : 0;

      // Fetch ALL results for this user (for competency evaluation)
      const { data: allUserResults } = await supabaseAdmin
        .from("results")
        .select("pct, passed")
        .eq("emp_id", profile.id)
        .order("created_at", { ascending: true });

      const userAllResults = allUserResults || [];
      const streak = profile.streak || 0;
      const readCount = (profile.read_lessons || []).length;
      const scores = evalCompetency(userAllResults, streak, readCount, totalKnowledge || 0);

      // Build competency bar HTML (table-based for email compatibility)
      const renderBar = (icon: string, name: string, score: number) => {
        const lv = getLevel(score);
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 14px;">
          <tr>
            <td style="font-size: 13px; color: #333; font-weight: 600; padding-bottom: 4px;">${icon} ${name}</td>
            <td align="right" style="font-size: 12px; font-weight: 700; color: ${lv.color}; padding-bottom: 4px; white-space: nowrap;">${score}% · ${lv.label}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #e9ecef; border-radius: 6px;">
                <tr><td style="width: ${score}%; height: 8px; background: ${lv.color}; border-radius: 6px; font-size: 0; line-height: 0;">&nbsp;</td><td style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>`;
      };

      const coreCompHTML = CORE_COMPETENCIES.map(c => renderBar(c.icon, c.name, (scores as any)[c.id] || 0)).join("");

      const posComps = POS_COMPETENCIES[profile.dept] || [];
      const posCompHTML = posComps.length > 0
        ? `<h3 style="color: #0e7356; font-size: 14px; margin: 24px 0 12px 0; border-bottom: 2px solid #e8f5e9; padding-bottom: 6px;">📌 Năng lực theo vị trí (${escapeHtml(profile.dept)})</h3>` +
          posComps.map(c => renderBar(c.icon, c.name, (scores as any)[c.id] || 0)).join("")
        : "";

      // Build improvement suggestions
      const allComps = [...CORE_COMPETENCIES, ...posComps];
      const sortedScores = Object.entries(scores).sort((a, b) => (a[1] as number) - (b[1] as number));
      const improvements = sortedScores
        .filter(([, score]) => (score as number) < 70)
        .slice(0, 3)
        .map(([id, score]) => {
          const comp = allComps.find(c => c.id === id);
          const action = IMPROVEMENT_ACTIONS[id] || "Tiếp tục rèn luyện và thực hành thường xuyên";
          const priority = (score as number) < 50 ? "Cao" : "Trung bình";
          return { name: comp?.name || id, action, priority };
        });

      const improvementHTML = improvements.length > 0
        ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; margin-top: 20px;">
            <tr><td style="padding: 16px;">
              <h3 style="color: #e65100; font-size: 14px; margin: 0 0 12px 0;">💡 Đề xuất cải thiện</h3>
              ${improvements.map(s => `
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom: 1px solid #fff3cd; margin-bottom: 8px;">
                  <tr><td style="padding: 6px 0 8px 0;">
                    <span style="display: inline-block; font-size: 10px; padding: 3px 10px; border-radius: 4px; font-weight: 700; color: #fff; background: ${s.priority === "Cao" ? "#dc3545" : "#fd7e14"}; margin-right: 8px; vertical-align: middle;">${s.priority}</span>
                    <b style="font-size: 13px; color: #333; vertical-align: middle;">${s.name}</b>
                    <div style="font-size: 12px; color: #666; margin-top: 4px; padding-left: 2px;">${s.action}</div>
                  </td></tr>
                </table>
              `).join("")}
            </td></tr>
          </table>`
        : "";

      // Compute overall avg score
      const scoreValues = Object.values(scores) as number[];
      const avgCompScore = scoreValues.length > 0 ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) : 0;
      const avgLv = getLevel(avgCompScore);

      const today = new Date().toISOString().split('T')[0];

      // Helper for stat card (table cell)
      const statCard = (label: string, value: string, color: string) =>
        `<td width="25%" align="center" style="padding: 4px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e0e0e0; border-radius: 8px;">
            <tr><td align="center" style="padding: 14px 6px 4px 6px; font-size: 11px; color: #888; line-height: 1.3;">${label}</td></tr>
            <tr><td align="center" style="padding: 2px 6px 14px 6px; font-size: 22px; font-weight: bold; color: ${color};">${value}</td></tr>
          </table>
        </td>`;

      const htmlBody = `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
          <tr><td>
            <!-- Outer container -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #dadce0; border-radius: 8px; overflow: hidden;">
              
              <!-- Header -->
              <tr>
                <td style="background-color: #0e7356; padding: 20px 24px;">
                  <h2 style="margin: 0; font-size: 17px; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">📘 BÁO CÁO NĂNG LỰC — KINGSMEN</h2>
                  <p style="margin: 6px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.85);">Báo cáo tuần · ${today}</p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 24px;">

                  <!-- Greeting -->
                  <p style="margin: 0 0 20px 0; font-size: 14px; color: #333;">Xin chào <b>${escapeHtml(profile.name)}</b>,</p>

                  <!-- 4 Stat Cards -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                    <tr>
                      ${statCard("Bài thi<br/>tuần này", String(userQuizzes), "#0e7356")}
                      ${statCard("Điểm TB<br/>tuần này", userAvgPct + "%", "#0d6efd")}
                      ${statCard("Năng lực<br/>tổng hợp", avgCompScore + "%", avgLv.color)}
                      ${statCard("Điểm TB<br/>công ty", companyAvgPct + "%", "#fd7e14")}
                    </tr>
                  </table>

                  <!-- Core Competencies Section -->
                  <h3 style="color: #0e7356; font-size: 14px; margin: 0 0 14px 0; border-bottom: 2px solid #e8f5e9; padding-bottom: 6px;">🧠 Năng lực cốt lõi (6 nhóm)</h3>
                  ${coreCompHTML}

                  <!-- Position Competencies -->
                  ${posCompHTML}

                  <!-- Improvement Suggestions -->
                  ${improvementHTML}

                  <!-- Company Summary -->
                  <h3 style="color: #0e7356; font-size: 14px; margin: 24px 0 10px 0; border-bottom: 2px solid #e8f5e9; padding-bottom: 6px;">🌐 Tổng quan công ty tuần qua</h3>
                  <p style="font-size: 13px; color: #555; line-height: 1.6; margin: 0;">
                    Toàn công ty đã hoàn thành <b>${totalCompanyQuizzes}</b> bài thi với điểm số trung bình là <b>${companyAvgPct}%</b>. Hãy tiếp tục duy trì thói quen học tập để nâng cao kỹ năng!
                  </p>

                  <!-- Footer -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 28px; border-top: 1px solid #eee;">
                    <tr><td align="center" style="padding-top: 16px;">
                      <p style="font-size: 11px; color: #999; margin: 0;">Kingsmen Training Platform<br/><i>Email tự động, vui lòng không phản hồi.</i></p>
                    </td></tr>
                  </table>

                </td>
              </tr>
            </table>
          </td></tr>
        </table>
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

    // Update rate-limit timestamp in settings when manually triggered
    if (isManual && sentCount > 0) {
      try {
        const { data: currentCfg } = await supabaseAdmin.from("settings").select("config").eq("id", 1).single();
        await supabaseAdmin.from("settings").update({
          config: { ...(currentCfg?.config || {}), lastManualReportSentAt: new Date().toISOString() },
        }).eq("id", 1);
      } catch (updateErr) {
        console.error("Failed to update lastManualReportSentAt:", updateErr);
      }
    }

    return new Response(JSON.stringify({ success: true, sentCount }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error in send-weekly-report:", err);
    return new Response(JSON.stringify({ error: "Internal server error. Please contact your administrator." }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
