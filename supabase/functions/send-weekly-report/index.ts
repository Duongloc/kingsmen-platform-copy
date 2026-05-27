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
      if (!profile.real_email || !profile.real_email.includes("@")) continue;

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

      // Build competency bar HTML
      const renderBar = (icon: string, name: string, score: number) => {
        const lv = getLevel(score);
        return `<div style="margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span style="font-size: 13px; color: #333; font-weight: 600;">${icon} ${name}</span>
            <span style="font-size: 12px; font-weight: 700; color: ${lv.color};">${score}% · ${lv.label}</span>
          </div>
          <div style="background: #e9ecef; border-radius: 6px; height: 8px; overflow: hidden;">
            <div style="width: ${score}%; height: 100%; background: ${lv.color}; border-radius: 6px;"></div>
          </div>
        </div>`;
      };

      const coreCompHTML = CORE_COMPETENCIES.map(c => renderBar(c.icon, c.name, (scores as any)[c.id] || 0)).join("");

      const posComps = POS_COMPETENCIES[profile.dept] || [];
      const posCompHTML = posComps.length > 0
        ? `<h3 style="color: #0e7356; font-size: 14px; margin: 20px 0 10px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">📌 Năng lực theo vị trí (${profile.dept})</h3>` +
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
        ? `<div style="background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 15px; margin-top: 20px;">
            <h3 style="color: #e65100; font-size: 14px; margin: 0 0 10px 0;">💡 Đề xuất cải thiện</h3>
            ${improvements.map(s => `
              <div style="padding: 8px 0; border-bottom: 1px solid #fff3cd;">
                <span style="display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 700; color: #fff; background: ${s.priority === "Cao" ? "#dc3545" : "#fd7e14"}; margin-right: 8px;">${s.priority}</span>
                <b style="font-size: 13px; color: #333;">${s.name}</b>
                <div style="font-size: 12px; color: #666; margin-top: 3px; padding-left: 4px;">${s.action}</div>
              </div>
            `).join("")}
          </div>`
        : "";

      // Compute overall avg score
      const scoreValues = Object.values(scores) as number[];
      const avgCompScore = scoreValues.length > 0 ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) : 0;
      const avgLv = getLevel(avgCompScore);

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
              <div style="flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.3;">Bài thi<br/>tuần này</div>
                <div style="font-size: 22px; font-weight: bold; color: #0e7356;">${userQuizzes}</div>
              </div>
              <div style="flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.3;">Điểm TB<br/>tuần này</div>
                <div style="font-size: 22px; font-weight: bold; color: #0d6efd;">${userAvgPct}%</div>
              </div>
              <div style="flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.3;">Năng lực<br/>tổng hợp</div>
                <div style="font-size: 22px; font-weight: bold; color: ${avgLv.color};">${avgCompScore}%</div>
              </div>
              <div style="flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.3;">Điểm TB<br/>công ty</div>
                <div style="font-size: 22px; font-weight: bold; color: #fd7e14;">${companyAvgPct}%</div>
              </div>
            </div>

            <!-- Core Competencies -->
            <h3 style="color: #0e7356; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🧠 Năng lực cốt lõi (6 nhóm)</h3>
            ${coreCompHTML}

            <!-- Position Competencies -->
            ${posCompHTML}

            <!-- Improvement Suggestions -->
            ${improvementHTML}

            <!-- Company Summary -->
            <h3 style="color: #0e7356; font-size: 14px; margin: 20px 0 10px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🌐 Tổng quan công ty tuần qua</h3>
            <p style="font-size: 13px; color: #555; line-height: 1.5;">
              Toàn công ty đã hoàn thành <b>${totalCompanyQuizzes}</b> bài thi với điểm số trung bình là <b>${companyAvgPct}%</b>. Hãy tiếp tục duy trì thói quen học tập để nâng cao kỹ năng!
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
