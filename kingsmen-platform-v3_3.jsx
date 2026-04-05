import React, { useState, useEffect, useRef } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { createClient } from "@supabase/supabase-js";

/* ═══════════════════════════════════════════════════════════════
   KINGSMEN TRAINING PLATFORM v3 — Nâng Cao Toàn Diện
   ═══════════════════════════════════════════════════════════════ */

const C = { dark: "#1A3A4A", bg1: "#0f2d3a", bg2: "#1A3A4A", teal: "#0C7B6F", tealD: "#0A6359", gold: "#C9A84C", goldL: "#DEC06B", white: "#FFFFFF", green: "#2ecc71", greenD: "#27ae60", red: "#e74c3c", blue: "#3498db", orange: "#e67e22", purple: "#9b59b6", border: "rgba(255,255,255,0.1)" };
const DEFAULT_DEPTS = ["Kinh doanh", "Kỹ thuật", "Marketing", "Kho vận", "Quản lý", "CSKH"];
const ROLES = [{ id: "employee", name: "Nhân viên", icon: "👤" }, { id: "manager", name: "QL Cấp trung", icon: "👔" }, { id: "director", name: "QL Cấp cao", icon: "🎩" }];
const DEFAULT_LEVELS = [{ name: "Tập sự", min: 0, icon: "🌱", color: "#95a5a6" }, { name: "Nhân viên", min: 100, icon: "⭐", color: C.blue }, { name: "Chuyên viên", min: 300, icon: "💎", color: C.purple }, { name: "Chuyên gia", min: 600, icon: "🏅", color: C.gold }, { name: "Master", min: 1000, icon: "🏆", color: "#e74c3c" }];
const BADGES = [
  { id: "first_quiz", name: "Bước Đầu", icon: "🎯", desc: "Hoàn thành bài kiểm tra đầu tiên", check: (r) => r.length >= 1 },
  { id: "perfect", name: "Hoàn Hảo", icon: "💯", desc: "Đạt 100% trong 1 bài kiểm tra", check: (r) => r.some(x => x.pct === 100) },
  { id: "streak7", name: "7 Ngày Lửa", icon: "🔥", desc: "Check-in 7 ngày liên tiếp", check: (_, a) => (a.streak || 0) >= 7 },
  { id: "streak30", name: "Bền Bỉ", icon: "💪", desc: "Check-in 30 ngày liên tiếp", check: (_, a) => (a.streak || 0) >= 30 },
  { id: "pass5", name: "Chiến Binh", icon: "⚔️", desc: "Đạt 5 bài kiểm tra", check: (r) => r.filter(x => x.passed).length >= 5 },
  { id: "pass10", name: "Vô Địch", icon: "👑", desc: "Đạt 10 bài kiểm tra", check: (r) => r.filter(x => x.passed).length >= 10 },
  { id: "expert", name: "Chuyên Gia", icon: "🎓", desc: "Đạt cấp Chuyên gia", check: (_, a, k, lvls) => { const L = lvls || DEFAULT_LEVELS; const target = L[3] || { min: 600 }; return (a.xp || 0) >= target.min; } },
  { id: "master", name: "Master", icon: "🏆", desc: "Đạt cấp Master", check: (_, a, k, lvls) => { const L = lvls || DEFAULT_LEVELS; const target = L[4] || L[L.length - 1] || { min: 1000 }; return (a.xp || 0) >= target.min; } },
  { id: "all_knowledge", name: "Bách Khoa", icon: "📚", desc: "Đọc hết tất cả bài kiến thức", check: (_, a, k) => k.length > 0 && (a.readLessons || []).length >= k.length },
  { id: "trio_excellent", name: "Hat-trick", icon: "🎩", desc: "3 lần Xuất sắc (≥90%) liên tiếp", check: (r) => { let c = 0; for (let i = r.length - 1; i >= 0; i--) { if (r[i].pct >= 90) c++; else break; } return c >= 3; } },
];

// ─── COMPETENCY FRAMEWORK ───
const CORE_COMPETENCIES = [
  { id: "thinking", name: "Tư duy & Xử lý thông tin", icon: "🧠", desc: "Khả năng phân tích, tổng hợp và xử lý thông tin" },
  { id: "knowledge", name: "Hiểu công việc & Áp dụng kiến thức", icon: "📖", desc: "Nắm vững kiến thức chuyên môn và vận dụng thực tế" },
  { id: "problem", name: "Giải quyết vấn đề & Ra quyết định", icon: "🎯", desc: "Xác định vấn đề, đánh giá phương án và ra quyết định" },
  { id: "communication", name: "Giao tiếp & Phối hợp", icon: "🤝", desc: "Truyền đạt, lắng nghe và phối hợp hiệu quả" },
  { id: "discipline", name: "Trách nhiệm, Kỷ luật & Tuân thủ", icon: "📋", desc: "Chấp hành quy định, hoàn thành đúng cam kết" },
  { id: "learning", name: "Học hỏi, Thích nghi & Cải tiến", icon: "🚀", desc: "Chủ động học, thích nghi thay đổi và cải tiến" },
];
const POS_COMPETENCIES = {
  "Kinh doanh": [{ id: "sales", name: "Kỹ năng bán hàng & Tư vấn", icon: "💼" }, { id: "customer", name: "Chăm sóc khách hàng", icon: "🎧" }],
  "Kỹ thuật": [{ id: "technical", name: "Chuyên môn kỹ thuật", icon: "🔧" }, { id: "quality", name: "Kiểm soát chất lượng", icon: "✅" }],
  "Marketing": [{ id: "creative", name: "Tư duy sáng tạo", icon: "🎨" }, { id: "digital", name: "Marketing số", icon: "📱" }],
  "Kho vận": [{ id: "logistics", name: "Quản lý kho & Logistics", icon: "📦" }, { id: "accuracy", name: "Độ chính xác", icon: "🎯" }],
  "Quản lý": [{ id: "leadership", name: "Lãnh đạo & Quản lý", icon: "👔" }, { id: "strategy", name: "Tư duy chiến lược", icon: "♟️" }],
  "CSKH": [{ id: "empathy", name: "Đồng cảm & Kiên nhẫn", icon: "💛" }, { id: "resolve", name: "Xử lý khiếu nại", icon: "🛡️" }],
};
// Evaluate competency from quiz results (0-100)
const evalCompetency = (results, streak, readCount, totalKnowledge) => {
  const total = results.length;
  const avg = total > 0 ? results.reduce((s, r) => s + r.pct, 0) / total : 0;
  const passRate = total > 0 ? results.filter(r => r.passed).length / total * 100 : 0;
  const perfect = results.filter(r => r.pct === 100).length;
  const recent = results.slice(-5);
  const recentAvg = recent.length > 0 ? recent.reduce((s, r) => s + r.pct, 0) / recent.length : 0;
  const readPct = totalKnowledge > 0 ? readCount / totalKnowledge * 100 : 0;
  return {
    thinking: Math.min(100, Math.round(avg * 0.6 + (perfect > 0 ? 20 : 0) + (recentAvg > avg ? 20 : 0))),
    knowledge: Math.min(100, Math.round(readPct * 0.5 + avg * 0.3 + passRate * 0.2)),
    problem: Math.min(100, Math.round(avg * 0.4 + passRate * 0.3 + (recentAvg > 70 ? 30 : recentAvg * 0.3))),
    communication: Math.min(100, Math.round(passRate * 0.4 + (streak > 7 ? 30 : streak * 4) + (total > 5 ? 30 : total * 6))),
    discipline: Math.min(100, Math.round((streak > 14 ? 40 : streak * 3) + passRate * 0.3 + (total > 3 ? 30 : total * 10))),
    learning: Math.min(100, Math.round(readPct * 0.3 + (recentAvg - avg > 0 ? 30 : 10) + (streak > 7 ? 20 : streak * 3) + (total > 5 ? 20 : total * 4))),
  };
};
const getCompetencyLevel = (score) => {
  if (score >= 85) return { label: "Xuất sắc", color: C.green };
  if (score >= 70) return { label: "Tốt", color: C.blue };
  if (score >= 50) return { label: "Đạt", color: C.orange };
  return { label: "Cần cải thiện", color: C.red };
};
const getImprovements = (scores, dept) => {
  const suggestions = [];
  const sorted = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  const allComps = [...CORE_COMPETENCIES, ...(POS_COMPETENCIES[dept] || [])];
  sorted.slice(0, 3).forEach(([id, score]) => {
    const comp = allComps.find(c => c.id === id);
    if (comp && score < 70) {
      if (id === "thinking") suggestions.push({ comp: comp.name, action: "Làm thêm bài kiểm tra nâng cao, tập trung phân tích câu hỏi kỹ trước khi trả lời", priority: score < 50 ? "Cao" : "Trung bình" });
      else if (id === "knowledge") suggestions.push({ comp: comp.name, action: "Đọc hết tài liệu kiến thức, ôn lại các bài chưa đạt", priority: score < 50 ? "Cao" : "Trung bình" });
      else if (id === "problem") suggestions.push({ comp: comp.name, action: "Tập trung vào bài thi tình huống, phân tích kỹ từng phương án", priority: score < 50 ? "Cao" : "Trung bình" });
      else if (id === "discipline") suggestions.push({ comp: comp.name, action: "Duy trì đăng nhập hàng ngày, hoàn thành bài kiểm tra đúng hạn", priority: score < 50 ? "Cao" : "Trung bình" });
      else if (id === "learning") suggestions.push({ comp: comp.name, action: "Chủ động học bài mới, thi lại bài chưa đạt để cải thiện điểm", priority: score < 50 ? "Cao" : "Trung bình" });
      else suggestions.push({ comp: comp.name, action: "Tiếp tục rèn luyện và thực hành thường xuyên", priority: score < 50 ? "Cao" : "Trung bình" });
    }
  });
  return suggestions;
};

// ─── KINGSMEN CULTURE QUOTES — Billionaires/CEOs (Vietnamese, teamwork & mission focus) ───
const CULTURE_QUOTES = [
  // === LINH HOẠT THÍCH ỨNG ===
  { quote: "Khi mọi thứ dường như đang chống lại bạn, hãy nhớ rằng máy bay cất cánh ngược gió chứ không phải xuôi gió.", author: "Henry Ford", value: "LINH HOẠT THÍCH ỨNG", color: "#3498db" },
  { quote: "Sự đổi mới phân biệt người dẫn đầu và kẻ đi theo.", author: "Steve Jobs", value: "LINH HOẠT THÍCH ỨNG", color: "#3498db" },
  { quote: "Thất bại chỉ là một lựa chọn. Nếu mọi thứ không thất bại, nghĩa là bạn chưa đủ đổi mới.", author: "Elon Musk", value: "LINH HOẠT THÍCH ỨNG", color: "#3498db" },
  { quote: "Nếu bạn gấp đôi số thí nghiệm mỗi năm, bạn sẽ gấp đôi sự sáng tạo.", author: "Jeff Bezos", value: "LINH HOẠT THÍCH ỨNG", color: "#3498db" },
  { quote: "Chúng ta luôn đánh giá quá cao sự thay đổi trong 2 năm và đánh giá quá thấp sự thay đổi trong 10 năm.", author: "Bill Gates", value: "LINH HOẠT THÍCH ỨNG", color: "#3498db" },
  // === TỰ CHỦ NÂNG TẦM ===
  { quote: "Hãy luôn khát khao. Hãy luôn dại khờ.", author: "Steve Jobs", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Hãy đầu tư vào bản thân. Đó là khoản đầu tư sinh lời nhất mà bạn có thể làm.", author: "Warren Buffett", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Nơi duy nhất mà thành công đến trước công việc là trong từ điển.", author: "Mark Cuban", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  // === QUYẾT TÂM THỰC THI ===
  { quote: "Hôm nay rất khó. Ngày mai còn khó hơn. Nhưng ngày mốt sẽ tuyệt vời.", author: "Jack Ma", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Nếu một thứ đủ quan trọng, bạn nên làm nó ngay cả khi khả năng thành công không cao.", author: "Elon Musk", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  // === CHÍNH TRỰC NHẤT QUÁN ===
  { quote: "Thương hiệu của bạn là những gì người ta nói về bạn khi bạn không có mặt trong phòng.", author: "Jeff Bezos", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Trung thực là chương đầu tiên trong cuốn sách khôn ngoan.", author: "Warren Buffett", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Phải mất 20 năm để xây dựng danh tiếng và chỉ 5 phút để phá hủy nó.", author: "Warren Buffett", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Thành công không phải là chìa khóa của hạnh phúc. Hạnh phúc là chìa khóa của thành công.", author: "Jack Ma", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  // === MỚI: TEAMWORK / TỔ CHỨC / SỨ MỆNH LỚN HƠN BẢN THÂN ===
  { quote: "Những điều vĩ đại trong kinh doanh không bao giờ được làm bởi một người. Chúng được làm bởi một đội ngũ.", author: "Steve Jobs", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Một nhóm nhỏ những con người tận tâm có thể thay đổi cả thế giới. Thực tế, đó là cách duy nhất.", author: "Margaret Mead", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Nếu bạn muốn đi nhanh, hãy đi một mình. Nếu bạn muốn đi xa, hãy đi cùng nhau.", author: "Tục ngữ Châu Phi", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Sứ mệnh của chúng tôi không phải chế tạo xe hơi điện, mà là thúc đẩy thế giới chuyển sang năng lượng bền vững.", author: "Elon Musk", value: "LINH HOẠT THÍCH ỨNG", color: "#3498db" },
  { quote: "Công việc của một nhà lãnh đạo không phải là làm việc cho người khác, mà là tạo ra những người lãnh đạo khác.", author: "Jack Welch", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Văn hoá ăn chiến lược vào bữa sáng.", author: "Peter Drucker", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Bạn không xây dựng doanh nghiệp. Bạn xây dựng con người, rồi con người xây dựng doanh nghiệp.", author: "Zig Ziglar", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Sức mạnh của đội nhóm nằm ở mỗi thành viên. Sức mạnh của mỗi thành viên nằm ở đội nhóm.", author: "Phil Jackson", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Tôi không đến đây để làm việc vì tiền. Tôi đến đây để cùng mọi người thay đổi cuộc chơi.", author: "Jack Ma", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Khách hàng sẽ không bao giờ yêu công ty bạn trừ khi nhân viên yêu nó trước.", author: "Simon Sinek", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Một người có thể là yếu tố quan trọng trong một đội, nhưng một người không thể tạo nên một đội.", author: "Kareem Abdul-Jabbar", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Con người không mua những gì bạn làm, họ mua lý do tại sao bạn làm điều đó.", author: "Simon Sinek", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Tầm nhìn mà không có hành động chỉ là giấc mơ. Hành động mà không có tầm nhìn chỉ là giết thời gian.", author: "Joel A. Barker", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  // === ĐỘI NHÓM & TỔ CHỨC ===
  { quote: "Không ai trong chúng ta thông minh bằng tất cả chúng ta.", author: "Ken Blanchard", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Đoàn kết là sức mạnh. Khi có tinh thần đồng đội và cộng tác, những điều kỳ diệu có thể đạt được.", author: "Mattie Stepanek", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Tài năng giành chiến thắng trong trận đấu, nhưng tinh thần đồng đội giành chức vô địch.", author: "Michael Jordan", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Đến cùng nhau là khởi đầu, giữ bên nhau là tiến bộ, làm việc cùng nhau là thành công.", author: "Henry Ford", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Nếu mọi người cùng tiến về phía trước, thành công sẽ tự đến.", author: "Henry Ford", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  // === HỌC TẬP & PHÁT TRIỂN ===
  { quote: "Học tập là kho báu sẽ theo chủ nhân đến mọi nơi.", author: "Tục ngữ Trung Hoa", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Sự thay đổi là kết quả cuối cùng của mọi học tập thực sự.", author: "Leo Buscaglia", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Ai ngừng học sẽ già, dù 20 hay 80 tuổi. Ai tiếp tục học sẽ mãi trẻ.", author: "Henry Ford", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Giáo dục không phải là đổ đầy một cái xô, mà là thắp sáng một ngọn lửa.", author: "William Butler Yeats", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Đầu tư vào kiến thức mang lại lãi suất tốt nhất.", author: "Benjamin Franklin", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  // === ĐIỀU LỚN LAO HƠN BẢN THÂN ===
  { quote: "Ý nghĩa cuộc đời là tìm ra tài năng của bạn. Mục đích cuộc đời là trao nó đi.", author: "Pablo Picasso", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Cách tốt nhất để tìm ra chính mình là quên mình trong việc phục vụ người khác.", author: "Mahatma Gandhi", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Chúng ta kiếm sống bằng những gì ta nhận được, nhưng tạo nên cuộc đời bằng những gì ta cho đi.", author: "Winston Churchill", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Thước đo cuối cùng không phải bạn đứng ở đâu khi thuận lợi, mà là ở đâu khi thử thách.", author: "Martin Luther King Jr.", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Một người thành công nhất khi giúp người khác cũng thành công.", author: "Dale Carnegie", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  // === VĂN HOÁ & GIÁ TRỊ ===
  { quote: "Văn hoá không phải là thứ bạn nói, mà là thứ bạn làm khi không ai nhìn.", author: "Tony Hsieh", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Xây dựng văn hoá không phải là nhiệm vụ HR. Đó là nhiệm vụ của mỗi người.", author: "Patrick Lencioni", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Khách hàng đến rồi đi, nhưng văn hoá ở lại mãi mãi.", author: "Reed Hastings", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  { quote: "Người giỏi nhất muốn làm việc ở nơi có văn hoá tốt nhất.", author: "Brian Chesky", value: "TỰ CHỦ NÂNG TẦM", color: "#9b59b6" },
  { quote: "Niềm tin được xây dựng qua hành động nhất quán, không phải qua lời nói.", author: "Simon Sinek", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
  // === SỨ MỆNH & TẦM NHÌN ===
  { quote: "Điều quan trọng không phải gió thổi hướng nào, mà là bạn căng buồm ra sao.", author: "Jim Rohn", value: "LINH HOẠT THÍCH ỨNG", color: "#3498db" },
  { quote: "Tương lai thuộc về những ai tin vào vẻ đẹp của giấc mơ mình.", author: "Eleanor Roosevelt", value: "LINH HOẠT THÍCH ỨNG", color: "#3498db" },
  { quote: "Thành công không tránh khỏi thất bại, mà là không bao giờ bỏ cuộc sau thất bại.", author: "Winston Churchill", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Đừng sợ tiến chậm, chỉ sợ đứng yên.", author: "Tục ngữ Trung Hoa", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Mọi thành tựu lớn đều bắt đầu từ quyết định thử.", author: "Tony Robbins", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Kỷ luật là cầu nối giữa mục tiêu và thành tựu.", author: "Jim Rohn", value: "QUYẾT TÂM THỰC THI", color: "#e67e22" },
  { quote: "Một tổ chức vĩ đại không phải vì kết quả tài chính, mà vì ảnh hưởng tích cực lên con người.", author: "Simon Sinek", value: "CHÍNH TRỰC NHẤT QUÁN", color: "#2ecc71" },
];
const getRandomQuote = () => CULTURE_QUOTES[Math.floor(Math.random() * CULTURE_QUOTES.length)];

const getLevel = (xp, lvls) => { const L = lvls || DEFAULT_LEVELS; const x = Number(xp) || 0; for (let i = L.length - 1; i >= 0; i--)if (x >= Number(L[i].min)) return { ...L[i], idx: i }; return { ...L[0], idx: 0 } };
const getNextLevel = (xp, lvls) => { const L = lvls || DEFAULT_LEVELS; const c = getLevel(xp, L); return c.idx >= L.length - 1 ? null : L[c.idx + 1] };
const xpProgress = (xp, lvls) => { const L = lvls || DEFAULT_LEVELS; const c = getLevel(xp, L), n = getNextLevel(xp, L); return n ? (xp - c.min) / (n.min - c.min) : 1 };
const visibleToDept = (item, dept) => { const d = item.depts || ["Tất cả"]; return d.includes("Tất cả") || d.includes(dept) };
const challengeVisibleTo = (ch, user) => (ch.active !== false) && (!ch.assignTo || ch.assignTo === "all" || (ch.assignTo === "dept" && ch.assignDept === user.dept) || ch.assignTo === user.id);
const uid = () => Math.random().toString(36).slice(2, 10);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]]; } return b };
const fmtDate = (d) => new Date(d).toLocaleDateString("vi-VN");
const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const daysSince = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const today = () => new Date().toISOString().slice(0, 10);

const CHANGELOG = [
  {
    version: "v3.2", date: "2026-03-22", title: "Tự luận & Độ khó", changes: [
      "✨ THÊM: Tuỳ chọn độ khó khi tạo đề — Dễ / Trung bình / Khó / Nâng cao",
      "✨ THÊM: Đề kết hợp Trắc nghiệm + Tự luận (Mixed Quiz)",
      "✨ THÊM: AI tự động chấm điểm phần tự luận theo tiêu chí đáp án",
      "🐛 FIX: Đề kết hợp — sửa lỗi không tạo được câu tự luận (JSON newline escape bug)",
      "🐛 FIX: CSV export — bổ sung phần tự luận, header rõ ràng, tách 2 phần A/B",
      "🔄 CẢI THIỆN: Giải thích câu hỏi và nhận xét AI ngắn gọn hơn (tối đa 2 câu)",
      "🔄 CẢI THIỆN: Tăng max_tokens lên 6000, thêm retry cho câu tự luận",
    ]
  },
  {
    version: "v3.1", date: "2026-03-21", title: "Sửa lỗi & Nâng cấp", changes: [
      "🐛 FIX: Câu hỏi Đúng/Sai — sửa lỗi đáp án luôn bị đánh dấu sai do so sánh boolean vs số (true≠0)",
      "🐛 FIX: Trắc nghiệm — sửa lỗi type coercion khi AI trả về ans dạng string ('0' thay vì 0)",
      "✨ THÊM: Nút '📥 CSV' — admin tải bộ câu hỏi & đáp án của từng đề về file CSV",
      "✨ THÊM: Màn hình Lịch Sử Nâng Cấp — ghi lại các thay đổi theo phiên bản và thời gian",
    ]
  },
  {
    version: "v3.0", date: "2026-03-15", title: "Nâng cấp toàn diện", changes: [
      "✨ Thêm Bộ năng lực (Competency Framework) với Radar Chart cho từng nhân viên",
      "✨ Thêm Lộ trình đào tạo (Pathway) với stages + modules + checklist + mở khoá tuần tự",
      "✨ Thêm Thử thách (Challenges) gắn với bài kiểm tra + phần thưởng bốc thăm",
      "✨ Thêm Bảng tin & Chính sách (Bulletins) cho Admin/Director đăng",
      "✨ Thêm Bài học tương tác AI: Slides, Flashcards, Cheat Sheet, Mini Quiz",
      "✨ Thêm cơ chế XP Decay (trừ điểm khi vắng / không học tập)",
      "✨ Thêm hỗ trợ upload PDF — AI trích xuất text từ file",
      "✨ Thêm Tuyên dương nhân viên, Nhận xét Manager/Director",
      "✨ Thêm Session persistence — tự động đăng nhập lại khi mở lại tab",
      "🔄 Nâng cấp giao diện header, login page, quiz play screen",
    ]
  },
  {
    version: "v2.0", date: "2026-02-20", title: "Phiên bản 2.0", changes: [
      "✨ Thêm huy hiệu (Badges) với 10 loại thành tích",
      "✨ Thêm Xếp hạng (Leaderboard) theo phòng ban",
      "✨ Thêm AI tạo đề kiểm tra tự động từ nội dung bài học",
      "✨ Thêm Phân tích năng lực (Analytics) cho Admin",
      "✨ Thêm quản lý nhiều phòng ban",
      "🔄 Cải thiện UX quiz: timer, progress bar, explanation",
    ]
  },
  {
    version: "v1.0", date: "2026-01-10", title: "Ra mắt", changes: [
      "🚀 Hệ thống đào tạo nội bộ Kingsmen ra mắt phiên bản đầu tiên",
      "✨ Tài khoản nhân viên + đăng nhập bảo mật",
      "✨ Bài học kiến thức + bài kiểm tra trắc nghiệm cơ bản",
      "✨ Hệ thống XP & cấp độ (Tập sự → Master)",
      "✨ Streak check-in hàng ngày",
      "✨ Backup & khôi phục dữ liệu JSON",
    ]
  },
];

// ─── SUPABASE CLIENT ───
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Field mapping: DB (snake_case) ↔ App (camelCase) ───
const profileToCamel = (r) => ({ id: r.id, empId: r.emp_id, name: r.name, dept: r.dept, accRole: r.acc_role, xp: r.xp || 0, streak: r.streak || 0, status: r.status, lastCheckIn: r.last_check_in || null, lastXpGainDate: r.last_xp_gain_date || null, checkIns: r.check_ins || [], readLessons: r.read_lessons || [], pathProgress: r.path_progress || {}, avatar: r.avatar || null, team: r.team || "" });
const profileToSnake = (a) => ({ id: a.id, emp_id: a.empId, name: a.name, dept: a.dept, acc_role: a.accRole || "employee", xp: a.xp || 0, streak: a.streak || 0, status: a.status || "active", last_check_in: a.lastCheckIn || null, last_xp_gain_date: a.lastXpGainDate || null, check_ins: a.checkIns || [], read_lessons: a.readLessons || [], path_progress: a.pathProgress || {}, avatar: a.avatar || null, team: a.team || "" });
const quizToCamel = (r) => ({ id: r.id, title: r.title, questions: r.questions || [], timeLimit: r.time_limit, depts: r.depts || ["Tất cả"], aiGenerated: r.ai_generated, difficulty: r.difficulty, quizType: r.quiz_type, knowledgeId: r.knowledge_id, createdAt: r.created_at });
const quizToSnake = (q) => ({ id: q.id, title: q.title, questions: q.questions || [], time_limit: q.timeLimit, depts: q.depts || ["Tất cả"], ai_generated: q.aiGenerated || false, difficulty: q.difficulty || "medium", quiz_type: q.quizType || "mc", knowledge_id: q.knowledgeId || null });
const knowledgeToCamel = (r) => ({ id: r.id, title: r.title, content: r.content || "", depts: r.depts || ["Tất cả"], docUrl: r.doc_url || "", hasPdf: r.has_pdf || false, pdfName: r.pdf_name || "", interactive: r.interactive || null, videoUrl: r.video_url || "", audioUrl: r.audio_url || "", images: r.images || [], createdAt: r.created_at });
const knowledgeToSnake = (k) => ({ id: k.id, title: k.title, content: k.content || "", depts: k.depts || ["Tất cả"], doc_url: k.docUrl || "", has_pdf: k.hasPdf || false, pdf_name: k.pdfName || "", interactive: k.interactive || null, video_url: k.videoUrl || "", audio_url: k.audioUrl || "", images: k.images || [] });
const resultToCamel = (r) => ({ id: r.id, empId: r.emp_id, quizId: r.quiz_id, quizTitle: r.quiz_title, score: r.score, total: r.total, pct: r.pct, passed: r.passed, time: r.time_taken, date: r.created_at, answers: r.answers || [], quizType: r.quiz_type });
const resultToSnake = (r) => ({ id: r.id, emp_id: r.empId, quiz_id: r.quizId || null, quiz_title: r.quizTitle, score: r.score, total: r.total, pct: r.pct, passed: r.passed, time_taken: r.time, answers: r.answers || [], quiz_type: r.quizType || "mc" });
const challengeToCamel = (r) => ({ id: r.id, title: r.title, quizId: r.quiz_id, quizTitle: r.quiz_title || "", minScore: r.min_score, deadline: r.deadline ? String(r.deadline).slice(0, 10) : null, assignTo: r.assign_to, assignDept: r.assign_dept, rewards: r.rewards || [], active: r.active, xpBonus: r.xp_bonus, xpReward: r.xp_bonus, createdAt: r.created_at, createdBy: r.created_by, createdByName: r.created_by_name || "", completedBy: r.completed_by || [], wonRewards: r.won_rewards || {} });
const challengeToSnake = (c) => ({ id: c.id, title: c.title, quiz_id: c.quizId || null, quiz_title: c.quizTitle || "", min_score: c.minScore || 70, deadline: c.deadline || null, assign_to: c.assignTo || "all", assign_dept: c.assignDept || null, rewards: c.rewards || [], active: c.active !== false, xp_bonus: c.xpBonus || c.xpReward || 50, created_by: c.createdBy || null, created_by_name: c.createdByName || "", completed_by: c.completedBy || [], won_rewards: c.wonRewards || {} });
const notifToCamel = (r) => ({ id: r.id, empId: r.emp_id, msg: r.msg, type: r.type, date: r.created_at, read: r.read });
const notifToSnake = (n) => ({ id: n.id, emp_id: n.empId, msg: n.msg, type: n.type || "info", read: n.read || false });
const bulletinToCamel = (r) => ({ id: r.id, title: r.title, content: r.content, type: r.type, pinned: r.pinned, author: r.author, createdAt: r.created_at });
const bulletinToSnake = (b) => ({ id: b.id, title: b.title, content: b.content || "", type: b.type || "announce", pinned: b.pinned || false, author: b.author || "" });
const recognitionToCamel = (r) => ({ id: r.id, empId: r.emp_id, empName: r.emp_name || "", type: r.type, message: r.message, givenBy: r.given_by, createdAt: r.created_at });
const recognitionToSnake = (r) => ({ id: r.id, emp_id: r.empId, emp_name: r.empName || "", type: r.type || "excellent", message: r.message || "", given_by: r.givenBy || "" });
const pathToCamel = (r) => ({ id: r.id, title: r.title, dept: r.dept || "", description: r.description || "", stages: r.stages || [], assignedTo: r.assigned_to || [], createdAt: r.created_at || null });
const pathToSnake = (p) => ({ id: p.id, title: p.title, dept: p.dept || "", description: p.description || "", stages: p.stages || [], assigned_to: p.assignedTo || [] });

var _pdfCache = {};

// ─── DB layer backed by Supabase ───
const DB = {
  async get(k, fb = null) {
    try {
      switch (k) {
        case "km-accounts": { const { data } = await supabase.from("profiles").select("*").order("created_at"); return data ? data.map(profileToCamel) : fb; }
        case "km-quizzes": { const { data } = await supabase.from("quizzes").select("*").order("created_at"); return data ? data.map(quizToCamel) : fb; }
        case "km-knowledge": { const { data } = await supabase.from("knowledge").select("*").order("created_at"); return data ? data.map(knowledgeToCamel) : fb; }
        case "km-results": { const { data } = await supabase.from("results").select("*").order("created_at"); return data ? data.map(resultToCamel) : fb; }
        case "km-recognitions": { const { data } = await supabase.from("recognitions").select("*").order("created_at"); return data ? data.map(recognitionToCamel) : fb; }
        case "km-challenges": { const { data } = await supabase.from("challenges").select("*").order("created_at"); return data ? data.map(challengeToCamel) : fb; }
        case "km-notifications": { const { data } = await supabase.from("notifications").select("*").order("created_at"); return data ? data.map(notifToCamel) : fb; }
        case "km-paths": { const { data } = await supabase.from("paths").select("*").order("created_at"); return data ? data.map(pathToCamel) : fb; }
        case "km-bulletins": { const { data } = await supabase.from("bulletins").select("*").order("created_at", { ascending: false }); return data ? data.map(bulletinToCamel) : fb; }
        case "km-settings": { const { data } = await supabase.from("settings").select("config").eq("id", 1).single(); return data ? data.config : fb; }
        case "km-logo": { const { data } = await supabase.from("kingsmen_data").select("value").eq("id", "logo").single(); return data ? data.value : fb; }
        default: return fb;
      }
    } catch (e) { console.error("DB.get error", k, e); return fb; }
  },
  async set(k, v) {
    try {
      if (!v) return false;
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      let isAdmin = false;
      if (user) {
         const { data: p } = await supabase.from("profiles").select("emp_id, acc_role").eq("id", user.id).single();
         isAdmin = p?.emp_id === "admin" || p?.acc_role === "director";
      }

      switch (k) {
        case "km-accounts": { 
           if (!Array.isArray(v)) return false; 
           const rows = v.map(profileToSnake).filter(r => isAdmin || (user && r.id === user.id)); 
           if (rows.length > 0) { const { error } = await supabase.from("profiles").upsert(rows); if (error) console.error("profiles upsert err:", error.message); } 
           return true; 
        }
        case "km-quizzes": { if (!Array.isArray(v)) return false; const { error } = await supabase.from("quizzes").upsert(v.map(quizToSnake)); return !error; }
        case "km-knowledge": { if (!Array.isArray(v)) return false; const { error } = await supabase.from("knowledge").upsert(v.map(knowledgeToSnake)); return !error; }
        case "km-results": { 
           if (!Array.isArray(v)) return false; 
           const rows = v.map(resultToSnake).filter(r => isAdmin || (user && r.emp_id === user.id)); 
           if (rows.length > 0) { const { error } = await supabase.from("results").upsert(rows); if (error) console.error("results upsert err:", error.message); } 
           return true; 
        }
        case "km-recognitions": { if (!Array.isArray(v)) return false; const { error } = await supabase.from("recognitions").upsert(v.map(recognitionToSnake)); return !error; }
        case "km-challenges": { if (!Array.isArray(v)) return false; const { error } = await supabase.from("challenges").upsert(v.map(challengeToSnake)); return !error; }
        case "km-notifications": { 
           if (!Array.isArray(v)) return false; 
           // Filter notifications to only upsert ones owned by user, OR new inserts
           const { data: existingResp } = await supabase.from("notifications").select("id");
           const existingIds = new Set(existingResp?.map(e => e.id) || []);
           const rows = v.map(notifToSnake).filter(r => isAdmin || r.emp_id === user?.id || !existingIds.has(r.id)); 
           if (rows.length > 0) { const { error } = await supabase.from("notifications").upsert(rows); if (error) console.error("notif upsert err:", error.message); } 
           return true; 
        }
        case "km-paths": { if (!Array.isArray(v)) return false; const { error } = await supabase.from("paths").upsert(v.map(pathToSnake)); return !error; }
        case "km-bulletins": { if (!Array.isArray(v)) return false; const { error } = await supabase.from("bulletins").upsert(v.map(bulletinToSnake)); return !error; }
        case "km-settings": { const { error } = await supabase.from("settings").upsert({ id: 1, config: v }); return !error; }
        case "km-logo": { const { error } = await supabase.from("kingsmen_data").upsert({ id: "logo", value: v }); return !error; }
        default: return false;
      }
    } catch (e) { console.error("DB.set error", k, e); return false; }
  },
};

// ─── Session: localStorage for UI state only (auth is handled by Supabase) ───
const Session = {
  async get(k, fb = null) { try { const v = localStorage.getItem("sess_" + k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
  async set(k, v) { try { localStorage.setItem("sess_" + k, JSON.stringify(v)); } catch (e) { } return true; },
  clear(k) { try { localStorage.removeItem("sess_" + k); } catch (e) { } },
};


export default function App() {
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState(null);
  const [screen, setScreen] = useState("login");
  const [currentUser, setCurrentUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [results, setResults] = useState([]);
  const [recognitions, setRecognitions] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [paths, setPaths] = useState([]);
  const [bulletins, setBulletins] = useState([]);
  const [settings, setSettings] = useState({ quizFreq: 7, passScore: 70, xpCorrect: 5, xpPass: 20, xpBonus90: 30, xpPerfect: 50, streakXP: 10, decayDays: 3, decayXP: 10, idleDays: 7, idleXP: 15, levels: null, depts: null });
  const LEVELS = (settings.levels || DEFAULT_LEVELS).map((lv, i) => ({ ...DEFAULT_LEVELS[i], ...lv, min: Number(lv.min) || 0, color: lv.color || (DEFAULT_LEVELS[i] && DEFAULT_LEVELS[i].color) || C.gold })).sort((a, b) => a.min - b.min);
  const DEPTS = settings.depts || DEFAULT_DEPTS;
  const gL = (xp) => getLevel(xp, LEVELS);
  const getNextLevel2 = (xp) => { const c = gL(xp); return c.idx >= LEVELS.length - 1 ? null : LEVELS[c.idx + 1] };
  const xpProgress2 = (xp) => { const c = gL(xp), n = getNextLevel2(xp); return n ? (xp - c.min) / (n.min - c.min) : 1 };
  const [saveStatus, setSaveStatus] = useState("");
  const [loginId, setLoginId] = useState(""); const [loginPw, setLoginPw] = useState(""); const [loginErr, setLoginErr] = useState("");
  const [activeQuiz, setActiveQuiz] = useState(null); const [qIdx, setQIdx] = useState(0);
  const [qAnswers, setQAnswers] = useState({}); const [qSel, setQSel] = useState(null); const [qShowExp, setQShowExp] = useState(false);
  const [qTimer, setQTimer] = useState(0); const [qActive, setQActive] = useState(false);
  const [aiLoading, setAiLoading] = useState(false); const [aiStatus, setAiStatus] = useState("");
  const [subScreen, setSubScreen] = useState(null); const [formData, setFormData] = useState({});
  const qTimerRef = useRef(null); const qAnswersRef = useRef({}); const topRef = useRef(null);
  const accountsRef = useRef([]);
  // Essay grading state
  const [essayGrading, setEssayGrading] = useState(false);
  const [essayResults, setEssayResults] = useState([]);
  const [essayDraft, setEssayDraft] = useState("");
  // Prompt panel state
  const [promptPanel, setPromptPanel] = useState(null);// null | {text, copied}
  const [promptCopied, setPromptCopied] = useState(false);
  // Backup state
  const [backupJson, setBackupJson] = useState("");
  const [bkCopied, setBkCopied] = useState(false);
  const [importStatus, setImportStatus] = useState(null); // null | {ok, msg}
  const [importPreview, setImportPreview] = useState(null); // null | {quiz, fileName}
  // Import JSON lesson state
  const [importLessonId, setImportLessonId] = useState(null);
  const [importLessonJson, setImportLessonJson] = useState("");
  // Logo & Avatar customization
  const [companyLogo, setCompanyLogo] = useState(null); // base64 data URL
  const [showMotivation, setShowMotivation] = useState(null); // null | quote object
  const logoInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);

  useEffect(() => {
    // Immediate fallback: show app in 5s max regardless of storage
    const fallback = setTimeout(() => setReady(true), 2000);
    (async () => {
      try {
        const [a, k, q, r, rec, ch, notif, p, s, bul] = await Promise.all([
          DB.get("km-accounts", []), DB.get("km-knowledge", []), DB.get("km-quizzes", []),
          DB.get("km-results", []), DB.get("km-recognitions", []), DB.get("km-challenges", []),
          DB.get("km-notifications", []), DB.get("km-paths", []), DB.get("km-settings", null), DB.get("km-bulletins", []),
        ]);
        if (Array.isArray(a) && a.length) setAccounts(a); if (Array.isArray(a) && a.length) accountsRef.current = a;
        if (Array.isArray(k) && k.length) setKnowledge(k); if (Array.isArray(q) && q.length) setQuizzes(q);
        if (Array.isArray(r) && r.length) setResults(r); if (Array.isArray(rec) && rec.length) setRecognitions(rec);
        if (Array.isArray(ch) && ch.length) setChallenges(ch); if (Array.isArray(notif) && notif.length) setNotifications(notif);
        if (Array.isArray(p) && p.length) setPaths(p); if (s) setSettings(s); if (Array.isArray(bul) && bul.length) setBulletins(bul);
        // Load company logo
        try { const logoData = await DB.get("km-logo", null); if (logoData) setCompanyLogo(logoData); } catch (e2) { }
        // Check for existing session and resume auto-login
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          try {
            const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
            if (profile && profile.status === "active") {
              const acc = profileToCamel(profile);
              const activeAcc = (Array.isArray(a) && a.find(x => x.id === acc.id)) || acc;
              setCurrentUser(activeAcc);
              if (profile.emp_id === "admin" || profile.acc_role === "director") {
                setRole("admin"); setScreen("admin_home");
              } else {
                setRole("employee"); setScreen("emp_home");
              }
            } else {
              await supabase.auth.signOut();
            }
          } catch (e3) { console.error("Session restore err:", e3); }
        }
      } catch (e) { console.log("Init error:", e); }
      clearTimeout(fallback);
      setReady(true);
    })();
  }, []);

  const save = async (k, d) => { const ok = await DB.set(k, d); if (ok) { setSaveStatus("saved"); setTimeout(() => setSaveStatus(""), 1500); } else { setSaveStatus("error"); } };

  // ─── Fetch ALL data from database (called after login) ───
  const loadAllData = async () => {
    try {
      const [a, k, q, r, rec, ch, notif, p, s, bul] = await Promise.all([
        DB.get("km-accounts", []), DB.get("km-knowledge", []), DB.get("km-quizzes", []),
        DB.get("km-results", []), DB.get("km-recognitions", []), DB.get("km-challenges", []),
        DB.get("km-notifications", []), DB.get("km-paths", []), DB.get("km-settings", null), DB.get("km-bulletins", []),
      ]);
      if (Array.isArray(a)) { setAccounts(a); accountsRef.current = a; }
      if (Array.isArray(k)) setKnowledge(k);
      if (Array.isArray(q)) setQuizzes(q);
      if (Array.isArray(r)) setResults(r);
      if (Array.isArray(rec)) setRecognitions(rec);
      if (Array.isArray(ch)) setChallenges(ch);
      if (Array.isArray(notif)) setNotifications(notif);
      if (Array.isArray(p)) setPaths(p);
      if (s) setSettings(s);
      if (Array.isArray(bul)) setBulletins(bul);
      try { const logoData = await DB.get("km-logo", null); if (logoData) setCompanyLogo(logoData); } catch (e2) { }
    } catch (e) { console.error("loadAllData error:", e); }
  };
  const updAccounts = (d) => { setAccounts(d); accountsRef.current = d; save("km-accounts", d); };
  const updKnowledge = (d) => {
    setKnowledge(d);
    var clean = d.map(function (item) { var c2 = Object.assign({}, item); delete c2.videoData; delete c2.audioData; delete c2.videoFileName; delete c2.videoFileSize; delete c2.audioFileName; delete c2.audioFileSize; return c2 });
    save("km-knowledge", clean);
  };
  const updQuizzes = (d) => { setQuizzes(d); save("km-quizzes", d); };
  const updResults = (d) => { setResults(d); save("km-results", d); };
  const updRecognitions = (d) => { setRecognitions(d); save("km-recognitions", d); };
  const updChallenges = (d) => { setChallenges(d); save("km-challenges", d); };
  const updNotifications = (d) => { setNotifications(d); save("km-notifications", d); };
  const updPaths = (d) => { setPaths(d); save("km-paths", d); };
  const updSettings = (d) => { setSettings(d); save("km-settings", d); };

  const addXP = (userId, amount) => { const u = accountsRef.current.map(a => a.id === userId ? { ...a, xp: Math.max(0, (a.xp || 0) + amount), lastXpGainDate: amount > 0 ? today() : a.lastXpGainDate } : a); updAccounts(u); };
  const addNotif = (empId, msg, type = "info") => { const n = [...notifications, { id: uid(), empId, msg, type, date: new Date().toISOString(), read: false }]; updNotifications(n); };

  // Logo upload handler
  const handleLogoUpload = (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const dataUrl = ev.target.result; setCompanyLogo(dataUrl); DB.set("km-logo", dataUrl); };
    reader.readAsDataURL(file);
  };
  // Avatar upload handler
  const handleAvatarUpload = (e, userId) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const accs = accountsRef.current.map(a => a.id === userId ? { ...a, avatar: dataUrl } : a);
      updAccounts(accs);
      if (currentUser && currentUser.id === userId) setCurrentUser({ ...currentUser, avatar: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  // Streak check-in + XP decay
  const doCheckIn = async (user) => {
    const t = today();
    if (user.lastCheckIn === t) return user;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = (user.lastCheckIn === yesterday) ? (user.streak || 0) + 1 : 1;
    let xpChange = settings.streakXP || 10;
    // Decay 1: vắng app
    let decayMsg = "";
    if (user.lastCheckIn) {
      const lastDate = new Date(user.lastCheckIn + "T12:00:00");
      const nowDate = new Date(t + "T12:00:00");
      const daysAway = Math.floor((nowDate - lastDate) / (86400000));
      const threshold = settings.decayDays || 3;
      const decayPerDay = settings.decayXP || 10;
      if (daysAway > threshold) {
        const penaltyDays = daysAway - threshold;
        const penalty = penaltyDays * decayPerDay;
        xpChange = -penalty;
        decayMsg = "⚠️ Bạn vắng " + daysAway + " ngày → trừ " + penalty + " XP.";
      }
    }
    // Decay 2: không tăng XP (mở app nhưng không học)
    let idleMsg = "";
    const lastGain = user.lastXpGainDate || user.lastCheckIn || t;
    const idleThreshold = settings.idleDays || 7;
    const idlePenalty = settings.idleXP || 15;
    if (lastGain) {
      const gainDate = new Date(lastGain + "T12:00:00");
      const nowDate2 = new Date(t + "T12:00:00");
      const idleDays = Math.floor((nowDate2 - gainDate) / (86400000));
      if (idleDays >= idleThreshold && !decayMsg) {
        xpChange = -(idlePenalty);
        idleMsg = "📉 " + idleDays + " ngày chưa học/thi → trừ " + idlePenalty + " XP. Hãy làm bài kiểm tra hoặc học kiến thức!";
      }
    }
    const newXp = Math.max(0, (user.xp || 0) + xpChange);
    const updated = { ...user, lastCheckIn: t, streak: newStreak, xp: newXp, checkIns: [...(user.checkIns || []), t].slice(-90) };
    // Reload latest accounts from DB before saving
    let latestAccs = accountsRef.current;
    try { const acDB = await DB.get("km-accounts", []); if (Array.isArray(acDB) && acDB.length > 0) latestAccs = acDB; } catch (e) { }
    const accs = latestAccs.map(a => a.id === user.id ? { ...updated, xp: newXp } : a);
    setAccounts(accs); accountsRef.current = accs; await DB.set("km-accounts", accs);
    if (decayMsg) addNotif(user.id, decayMsg, "decay");
    if (idleMsg) addNotif(user.id, idleMsg, "decay");
    return updated;
  };

  // Badge check
  const getUserBadges = (user) => {
    const myResults = results.filter(r => r.empId === user.id);
    const myKnowledge = knowledge.filter(k => visibleToDept(k, user.dept));
    return BADGES.filter(b => b.check(myResults, user, myKnowledge, LEVELS));
  };

  useEffect(() => { if (topRef.current) topRef.current.scrollIntoView({ behavior: "smooth" }); }, [screen, subScreen]);
  useEffect(() => { if (screen === "login") { (async () => { try { const a = await DB.get("km-accounts", []); if (a.length > 0) { setAccounts(a); accountsRef.current = a; } } catch (e) { } })(); } }, [screen]);
  // Auto-reload data when navigating screens
  useEffect(() => {
    if (role && (screen === "emp_challenges" || screen === "emp_quizzes" || screen === "emp_knowledge" || screen === "emp_home" || screen === "emp_pathway" || screen === "emp_bulletins" || screen === "dir_bulletins" || screen === "admin_challenges" || screen === "admin_home" || screen === "admin_analytics" || screen === "admin_ranking" || screen === "admin_bulletins" || screen === "admin_activity" || screen === "admin_lessons" || screen === "admin_quizzes" || screen === "admin_accounts")) {
      (async () => {
        try {
          const [ch, q, k, r, ac, p, bul] = await Promise.all([DB.get("km-challenges", []), DB.get("km-quizzes", []), DB.get("km-knowledge", []), DB.get("km-results", []), DB.get("km-accounts", []), DB.get("km-paths", []), DB.get("km-bulletins", [])]);
          if (Array.isArray(ch)) setChallenges(ch); if (Array.isArray(q)) setQuizzes(q);
          if (Array.isArray(k)) {
            setKnowledge(function (prev) {
              return k.map(function (item) {
                var existing = prev.find(function (p) { return p.id === item.id });
                if (existing && existing.videoData) item.videoData = existing.videoData;
                if (existing && existing.audioData) item.audioData = existing.audioData;
                return item;
              });
            });
          } if (Array.isArray(r)) setResults(r);
          if (Array.isArray(ac)) {
            setAccounts(ac); accountsRef.current = ac;
            // Refresh currentUser from latest DB data
            if (currentUser) { const fresh = ac.find(a => a.id === currentUser.id); if (fresh) setCurrentUser(fresh); }
          }
          if (Array.isArray(p)) setPaths(p); if (Array.isArray(bul)) setBulletins(bul);
        } catch (e) { }
      })();
    }
  }, [screen, role]);

  // Timer
  useEffect(() => { if (qActive && qTimer > 0) { qTimerRef.current = setInterval(() => setQTimer(t => t <= 1 ? (clearInterval(qTimerRef.current), 0) : t - 1), 1000); return () => clearInterval(qTimerRef.current); }; }, [qActive]);
  useEffect(() => { if (qTimer <= 0 && qActive) finishQuiz(); }, [qTimer, qActive]);
  useEffect(() => { if (!qActive) return; if (qTimer === 60 || qTimer === 30) { try { if (navigator.vibrate) navigator.vibrate(qTimer === 30 ? [200, 100, 200] : [150]); } catch (e) {} } }, [qTimer, qActive]);

  const doEmployeeLogin = async () => {
    if (!loginId || !loginPw) { setLoginErr("Nhập mã NV và mật khẩu"); return; }
    const email = `${loginId.trim().toLowerCase()}@kingsmen.internal`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: loginPw });
    if (error) { setLoginErr("Sai mã nhân viên hoặc mật khẩu"); return; }
    const { data: profile, error: pErr } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    if (pErr || !profile) { setLoginErr("Không tìm thấy hồ sơ nhân viên"); return; }
    if (profile.status === "inactive") { await supabase.auth.signOut(); setLoginErr("Tài khoản đã bị vô hiệu hóa. Liên hệ Admin."); return; }
    // Admin user (emp_id === "admin") or Director → admin panel
    if (profile.emp_id === "admin" || profile.acc_role === "director") {
      setRole("admin"); setScreen("admin_home");
      Session.set("km-session", { role: "admin" });
      setLoginId(""); setLoginPw(""); setLoginErr("");
      await loadAllData();
      return;
    }
    const acc = profileToCamel(profile);
    const updated = await doCheckIn(acc);
    setCurrentUser(updated); setRole("employee"); setScreen("emp_home");
    Session.set("km-session", { role: "employee", userId: updated.id, screen: "emp_home" });
    setLoginId(""); setLoginPw(""); setLoginErr("");
    setShowMotivation(getRandomQuote());
    await loadAllData();
  };
  // doAdminLogin kept for any remaining UI references; routes through the unified Supabase flow
  const doAdminLogin = () => doEmployeeLogin();
  const getRating = (pct) => { if (pct >= 90) return { label: "XUẤT SẮC", color: C.green, emoji: "🏆" }; if (pct >= 75) return { label: "TỐT", color: C.blue, emoji: "⭐" }; if (pct >= settings.passScore) return { label: "ĐẠT", color: C.orange, emoji: "✅" }; return { label: "CHƯA ĐẠT", color: C.red, emoji: "📖" }; };

  // AI Quiz & Lesson generation
  // Robust JSON cleaner
  const cleanJSON = (text, arrayMode = true) => {
    if (!text || typeof text !== "string") return arrayMode ? [] : null;
    var s = text.trim();
    s = s.replace(/```json/g, "").replace(/```/g, "").trim();
    if (s.indexOf("\n") >= 0) s = s.replace(/\n/g, " ");
    var start = arrayMode ? s.indexOf("[") : s.indexOf("{");
    if (start < 0) return arrayMode ? [] : null;
    s = s.slice(start);
    var end = arrayMode ? s.lastIndexOf("]") : s.lastIndexOf("}");
    if (end < 0) return arrayMode ? [] : null;
    s = s.slice(0, end + 1);
    s = s.replace(/[\x00-\x1F]/g, " ").replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(s) } catch (e1) { }
    try { var f2 = s.replace(/'/g, '"'); return JSON.parse(f2) } catch (e2) { }
    try { var f3 = s + (!arrayMode ? "}" : "]"); return JSON.parse(f3) } catch (e3) { }
    return arrayMode ? [] : null;
  };

  // AI call with retry
  const callAIWithRetry = async (prompt, maxRetries = 2, maxTokens = 4000) => {
    // Refresh session to ensure valid JWT before calling edge function
    await supabase.auth.getSession();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        var body = { model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
        var { data: rawData, error: fnErr } = await supabase.functions.invoke("claude-proxy", { body, responseType: "text" });
        if (fnErr) throw new Error(fnErr.message || "Edge function error");
        var data;
        try { data = typeof rawData === "string" ? JSON.parse(rawData) : rawData; } catch (parseErr) { throw new Error("JSON parse error: " + String(rawData).slice(0, 200)); }
        if (data && data.error) throw new Error("API: " + (data.error.message || data.error.type || JSON.stringify(data.error).slice(0, 200)));
        if (!data || !data.content || !Array.isArray(data.content)) throw new Error("No content: " + JSON.stringify(data).slice(0, 200));
        var txt = ""; for (var ci = 0; ci < data.content.length; ci++) { if (data.content[ci].text) txt += data.content[ci].text }
        if (!txt) throw new Error("Empty response text");
        return txt;
      } catch (e) {
        if (attempt === maxRetries) throw e;
        setAiStatus("Lỗi: " + (e.message || "unknown").slice(0, 200) + " — thử lại (" + (attempt + 2) + "/" + (maxRetries + 1) + ")...");
        await new Promise(function (r) { setTimeout(r, 1000) });
      }
    }
  };

  const aiGenerate = async (knowledgeItem, type = "quiz", numQ = 10, customTitle = "", difficulty = "medium", quizType = "mc") => {
    setAiLoading(true);
    try {
      const maxLen = 5000;
      const content = (knowledgeItem.content || "").length > maxLen ? knowledgeItem.content.slice(0, maxLen) : knowledgeItem.content || "";
      if (type === "quiz") {
        // Difficulty label map
        const diffMap = { easy: "Dễ — nhận biết cơ bản", medium: "Trung bình — hiểu và áp dụng", hard: "Khó — phân tích tình huống", advanced: "Nâng cao — tổng hợp đánh giá" };
        const diffLabel = diffMap[difficulty] || diffMap.medium;
        const isMixed = quizType === "mixed";
        const essayCount = isMixed ? Math.max(1, Math.round(numQ * 0.3)) : 0;
        const mcCount = numQ - essayCount;
        const batchSize = 10;
        let allQuestions = [];
        let lastError = "";

        // ── Generate MC in batches of 10 ──
        const totalMCBatches = Math.ceil(mcCount / batchSize);
        for (let b = 0; b < totalMCBatches; b++) {
          const batchNum = Math.min(batchSize, mcCount - b * batchSize);
          const prevTitles = allQuestions.slice(-3).map(q => q.q || "").filter(Boolean).join(" / ");
          setAiStatus("Tạo trắc nghiệm batch " + (b + 1) + "/" + totalMCBatches + " (" + batchNum + " câu)...");
          const mcPrompt = `Tạo ĐÚNG ${batchNum} câu hỏi trắc nghiệm. Trả về JSON array thuần, không có gì khác ngoài JSON.
Format mỗi câu: {"type":"single","q":"nội dung câu hỏi","opts":["A","B","C","D"],"ans":0,"exp":"giải thích 1 câu"}
Hoặc đúng/sai: {"type":"truefalse","q":"nội dung","opts":["Đúng","Sai"],"ans":0,"exp":"giải thích 1 câu"}
Tỷ lệ: 70% single, 30% truefalse. Độ khó: ${diffLabel}.${prevTitles ? " Không trùng: " + prevTitles : ""}
Nội dung kiến thức:
${content.slice(0, 3000)}`;
          let batchOk = false;
          for (let attempt = 0; attempt < 3 && !batchOk; attempt++) {
            try {
              const raw = await callAIWithRetry(mcPrompt, 1);
              const parsed = cleanJSON(raw, true);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const valid = parsed.filter(q => q && typeof q.q === "string" && Array.isArray(q.opts) && q.opts.length >= 2 && q.ans != null);
                if (valid.length > 0) { allQuestions = [...allQuestions, ...valid]; batchOk = true; }
                else lastError = "Câu hỏi trả về không đúng format";
              } else lastError = "AI không trả về array";
            } catch (err) {
              lastError = err.message || String(err);
              setAiStatus("Batch " + (b + 1) + " thử lại (" + (attempt + 2) + "/3): " + lastError.slice(0, 60));
            }
          }
          if (!batchOk) {
            setAiStatus("❌ Batch " + (b + 1) + " thất bại: " + lastError.slice(0, 80) + ". Dừng ở " + allQuestions.length + " câu.");
            break;
          }
        }

        // Must have at least some MC
        if (allQuestions.length === 0) {
          throw new Error("0 câu. " + lastError);
        }

        // ── Generate essay for mixed type ──
        if (isMixed && essayCount > 0) {
          setAiStatus("Tạo " + essayCount + " câu tự luận...");
          const essayPrompt = `Tạo ĐÚNG ${essayCount} câu hỏi tự luận. Trả về JSON array thuần, không có gì khác ngoài JSON.
Format: {"type":"essay","q":"câu hỏi yêu cầu trình bày hoặc phân tích","rubric":"tieu chi 1 (3d). tieu chi 2 (3d). tieu chi 3 (2d). tieu chi 4 (2d).","modelAnswer":"dap an mau viet lien tuc khong xuong dong","points":10}
Câu hỏi phải yêu cầu giải thích hoặc phân tích, không chỉ nhận biết. Rubric trên một dòng. Độ khó: ${diffLabel}.
Nội dung kiến thức:
${content.slice(0, 3000)}`;
          let essayOk = false;
          for (let attempt = 0; attempt < 3 && !essayOk; attempt++) {
            try {
              const raw = await callAIWithRetry(essayPrompt, 1);
              const parsed = cleanJSON(raw, true);
              if (Array.isArray(parsed) && parsed.length > 0) {
                allQuestions = [...allQuestions, ...parsed.map(q => ({ ...q, type: "essay" }))];
                essayOk = true;
              }
            } catch (err) {
              lastError = err.message || String(err);
              if (attempt < 2) setAiStatus("Tự luận thử lại (" + (attempt + 2) + "/3)...");
            }
          }
          if (!essayOk) setAiStatus("⚠️ Không tạo được tự luận (" + lastError.slice(0, 60) + "). Lưu đề với " + allQuestions.length + " câu TN.");
        }

        setAiStatus("✅ Tạo xong " + allQuestions.length + " câu. Đang lưu...");
        const title = customTitle.trim() || ("Kiểm tra: " + knowledgeItem.title);
        const quiz = { id: uid(), knowledgeId: knowledgeItem.id, title, questions: allQuestions.map(q => ({ ...q, id: uid() })), timeLimit: allQuestions.length * 90, createdAt: new Date().toISOString(), aiGenerated: true, depts: knowledgeItem.depts || ["Tất cả"], difficulty, quizType: quizType || "mc" };
        const existing = quizzes;
        const newQ = [...existing, quiz]; setQuizzes(newQ); await DB.set("km-quizzes", newQ);
        setAiLoading(false); setAiStatus(""); return quiz;
      } else {
        setAiStatus("Đang tạo bài học...");
        const txt = await callAIWithRetry(`Tạo bài học trực quan từ nội dung sau. Trả về CHỈ JSON thuần:
{"title":"tiêu đề","sections":[{"heading":"mục","content":"nội dung 2-3 câu","keyPoints":["điểm 1"],"tip":"mẹo nhớ"}],"summary":"tóm tắt","mnemonics":"cách nhớ"}
Giữ NGẮN GỌN. Chỉ JSON, không markdown.

${knowledgeItem.title}
${content}`);
        const parsed = cleanJSON(txt, false);
        const lesson = { ...knowledgeItem, aiLesson: parsed, hasAiLesson: true };
        updKnowledge(knowledge.map(k => k.id === knowledgeItem.id ? lesson : k));
        setAiLoading(false); setAiStatus(""); return lesson;
      }
    } catch (e) { setAiLoading(false); setAiStatus("❌ Lỗi: " + (e.message || String(e)) + ". Bấm thử lại."); return null; }
  };

  // ─── FILE UPLOAD: Extract text only (reliable, no size issues) ───
  const handleFileUpload = async (file) => {
    const title = file.name.replace(/\.[^.]+$/, "");
    if (file.type === "application/pdf") {
      setAiLoading(true);
      setAiStatus("Đang đọc PDF bằng AI...");
      try {
        const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsDataURL(file); });
        const base64 = dataUrl.split(",")[1];
        await supabase.auth.getSession(); // Refresh JWT
        const { data: rawPdf, error: fnErr } = await supabase.functions.invoke("claude-proxy", {
          body: {
            model: "claude-sonnet-4-6", max_tokens: 6000,
            messages: [{
              role: "user", content: [
                { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
                { type: "text", text: "Trích xuất TOÀN BỘ nội dung text từ tài liệu PDF này. Giữ nguyên cấu trúc: tiêu đề viết HOA, danh sách dùng dấu -, bảng giữ format. Chỉ trả text thuần, không thêm nhận xét." }
              ]
            }]
          },
          responseType: "text"
        });
        if (fnErr) throw new Error(fnErr.message || "Edge function error");
        var pdfData; try { pdfData = typeof rawPdf === "string" ? JSON.parse(rawPdf) : rawPdf; } catch (pe) { throw new Error("PDF response parse error: " + String(rawPdf).slice(0, 200)); }
        if (pdfData && pdfData.error) throw new Error(pdfData.error.message || "API error");
        const content = (pdfData?.content || []).map(c => c.text || "").join("") || "";
        setAiLoading(false); setAiStatus(content.length > 50 ? "" : "Không đọc được nội dung PDF");
        return { title, content: content || "", fromPdf: true };
      } catch (e) { setAiLoading(false); setAiStatus("Lỗi: " + e.message); return { title, content: "", error: true }; }
    }
    // Text files
    const content = await new Promise((res) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsText(file); });
    return { title, content };
  };

  // Quiz logic
  const startQuiz = (quiz) => { const s = { ...quiz, questions: shuffle(quiz.questions) }; setActiveQuiz(s); setQIdx(0); setQAnswers({}); qAnswersRef.current = {}; setQSel(null); setQShowExp(false); setQTimer(quiz.timeLimit || quiz.questions.length * 90); setQActive(true); setEssayGrading(false); setEssayResults([]); setEssayDraft(""); setScreen("emp_quiz_play"); };
  const answerQ = (val) => { if (qShowExp) return; setQSel(val); setQShowExp(true); const q = activeQuiz.questions[qIdx]; const correct = val === Number(q.ans); const newA = { ...qAnswersRef.current, [qIdx]: { selected: val, correct } }; setQAnswers(newA); qAnswersRef.current = newA; };
  const nextQ = () => {
    const q = activeQuiz.questions[qIdx];
    if (q.type === "essay") {
      // Store essay answer from draft
      const ans = essayDraft.trim();
      const newA = { ...qAnswersRef.current, [qIdx]: { selected: ans, correct: null, isEssay: true } };
      setQAnswers(newA); qAnswersRef.current = newA;
      setEssayDraft("");
    }
    if (qIdx < activeQuiz.questions.length - 1) { setQIdx(qIdx + 1); setQSel(null); setQShowExp(false); }
    else finishQuiz();
  };
  const finishQuiz = async () => {
    setQActive(false); clearInterval(qTimerRef.current);
    const answers = qAnswersRef.current, qs = activeQuiz.questions;
    const hasEssay = qs.some(q => q.type === "essay");
    const mcQs = qs.filter(q => q.type !== "essay");
    const essayQsList = qs.filter(q => q.type === "essay");
    const mcCorrect = Object.values(answers).filter(a => a.correct === true).length;
    // For essay: AI grades at the end. Initial pct computed from MC only
    let sc = mcCorrect, total = qs.length;
    let pct = total > 0 ? Math.round(sc / total * 100) : 0;
    // If has essay, go to grading screen first
    let essayGradingResults = [];
    if (hasEssay) {
      setEssayGrading(true); setScreen("emp_essay_grading");
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        if (q.type !== "essay") continue;
        const userAns = (answers[i] && answers[i].selected) || "(Không trả lời)";
        setAiStatus("AI đang chấm câu tự luận " + (essayGradingResults.length + 1) + "/" + essayQsList.length + "...");
        try {
          const gradingPrompt = `Chấm bài tự luận, trả về CHỈ JSON object (KHÔNG markdown):
{"score":8,"maxScore":10,"grade":"Tốt","feedback":"1 câu nhận xét tổng quát","explanation":"2-3 câu: phân tích ngắn gọn tiêu chí đạt và chưa đạt","strengthPoints":["điểm mạnh 1"],"improvementPoints":["cần cải thiện 1"]}

CÂU HỎI: ${q.q}
TIÊU CHÍ: ${q.rubric || "Chấm theo nội dung"}
ĐÁP ÁN MẪU: ${q.modelAnswer || ""}
BÀI LÀM: ${userAns}

CHỈ JSON. KHÔNG backtick.`;
          const txt = await callAIWithRetry(gradingPrompt);
          const parsed = cleanJSON(txt, false);
          essayGradingResults.push({ qIdx: i, q: q.q, userAns, score: parsed.score || 0, maxScore: parsed.maxScore || 10, grade: parsed.grade || "", feedback: parsed.feedback || "", explanation: parsed.explanation || "", strengthPoints: parsed.strengthPoints || [], improvementPoints: parsed.improvementPoints || [] });
          sc += Math.round((parsed.score || 0) / (parsed.maxScore || 10));// normalize to 1 point scale
        } catch (e) {
          essayGradingResults.push({ qIdx: i, q: q.q, userAns, score: 0, maxScore: 10, grade: "Lỗi", feedback: "Không chấm được do lỗi AI", explanation: "", strengthPoints: [], improvementPoints: [] });
        }
      }
      setEssayResults(essayGradingResults); setEssayGrading(false); setAiStatus("");
      // Recompute pct including essay
      const essayTotal = essayGradingResults.reduce((s, r) => s + r.score, 0);
      const essayMax = essayGradingResults.reduce((s, r) => s + r.maxScore, 0);
      // Weighted: MC as 1pt each, essays by their points
      const mcPts = mcCorrect; const totalMcPts = mcQs.length;
      const essayPts = essayMax > 0 ? Math.round(essayTotal / essayMax * essayQsList.length) : 0;
      sc = mcPts + essayPts; pct = total > 0 ? Math.round(sc / total * 100) : 0;
    }
    const _essayData = hasEssay && typeof essayGradingResults !== "undefined" ? { results: essayGradingResults, answers: Object.fromEntries(qs.map((q, i) => q.type === "essay" ? [i, (answers[i] && answers[i].selected) || ""] : null).filter(Boolean)) } : null;
    const result = { id: uid(), empId: currentUser.id, empName: currentUser.name, quizId: activeQuiz.id, quizTitle: activeQuiz.title, score: sc, total, pct, passed: pct >= settings.passScore, time: (activeQuiz.timeLimit || total * 90) - qTimer, date: new Date().toISOString(), dept: currentUser.dept, quizType: activeQuiz.quizType || "mc", essayData: _essayData };
    // Reload latest results from DB before appending (prevent overwrite)
    let latestResults = results;
    try { const fromDB = await DB.get("km-results", []); if (Array.isArray(fromDB) && fromDB.length >= latestResults.length) latestResults = fromDB; } catch (e) { }
    const newResults = [...latestResults, result]; setResults(newResults); await DB.set("km-results", newResults);
    let xp = sc * settings.xpCorrect; if (pct >= settings.passScore) xp += settings.xpPass; if (pct >= 90) xp += settings.xpBonus90; if (pct === 100) xp += settings.xpPerfect;
    // Auto-check challenges linked to this quiz
    let chUpdated = false;
    let wonRewardData = null;
    // Reload latest challenges from storage
    let latestChallenges = challenges;
    try { const fromDB = await DB.get("km-challenges", []); if (Array.isArray(fromDB) && fromDB.length > 0) latestChallenges = fromDB; } catch (e) { }
    const newChallenges = latestChallenges.map(ch => {
      if (ch.active === false || ch.quizId !== activeQuiz.id) return ch;
      if ((ch.completedBy || []).includes(currentUser.id)) return ch;
      if (!challengeVisibleTo(ch, currentUser)) return ch;
      const minScore = ch.minScore || settings.passScore;
      if (pct >= minScore) {
        chUpdated = true;
        xp += ch.xpReward || 0;
        let wonReward = null;
        if (ch.rewards && ch.rewards.length > 0) {
          wonReward = ch.rewards[Math.floor(Math.random() * ch.rewards.length)];
          wonRewardData = { rewards: ch.rewards, wonReward, chTitle: ch.title, xp: ch.xpReward || 0 };
        }
        return { ...ch, completedBy: [...(ch.completedBy || []), currentUser.id], wonRewards: { ...(ch.wonRewards || {}), [currentUser.id]: wonReward } };
      }
      return ch;
    });
    if (chUpdated) {
      setChallenges(newChallenges); await DB.set("km-challenges", newChallenges);
      // Save notifications for both employee and creator
      // Reload latest notifications
      let curNotifs = notifications;
      try { const nfDB = await DB.get("km-notifications", []); if (Array.isArray(nfDB) && nfDB.length >= curNotifs.length) curNotifs = nfDB; } catch (e) { }
      const newNotifs = [...curNotifs];
      const chDone = newChallenges.filter(ch => ch.quizId === activeQuiz.id && (ch.completedBy || []).includes(currentUser.id) && !challenges.find(c => c.id === ch.id && (c.completedBy || []).includes(currentUser.id)));
      chDone.forEach(ch => {
        const wonR = (ch.wonRewards && ch.wonRewards[currentUser.id]);
        newNotifs.push({ id: uid(), empId: currentUser.id, msg: "🎯 Thử thách hoàn thành: " + ch.title + " (+" + (ch.xpReward || 0) + " XP)" + (wonR ? " · 🎁 Bạn nhận: " + wonR : ""), type: "challenge", date: new Date().toISOString(), read: false });
        if (ch.createdBy) newNotifs.push({ id: uid(), empId: ch.createdBy, msg: "✅ " + currentUser.name + " hoàn thành: " + ch.title + " (" + pct + "%)" + (wonR ? " · 🎁 Đã nhận: " + wonR : ""), type: "challenge", date: new Date().toISOString(), read: false });
      });
      setNotifications(newNotifs); await DB.set("km-notifications", newNotifs);
    }
    // Save XP — reload accounts from DB first to avoid overwriting other users
    let latestAccounts = accountsRef.current;
    try { const acDB = await DB.get("km-accounts", []); if (Array.isArray(acDB) && acDB.length > 0) latestAccounts = acDB; } catch (e) { }
    const newAccounts = latestAccounts.map(a => a.id === currentUser.id ? { ...a, xp: (a.xp || 0) + xp, lastXpGainDate: today() } : a);
    setAccounts(newAccounts); accountsRef.current = newAccounts; await DB.set("km-accounts", newAccounts);
    // Update currentUser from saved data (not stale state)
    const savedUser = newAccounts.find(a => a.id === currentUser.id);
    if (savedUser) setCurrentUser(savedUser);
    if (wonRewardData) setRewardReveal(wonRewardData);
    setScreen("emp_quiz_result");
  };

  // Backup functions (passwords encoded for safety)
  const encPw = (s) => { try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return s; } };
  const decPw = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch (e) { return s; } };
  // Backup export - multiple methods for sandbox compatibility
  const [backupUrl, setBackupUrl] = useState(null);
  const [backupCopied, setBackupCopied] = useState(false);
  const [rewardReveal, setRewardReveal] = useState(null); // {rewards, wonReward, chTitle}
  const exportBackup = () => {
    const safeAccounts = accounts.map(a => { const { password, _enc, ...rest } = a; return rest; });
    const data = { accounts: safeAccounts, knowledge: knowledge.map(k => ({ ...k })), quizzes, results, recognitions, challenges, notifications, paths, bulletins, settings, exportDate: new Date().toISOString(), version: "v3" };
    const jsonStr = JSON.stringify(data, null, 2);
    const fname = `kingsmen-backup-${today()}.json`;
    // Method 1: data URI (works in sandboxed iframes where Blob URL is blocked)
    try {
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const dataUri = `data:application/json;charset=utf-8;base64,${b64}`;
      const a = document.createElement("a");
      a.href = dataUri;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setBackupCopied(false);
      // Also set a visible link as fallback
      setBackupUrl(dataUri);
      return;
    } catch (e) { }
    // Method 2: Blob URL fallback
    try {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setBackupUrl(url);
      setBackupCopied(false);
    } catch (e2) {
      // Method 3: clipboard only
      try { navigator.clipboard.writeText(jsonStr); setBackupCopied(true); } catch (e3) { }
      setBackupUrl(null);
    }
  };
  const exportQuizCSV = (quiz) => {
    const BOM = "﻿";
    const esc = (s) => { const v = String(s == null ? "" : s); return '"' + v.replace(/"/g, '""') + '"'; };
    const CRLF = "\r\n";
    const sep = ",";
    const lines = [];
    // ── Header block ──
    lines.push(esc("ĐỀ KIỂM TRA: " + quiz.title));
    lines.push(esc("Tổng số câu: " + quiz.questions.length)
      + sep + esc("Loại đề: " + (quiz.quizType === "mixed" ? "Kết hợp (TN + Tự luận)" : "Trắc nghiệm"))
      + sep + esc("Độ khó: " + (quiz.difficulty === "easy" ? "Dễ" : quiz.difficulty === "medium" ? "Trung bình" : quiz.difficulty === "hard" ? "Khó" : "Nâng cao"))
      + sep + esc("Ngày tạo: " + fmtDate(quiz.createdAt)));
    lines.push(""); // blank separator

    // ── Section A: Multiple Choice ──
    const mcQs = quiz.questions.filter(q => q.type !== "essay");
    if (mcQs.length > 0) {
      lines.push(esc("=== PHẦN A: TRẮC NGHIỆM (" + mcQs.length + " câu) ==="));
      lines.push([esc("STT"), esc("Loại"), esc("Câu hỏi"), esc("Đáp án A"), esc("Đáp án B"), esc("Đáp án C"), esc("Đáp án D"), esc("Đáp án ĐÚNG"), esc("Giải thích")].join(sep));
      mcQs.forEach((q, i) => {
        const isTF = q.type === "truefalse";
        const opts = q.opts || [];
        const ansIdx = Number(q.ans) || 0;
        const ansLabel = isTF ? (ansIdx === 0 ? "ĐÚNG" : "SAI") : (String.fromCharCode(65 + ansIdx) + ". " + opts[ansIdx]);
        lines.push([
          esc(i + 1),
          esc(isTF ? "Đúng/Sai" : "Trắc nghiệm"),
          esc(q.q || ""),
          esc(isTF ? "ĐÚNG" : opts[0] || ""),
          esc(isTF ? "SAI" : opts[1] || ""),
          esc(isTF ? "" : opts[2] || ""),
          esc(isTF ? "" : opts[3] || ""),
          esc(ansLabel),
          esc(q.exp || ""),
        ].join(sep));
      });
      lines.push(""); // blank
    }

    // ── Section B: Essay ──
    const essayQs = quiz.questions.filter(q => q.type === "essay");
    if (essayQs.length > 0) {
      lines.push(esc("=== PHẦN B: TỰ LUẬN (" + essayQs.length + " câu - AI chấm điểm) ==="));
      lines.push([esc("STT"), esc("Câu hỏi tự luận"), esc("Tiêu chí chấm (Rubric)"), esc("Đáp án mẫu"), esc("Điểm tối đa")].join(sep));
      essayQs.forEach((q, i) => {
        lines.push([
          esc(i + 1),
          esc(q.q || ""),
          esc(q.rubric || ""),
          esc(q.modelAnswer || ""),
          esc(q.points || 10),
        ].join(sep));
      });
      lines.push("");
    }

    const csv = BOM + lines.join(CRLF);
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = (quiz.title.replace(/[^a-zA-Z0-9À-ỹ\s]/g, "_").trim() || "de-thi") + "-cauhoi.csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { console.log("Export CSV error:", e); }
  };


  // ─── IMPORT QUIZ FROM EXCEL / CSV ───
  const importQuizFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const doImport = (rows) => {
      if (!rows || rows.length < 2) { setAiStatus("❌ File trống."); return; }

      let title = "", difficulty = "medium", depts = ["Tất cả"];
      let headerRowIdx = -1;

      // Scan rows to extract metadata and find header
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const cells = rows[i].map(c => String(c || "").trim());
        const joined = cells.join(" ");

        // Extract title from "KINGSMEN TRAINING — <TITLE>" row
        if (i < 3 && joined.includes("KINGSMEN")) {
          // Extract the content part after "TRAINING —" but before " – TYPE"
          const m = joined.match(/TRAINING[^—–]*[—–]+([^—–]+?)(?:[—–]|$)/i);
          if (m) title = m[1].replace(/[📝✍️📋]/g, "").trim();
          else {
            const sep = joined.split(/[—–]/);
            title = (sep[1] || sep[0]).replace(/[📝✍️📋]/g, "").trim();
          }
        }
        // Extract difficulty from "Độ khó: Trung bình..." row
        if (i < 4 && joined.includes("Độ khó")) {
          const m = joined.match(/Độ khó[^\w]*([\wÀ-ỹ\s]+?)(\s*[•|,]|$)/i);
          if (m) {
            const dl = m[1].trim().toLowerCase();
            if (dl.includes("nâng cao") || dl === "advanced") difficulty = "advanced";
            else if (dl.includes("khó") || dl === "hard") difficulty = "hard";
            else if (dl.includes("dễ") || dl === "easy") difficulty = "easy";
            else difficulty = "medium";
          }
        }
        // Config label format: find non-empty cell, check if next cell is value
        const nonEmpty = cells.map((c, ci) => ({ c, ci })).filter(x => x.c);
        if (nonEmpty.length >= 2) {
          const label = nonEmpty[0].c; const val = nonEmpty[1].c;
          if (label.includes("Tên đề") && val && !val.includes("Tên đề")) title = val;
          if (label.includes("Phòng ban") && val && !val.includes("Phòng ban"))
            depts = val === "Tất cả" ? ["Tất cả"] : [val];
          if (label.includes("Độ khó") && !label.includes("•") && val && !val.includes("Độ khó")) {
            const dl = val.toLowerCase();
            if (dl.includes("nâng cao") || dl === "advanced") difficulty = "advanced";
            else if (dl.includes("khó") || dl === "hard") difficulty = "hard";
            else if (dl.includes("dễ") || dl === "easy") difficulty = "easy";
            else difficulty = "medium";
          }
        }
        // Detect header row
        if (cells.some(c => c.includes("Câu hỏi")) && cells.some(c => c.includes("Loại"))) {
          headerRowIdx = i; break;
        }
      }

      if (!title) title = (file.name || "Đề kiểm tra").replace(/\.[^.]+$/, "").replace(/_/g, " ");
      const dataStart = headerRowIdx >= 0 ? headerRowIdx + 1 : 2;

      // Map column indices from header row
      let CI = { type: 2, q: 3, a: 4, b: 5, c: 6, d: 7, ans: 8, exp: 9 }; // defaults
      if (headerRowIdx >= 0) {
        rows[headerRowIdx].forEach((h, i) => {
          const v = String(h || "").trim().toLowerCase();
          if (v.includes("loại")) CI.type = i;
          else if (v.includes("câu hỏi")) CI.q = i;
          else if (v === "đáp án a" || v.endsWith(" a") || v === "a") CI.a = i;
          else if (v === "đáp án b" || v.endsWith(" b") || v === "b") CI.b = i;
          else if (v === "đáp án c" || v.endsWith(" c") || v === "c") CI.c = i;
          else if (v === "đáp án d" || v.endsWith(" d") || v === "d") CI.d = i;
          else if (v.includes("đáp án đúng") || (v.includes("đáp án") && !v.endsWith(" a") && !v.endsWith(" b") && !v.endsWith(" c") && !v.endsWith(" d"))) CI.ans = i;
          else if (v.includes("giải thích") || v.includes("rubric")) CI.exp = i;
        });
      }

      const normalizeType = (raw) => {
        const v = String(raw || "").trim().toLowerCase();
        if (!v) return null;
        if (v === "single" || v.includes("4 đáp") || v.includes("trắc nghiệm") || v === "tn") return "single";
        if (v === "truefalse" || v.includes("đúng/sai") || v.includes("đúng sai") || v === "true/false") return "truefalse";
        if (v === "essay" || v.includes("tự luận")) return "essay";
        return null;
      };
      const ansMap = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };

      const questions = [];
      for (let i = dataStart; i < rows.length; i++) {
        const r = rows[i];
        const g = (ci) => String(r[ci] || "").trim();
        const qtype = normalizeType(g(CI.type));
        const qText = g(CI.q);
        if (!qtype || !qText || qText.length < 3) continue;

        if (qtype === "essay") {
          questions.push({
            id: uid(), type: "essay", q: qText,
            rubric: g(CI.a), modelAnswer: g(CI.b), points: Number(g(CI.c)) || 10
          });
        } else if (qtype === "truefalse") {
          const ar = g(CI.ans);
          const ans = (ar === "Đúng" || ar.toLowerCase() === "đúng" || ar.toUpperCase() === "TRUE" || ar === "1") ? 0 : 1;
          questions.push({ id: uid(), type: "truefalse", q: qText, opts: ["Đúng", "Sai"], ans, exp: g(CI.exp) });
        } else {
          const opts = [g(CI.a), g(CI.b), g(CI.c), g(CI.d)].filter(v => v.length > 0);
          if (opts.length < 2) continue;
          const ar = g(CI.ans);
          const ans = ansMap[ar] !== undefined ? ansMap[ar] : Math.max(0, (Number(ar) || 1) - 1);
          questions.push({ id: uid(), type: "single", q: qText, opts, ans, exp: g(CI.exp) });
        }
      }

      if (questions.length === 0) { setAiStatus("❌ Không tìm thấy câu hỏi hợp lệ. Kiểm tra lại format file."); return; }
      const hasEssay = questions.some(q => q.type === "essay");
      const hasMC = questions.some(q => q.type !== "essay");
      const quizType = hasEssay && hasMC ? "mixed" : hasEssay ? "essay" : "mc";
      const quiz = {
        id: uid(), title, questions, timeLimit: questions.length * 90,
        createdAt: new Date().toISOString(), aiGenerated: false, importedFrom: file.name,
        depts, difficulty, quizType
      };
      // Show preview/confirm instead of saving immediately
      setImportPreview({ quiz, fileName: file.name });
      setAiStatus("");
    };

    if (ext === "csv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const rows = text.split(/\r?\n/).map(line => {
          // Simple CSV parse: split by comma, handle quoted fields
          const result = []; let cur = ""; let inQ = false;
          for (const ch of line + ",") {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
            else cur += ch;
          }
          return result;
        }).filter(r => r.some(c => c));
        doImport(rows);
      };
      reader.readAsText(file, "UTF-8");
    } else {
      // Excel — use SheetJS (load on demand if not ready)
      const loadXLSX = (cb) => {
        if (window.XLSX) return cb();
        setAiStatus("⏳ Đang tải thư viện đọc Excel...");
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => { setAiStatus(""); cb(); };
        s.onerror = () => setAiStatus("❌ Không tải được thư viện Excel. Hãy dùng CSV thay thế.");
        document.head.appendChild(s);
      };
      const reader = new FileReader();
      reader.onload = (e) => {
        loadXLSX(() => {
          try {
            const XLSX = window.XLSX;
            if (!XLSX) { setAiStatus("❌ Không tải được SheetJS. Dùng file CSV thay thế."); return; }
            const wb = XLSX.read(e.target.result, { type: "array" });
            // Try sheets in order: KH - Kết hợp > TN - Trắc nghiệm > TL - Tự luận > first sheet
            // Skip info/guide sheets, prefer sheets with actual quiz data
            const skipKeywords = ["hướng dẫn", "thông tin", "📋", "guide", "info", "readme"];
            const quizSheets = wb.SheetNames.filter(n => !skipKeywords.some(k => n.toLowerCase().includes(k)));
            // Among quiz sheets, prefer "kết hợp" (mixed) > others
            let sheetName = quizSheets.find(n => n.toLowerCase().includes("kết hợp") || n.toLowerCase().includes("mixed"))
              || quizSheets.find(n => n.toLowerCase().includes("trắc nghiệm") || n.toLowerCase().includes("tn"))
              || quizSheets[0]
              || wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
            doImport(rows);
          } catch (err) { setAiStatus("❌ Lỗi đọc file Excel: " + err.message); }
        }); // end loadXLSX
      };
      reader.readAsArrayBuffer(file);
    }
  };


  // ─── BUILD PROMPT FOR CLAUDE ───
  const buildPrompt = (context) => {
    const { type, knowledgeItem, numQ, difficulty, quizType, quizItem, accountsData, resultsData, quizTitle } = context;
    const diffLabel = { easy: "Dễ (nhận biết cơ bản)", medium: "Trung bình (hiểu & áp dụng)", hard: "Khó (phân tích tình huống)", advanced: "Nâng cao (tổng hợp, đánh giá)" }[difficulty || "medium"];

    if (type === "quiz_from_knowledge") {
      const content = knowledgeItem.content || "";
      const isMixed = quizType === "mixed";
      const essayCount = isMixed ? Math.max(1, Math.round(numQ * 0.3)) : 0;
      const mcCount = numQ - essayCount;
      const diffFull = { easy: "Dễ (nhận biết cơ bản)", medium: "Trung bình (hiểu & áp dụng)", hard: "Khó (phân tích tình huống)", advanced: "Nâng cao (tổng hợp, đánh giá)" }[difficulty || "medium"];
      return `Bạn là chuyên gia đào tạo nội bộ. Hãy tạo bộ câu hỏi kiểm tra từ nội dung bài học bên dưới.

══ THÔNG TIN ĐỀ ══
Tên đề kiểm tra: ${quizTitle}
Phòng ban: Tất cả
Độ khó: ${difficulty || "medium"}

══ YÊU CẦU ══
- Tổng số câu: ${numQ} câu
${isMixed ? `- Trắc nghiệm: ${mcCount} câu\n- Tự luận (AI chấm): ${essayCount} câu` : `- Loại: Trắc nghiệm thuần`}
- Độ khó: ${diffFull}
- Câu hỏi phải bám sát nội dung cụ thể

══ FORMAT CSV BẮT BUỘC ══
Dòng 1 (bắt buộc): Tên đề kiểm tra,${quizTitle}
Dòng 2 (bắt buộc): Phòng ban,Tất cả
Dòng 3 (bắt buộc): Độ khó,${difficulty || "medium"}
Dòng 4 (header):   STT,Loại,Câu hỏi,Đáp án A,Đáp án B,Đáp án C,Đáp án D,Đáp án đúng,Giải thích
Từ dòng 5 trở đi:  dữ liệu câu hỏi

Trắc nghiệm 4 đáp án:
STT,single,Nội dung câu hỏi,Đáp án A,Đáp án B,Đáp án C,Đáp án D,A (hoặc B/C/D),Giải thích 1-2 câu

Đúng/Sai:
STT,truefalse,Nội dung câu hỏi,,,,, Đúng (hoặc Sai),Giải thích 1-2 câu
${isMixed ? `
Tự luận (AI chấm):
STT,essay,Nội dung câu hỏi,Rubric chấm viết liên tục 1 dòng,Đáp án mẫu viết liên tục 1 dòng,,,,` : ""}

══ QUY TẮC QUAN TRỌNG ══
- Cột "Loại" phải ghi đúng: single / truefalse / essay (chữ thường không dấu)
- Đáp án đúng trắc nghiệm: chỉ 1 chữ A B C hoặc D
- Đáp án đúng đúng/sai: chỉ "Đúng" hoặc "Sai"
- TUYỆT ĐỐI không dùng dấu phẩy trong nội dung ô (làm vỡ CSV)
- Rubric và đáp án mẫu viết liên tục trên 1 dòng không xuống hàng
- Chỉ xuất CSV thuần không có markdown không có backtick không có giải thích thêm

══ VÍ DỤ MẪU ══
Tên đề kiểm tra,${quizTitle}
Phòng ban,Tất cả
Độ khó,${difficulty || "medium"}
STT,Loại,Câu hỏi,Đáp án A,Đáp án B,Đáp án C,Đáp án D,Đáp án đúng,Giải thích
1,single,Câu hỏi ví dụ về chủ đề X?,Lựa chọn A,Lựa chọn B,Lựa chọn C,Lựa chọn D,B,B đúng vì...
2,truefalse,Phát biểu về Y là đúng hay sai?,,,,, Đúng,Vì Z theo tài liệu...${isMixed ? `\n3,essay,Phân tích và trình bày về Z?,1) Nêu được X (4đ). 2) Giải thích Y (3đ). 3) Ví dụ Z (3đ).,Đáp án mẫu đầy đủ viết liên tục,,,,` : ""}

══ NỘI DUNG BÀI HỌC: ${knowledgeItem.title} ══
${content}`;
    }

    if (type === "quiz_no_content") {
      return `Bạn là chuyên gia đào tạo nội bộ. Hãy tạo bộ câu hỏi kiểm tra.

══ THÔNG TIN ĐỀ ══
Tên đề kiểm tra: ${quizTitle || "[ĐIỀN TÊN ĐỀ]"}
Phòng ban: Tất cả
Độ khó: ${difficulty || "medium"}

══ YÊU CẦU ══
- Số câu: ${numQ || 10} câu
- Loại: ${quizType === "mixed" ? "Kết hợp trắc nghiệm + tự luận" : "Trắc nghiệm"}
- Độ khó: ${diffLabel}
- Chủ đề: [DÁN NỘI DUNG TÀI LIỆU VÀO ĐÂY]

══ FORMAT CSV BẮT BUỘC ══
Tên đề kiểm tra,${quizTitle || "[TÊN ĐỀ]"}
Phòng ban,Tất cả
Độ khó,${difficulty || "medium"}
STT,Loại,Câu hỏi,Đáp án A,Đáp án B,Đáp án C,Đáp án D,Đáp án đúng,Giải thích
1,single,Câu hỏi?,A,B,C,D,B,Giải thích ngắn
2,truefalse,Câu đúng/sai?,,,,, Đúng,Giải thích ngắn

Quy tắc: Cột Loại ghi "single" / "truefalse" / "essay". Không dùng dấu phẩy trong ô. Chỉ xuất CSV thuần.`;
    }

    if (type === "analyze_results") {
      const myResults = (resultsData || []).filter(r => r.empId === context.empId);
      const avg = myResults.length ? Math.round(myResults.reduce((s, r) => s + r.pct, 0) / myResults.length) : 0;
      const weak = myResults.filter(r => !r.passed);
      return `Phân tích kết quả học tập của nhân viên và đưa ra khuyến nghị cải thiện.

══ DỮ LIỆU KẾT QUẢ ══
Nhân viên: ${context.empName}
Phòng ban: ${context.dept}
Tổng số lần thi: ${myResults.length}
Điểm trung bình: ${avg}%
Số bài chưa đạt: ${weak.length}
Các bài chưa đạt: ${weak.map(r => r.quizTitle + " (" + r.pct + "%)").join(", ") || "Không có"}

══ YÊU CẦU ══
1. Phân tích điểm mạnh và điểm yếu dựa trên dữ liệu
2. Đề xuất 3-5 hành động cụ thể để cải thiện
3. Gợi ý thứ tự ưu tiên học tập
4. Viết bằng tiếng Việt, ngắn gọn, thực tế`;
    }

    if (type === "create_challenge") {
      const quizList = (quizItem || []).map((q, i) => `${i + 1}. ${q.title} (${q.questions.length} câu)`).join("\n");
      return `Tạo thử thách đào tạo cho nhân viên Kingsmen.

══ THÔNG TIN ══
Đề thi có sẵn:
${quizList || "[Chưa có đề thi]"}

══ YÊU CẦU TẠO THỬ THÁCH ══
Hãy đề xuất 3 thử thách phù hợp với format sau:
- Tên thử thách: [tên ngắn, hấp dẫn]
- Đề thi liên kết: [tên đề từ danh sách trên]
- Điểm đạt tối thiểu: [%]
- XP thưởng: [điểm]
- Phần thưởng gợi ý: [2-3 phần thưởng thực tế]
- Hạn chót: [số ngày]
- Mô tả: [1 câu động lực]`;
    }

    if (type === "bulletin_draft") {
      return `Viết bài đăng bảng tin nội bộ cho hệ thống đào tạo Kingsmen.

══ LOẠI BÀI ══
${context.bulletinType === "policy" ? "📋 Chính sách / Quy định" : context.bulletinType === "news" ? "📰 Tin tức / Cập nhật" : context.bulletinType === "event" ? "🎉 Sự kiện" : "📢 Thông báo"}

══ YÊU CẦU ══
- Chủ đề: [ĐIỀN VÀO ĐÂY]
- Giọng văn: Chuyên nghiệp, thân thiện, rõ ràng
- Độ dài: 100-200 từ
- Kết thúc bằng 1 CTA cụ thể (ví dụ: "Liên hệ phòng HR" / "Xem chi tiết tại...")
- Viết bằng tiếng Việt`;
    }

    if (type === "lesson_from_knowledge") {
      var lContent = knowledgeItem.content || "";
      var lTitle = knowledgeItem.title || "[Tên bài]";
      var lDepts = (knowledgeItem.depts || ["Tất cả"]).join(", ");
      return "Bạn là chuyên gia đào tạo nội bộ công ty Kingsmen (vật liệu hoàn thiện chuyên dụng). Hãy tạo BÀI HỌC đầy đủ từ nội dung thô bên dưới.\n\n" +
        "══ THÔNG TIN ══\n" +
        "Tên bài học: " + lTitle + "\n" +
        "Phòng ban: " + lDepts + "\n\n" +
        "══ YÊU CẦU TẠO BÀI HỌC ══\n" +
        "1. Đọc kỹ nội dung thô và tạo bài học có cấu trúc rõ ràng\n" +
        "2. Chia thành các PHẦN (section) logic với tiêu đề\n" +
        "3. Mỗi phần gồm: Kiến thức chính + Ví dụ thực tế + Lưu ý quan trọng\n" +
        "4. Cuối bài có: Tóm tắt ngắn + 3-5 câu hỏi ôn tập nhanh (không cần đáp án)\n" +
        "5. Giọng văn: Dễ hiểu - chuyên nghiệp - thực tế - phù hợp nhân viên\n" +
        "6. Độ dài: 800-2000 từ tùy độ phức tạp của nội dung\n\n" +
        "══ FORMAT PLAIN TEXT BẮT BUỘC ══\n" +
        "- Xuất PLAIN TEXT thuần (không markdown - không backtick - không HTML)\n" +
        "- Dùng === để ngắt section và --- để ngắt phần nhỏ\n" +
        "- Dùng số thứ tự 1. 2. 3. cho các điểm chính\n" +
        "- KHÔNG dùng ** hay ## hay ``` hay bất kỳ markdown nào\n" +
        "- Viết bằng tiếng Việt có dấu đầy đủ\n\n" +
        "══ VÍ DỤ CẤU TRÚC ══\n" +
        "=== PHẦN 1: [TIÊU ĐỀ] ===\n\n" +
        "1. [Kiến thức chính]\n" +
        "2. [Kiến thức chính]\n\n" +
        "Ví dụ thực tế: [mô tả tình huống cụ thể]\n\n" +
        "Lưu ý: [điểm cần ghi nhớ]\n\n" +
        "---\n\n" +
        "=== PHẦN 2: [TIÊU ĐỀ] ===\n" +
        "...\n\n" +
        "=== TÓM TẮT ===\n" +
        "- Điểm 1\n" +
        "- Điểm 2\n\n" +
        "=== ÔN TẬP NHANH ===\n" +
        "1. Câu hỏi?\n" +
        "2. Câu hỏi?\n\n" +
        "══ NỘI DUNG THÔ CẦN XỬ LÝ: " + lTitle + " ══\n" +
        lContent;
    }

    if (type === "lesson_interactive_json") {
      var jContent = knowledgeItem.content || "";
      var jTitle = knowledgeItem.title || "[Tên bài]";
      return "Bạn là chuyên gia đào tạo nội bộ công ty Kingsmen. Tạo nội dung học tương tác từ kiến thức bên dưới.\n\nCHỈ trả về JSON thuần (KHÔNG markdown, KHÔNG backtick ```, KHÔNG giải thích thêm).\n\n" +
        "FORMAT JSON BẮT BUỘC:\n" +
        "{\n" +
        "  \"slides\": [\n" +
        "    {\"title\": \"Tiêu đề slide\", \"points\": [\"Ý chính 1\", \"Ý chính 2\", \"Ý chính 3\"], \"icon\": \"emoji\", \"highlight\": \"Câu quan trọng nhất\"}\n" +
        "  ],\n" +
        "  \"flashcards\": [\n" +
        "    {\"front\": \"Câu hỏi ngắn?\", \"back\": \"Đáp án ngắn\", \"icon\": \"emoji\"}\n" +
        "  ],\n" +
        "  \"cheatsheet\": {\n" +
        "    \"title\": \"Tóm tắt\",\n" +
        "    \"rows\": [{\"label\": \"Mục\", \"value\": \"Giá trị\"}]\n" +
        "  },\n" +
        "  \"miniQuiz\": [\n" +
        "    {\"q\": \"Câu hỏi?\", \"opts\": [\"A\", \"B\", \"C\", \"D\"], \"ans\": 0}\n" +
        "  ]\n" +
        "}\n\n" +
        "YÊU CẦU CHI TIẾT:\n" +
        "- slides: TỐI THIỂU 10 slides (nếu nội dung dài thì 12-15 slides). Mỗi slide có 3-5 points chi tiết, cụ thể, có số liệu nếu có. Highlight là câu quan trọng nhất. Icon là emoji phù hợp nội dung.\n" +
        "- flashcards: TỐI THIỂU 15 thẻ (nếu nhiều kiến thức thì 20 thẻ). Front là câu hỏi cụ thể, back là đáp án đầy đủ. Bao gồm cả câu hỏi so sánh, phân biệt, ứng dụng thực tế.\n" +
        "- cheatsheet: {title, rows:[{label,value}]} TỐI THIỂU 12 dòng. Label ngắn gọn, value chi tiết đầy đủ thông tin quan trọng.\n" +
        "- miniQuiz: TỐI THIỂU 10 câu hỏi trắc nghiệm. 4 lựa chọn, câu hỏi đa dạng (kiến thức, so sánh, tình huống, ứng dụng). ans=index đáp án đúng (0-3). Đảm bảo đáp án phân bố đều (không phải toàn bộ ans=0).\n" +
        "- Ngôn ngữ: Tiếng Việt, chuyên nghiệp, dễ hiểu.\n" +
        "- Nội dung phải ĐẦY ĐỦ, CHUYÊN SÂU, không bỏ sót kiến thức quan trọng.\n" +
        "- CHỈ trả về JSON thuần, KHÔNG markdown, KHÔNG backtick.\n\n" +
        "NỘI DUNG KIẾN THỨC: " + jTitle + "\n" +
        (jContent.length > 6000 ? jContent.slice(0, 6000) + "..." : jContent);
    }

    return "";
  };

  const copyBackup = () => {
    const safeAccounts = accounts.map(a => { const { password, _enc, ...rest } = a; return rest; });
    const data = { accounts: safeAccounts, knowledge: knowledge.map(k => ({ ...k })), quizzes, results, recognitions, challenges, notifications, paths, bulletins, settings, exportDate: new Date().toISOString(), version: "v3" };
    try { navigator.clipboard.writeText(JSON.stringify(data)); setBackupCopied(true); } catch (e) { }
  };
  const importBackup = (file) => {
    setImportStatus({ ok: null, msg: "⏳ Đang đọc file..." });
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.accounts && !data.knowledge && !data.quizzes) {
          setImportStatus({ ok: false, msg: "❌ File không hợp lệ — không tìm thấy dữ liệu Kingsmen." });
          return;
        }
        if (data.accounts) {
          const cleaned = data.accounts.map(a => { const { password, _enc, ...rest } = a; return rest; });
          setAccounts(cleaned); accountsRef.current = cleaned;
          await DB.set("km-accounts", cleaned);
        }
        if (data.knowledge) { setKnowledge(data.knowledge); await DB.set("km-knowledge", data.knowledge); }
        if (data.quizzes) { setQuizzes(data.quizzes); await DB.set("km-quizzes", data.quizzes); }
        if (data.results) { setResults(data.results); await DB.set("km-results", data.results); }
        if (data.recognitions) { setRecognitions(data.recognitions); await DB.set("km-recognitions", data.recognitions); }
        if (data.challenges) { setChallenges(data.challenges); await DB.set("km-challenges", data.challenges); }
        if (data.notifications) { setNotifications(data.notifications); await DB.set("km-notifications", data.notifications); }
        if (data.paths) { setPaths(data.paths); await DB.set("km-paths", data.paths); }
        if (data.bulletins) { setBulletins(data.bulletins); await DB.set("km-bulletins", data.bulletins); }
        if (data.settings) { setSettings(data.settings); await DB.set("km-settings", data.settings); }
        const msg = `✅ Khôi phục thành công!`
          + `\n👤 ${(data.accounts || []).length} tài khoản`
          + ` · 📚 ${(data.knowledge || []).length} kiến thức`
          + ` · 📝 ${(data.quizzes || []).length} đề thi`
          + `\n📊 ${(data.results || []).length} kết quả`
          + ` · 🎯 ${(data.challenges || []).length} thử thách`
          + ` · 📋 ${(data.paths || []).length} lộ trình`
          + ` · 📢 ${(data.bulletins || []).length} bảng tin`;
        setImportStatus({ ok: true, msg });
        setSaveStatus("saved");
      } catch (err) {
        setImportStatus({ ok: false, msg: "❌ Lỗi: " + err.message + ". File có thể bị hỏng hoặc không đúng định dạng." });
        console.log("Import error:", err);
      }
    };
    reader.onerror = () => setImportStatus({ ok: false, msg: "❌ Không đọc được file. Thử lại." });
    reader.readAsText(file);
  };

  // Analytics helpers
  const getAnalytics = (empId) => {
    const r = results.filter(x => x.empId === empId);
    const byQuiz = {}; r.forEach(x => { if (!byQuiz[x.quizTitle]) byQuiz[x.quizTitle] = []; byQuiz[x.quizTitle].push(x); });
    return { total: r.length, passed: r.filter(x => x.passed).length, avg: r.length ? Math.round(r.reduce((s, x) => s + x.pct, 0) / r.length) : 0, byQuiz };
  };
  const getDeptAnalytics = () => {
    const d = {}; DEPTS.forEach(dept => { const emps = accounts.filter(a => a.dept === dept); const rs = results.filter(r => emps.some(e => e.id === r.empId)); d[dept] = { total: emps.length, quizzes: rs.length, avg: rs.length ? Math.round(rs.reduce((s, x) => s + x.pct, 0) / rs.length) : 0, passed: rs.filter(r => r.passed).length }; }); return d;
  };
  const getKnowledgeGaps = () => {
    const gaps = [];
    quizzes.forEach(q => {
      DEPTS.forEach(dept => {
        const deptEmps = accounts.filter(a => a.dept === dept);
        const deptResults = results.filter(r => r.quizId === q.id && deptEmps.some(e => e.id === r.empId));
        const passRate = deptResults.length > 0 ? Math.round(deptResults.filter(r => r.passed).length / deptResults.length * 100) : null;
        if (passRate !== null && passRate < 70) gaps.push({ quiz: q.title, dept, passRate, count: deptResults.length });
      });
    });
    return gaps.sort((a, b) => a.passRate - b.passRate);
  };
  const getActivityData = () => {
    const last30 = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const quizzes = results.filter(r => r.date && r.date.slice(0, 10) === d).length;
      const logins = accounts.filter(a => (a.checkIns || []).includes(d)).length;
      last30.push({ date: d.slice(5), quizzes, logins });
    }
    return last30;
  };

  // Styles
  const card = { background: "rgba(12,123,111,0.06)", borderRadius: 14, border: `1px solid rgba(12,123,111,0.18)`, padding: 20, marginBottom: 12 };
  const btnG = { padding: "12px 24px", borderRadius: 10, background: `linear-gradient(135deg,${C.teal},${C.tealD})`, color: C.white, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" };
  const btnO = { padding: "10px 20px", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: C.white, fontSize: 13, fontWeight: 600, border: `1px solid ${C.border}`, cursor: "pointer" };
  const inp = { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid rgba(12,123,111,0.3)`, background: "rgba(12,123,111,0.12)", color: C.white, fontSize: 14 };
  const lbl = { display: "block", fontSize: 12, color: "rgba(201,168,76,0.8)", fontWeight: 600, marginBottom: 5 };
  const hd = (sz) => ({ fontFamily: "'Be Vietnam Pro',sans-serif", fontSize: sz, fontWeight: 800, color: C.white, lineHeight: 1.3 });
  const tag = (text, color) => <span style={{ fontSize: 10, padding: "5px 10px", borderRadius: 4, background: `${color}22`, color, fontWeight: 600 }}>{text}</span>;

  if (!ready) return <div style={{ minHeight: "100vh", background: C.dark, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: C.gold, fontSize: 18, animation: "pulse 1.5s infinite" }}>Đang tải hệ thống...</div></div>;

  var toDriveDirectUrl = function (url) {
    if (!url) return url;
    var m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return "https://drive.google.com/uc?export=download&id=" + m[1];
    if (/drive\.google\.com\/uc/.test(url)) return url;
    return url;
  };
  var toDriveImageUrl = function (url) {
    if (!url) return url;
    var m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1000";
    var m2 = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
    if (m2 && m2[1]) return "https://drive.google.com/thumbnail?id=" + m2[1] + "&sz=w1000";
    return url;
  };

  var parseContentLP = function (text, title) {
    if (!text) return [];
    var lines = text.split("\n");
    var sections = [];
    var cur = null;
    var icons = ["📌", "🎯", "📋", "⚡", "🔑", "💡", "📊", "🏆", "⭐", "🛡️", "📦", "🔄", "✅", "📝", "🎓", "💰", "⏰", "👔", "🤝", "⚖️"];
    var iconIdx = 0;
    var getIcon = function () { var ic = icons[iconIdx % icons.length]; iconIdx++; return ic; };
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var isHeader = false;
      if (line === line.toUpperCase() && line.length > 3 && line.length < 120 && /[A-ZÀ-Ỹ]/.test(line)) isHeader = true;
      if (/^(CHƯƠNG|PHẦN|MỤC|ĐIỀU|Chương|Phần|Điều)\s/i.test(line)) isHeader = true;
      if (/^\d+\.\s+[A-ZÀ-Ỹ]/.test(line) && line.length < 120) isHeader = true;
      if (isHeader) {
        cur = { title: line, icon: getIcon(), items: [], highlight: "" };
        sections.push(cur);
      } else if (cur) {
        if (/^[-•●]\s/.test(line) || /^[a-z]\.\s/.test(line)) {
          cur.items.push(line.replace(/^[-•●a-z]\.\s*/, ""));
        } else if (/^[""]/.test(line) || /[""]$/.test(line)) {
          cur.highlight = line.replace(/[""“”]/g, "");
        } else {
          cur.items.push(line);
        }
      } else {
        cur = { title: "", icon: getIcon(), items: [line], highlight: "" };
        sections.push(cur);
      }
    }
    return sections;
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,#0f2d3a,#1A3A4A)`, fontFamily: "'Google Sans','Be Vietnam Pro',sans-serif", overflowX: "hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&family=Google+Sans:wght@400;500;600;700&display=swap');
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes glowPulse{0%,100%{opacity:0.4;transform:translate(-50%,-50%) scale(1)}50%{opacity:0.7;transform:translate(-50%,-50%) scale(1.1)}}
*{box-sizing:border-box;margin:0;padding:0}input:focus,textarea:focus,select:focus{outline:2px solid ${C.teal};outline-offset:1px}
button{cursor:pointer;border:none;transition:all .15s}button:hover{filter:brightness(1.08);transform:translateY(-1px)}button:active{transform:translateY(0)}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${C.teal}55;border-radius:3px}
select{appearance:none;background-color:#0f2d3a !important;color:#FFFFFF !important}select option{background-color:#1A3A4A !important;color:#FFFFFF !important}input[type="date"]{color-scheme:dark}
.nav-scroll::-webkit-scrollbar{display:none}
@media(max-width:480px){body{font-size:13px}}`}</style>
      <div ref={topRef} />

      {/* ═══ MOTIVATIONAL QUOTE POPUP ═══ */}
      {showMotivation && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: "#0a1e2a", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn .6s" }} onClick={() => setShowMotivation(null)}>
          {/* Background gradient overlay - fully opaque */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "radial-gradient(ellipse at 50% 40%, " + (showMotivation.color || C.teal) + "18 0%, #0a1e2a 65%)", pointerEvents: "none" }}></div>
          {/* Subtle grid pattern */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.03, backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }}></div>
          <div onClick={function (e) { e.stopPropagation(); }} style={{ textAlign: "center", maxWidth: 480, width: "100%", position: "relative", padding: "40px 24px" }}>
            {/* Decorative glow */}
            <div style={{ position: "absolute", top: "45%", left: "50%", transform: "translate(-50%,-50%)", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, " + (showMotivation.color || C.teal) + "12 0%, transparent 65%)", pointerEvents: "none", animation: "glowPulse 4s ease-in-out infinite" }}></div>
            {/* Top accent line */}
            <div style={{ width: 50, height: 2, borderRadius: 2, background: "linear-gradient(90deg, transparent, " + (showMotivation.color || C.gold) + ", transparent)", margin: "0 auto 32px", opacity: 0.6 }}></div>
            {/* Kingsmen badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 24, background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)", marginBottom: 36 }}>
              <div style={{ width: 20, height: 20, background: C.gold, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Be Vietnam Pro',sans-serif", fontWeight: 900, fontSize: 10, color: C.dark }}>K</div>
              <span style={{ fontSize: 10, letterSpacing: 3, color: C.gold, fontWeight: 600 }}>KINGSMEN</span>
            </div>
            {/* Open quote mark */}
            <div style={{ fontSize: 64, color: (showMotivation.color || C.gold) + "22", fontFamily: "Georgia,serif", lineHeight: 0.5, marginBottom: 8 }}>{"“"}</div>
            {/* Quote text */}
            <div style={{ fontSize: 22, fontWeight: 500, color: "rgba(255,255,255,0.95)", fontFamily: "'Be Vietnam Pro',sans-serif", lineHeight: 1.7, marginBottom: 28, padding: "0 8px" }}>
              {showMotivation.quote}
            </div>
            {/* Author line */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 24, height: 1, background: (showMotivation.color || C.gold) + "44" }}></div>
              <div style={{ fontSize: 15, color: (showMotivation.color || C.gold), fontWeight: 700, letterSpacing: 1 }}>{showMotivation.author}</div>
              <div style={{ width: 24, height: 1, background: (showMotivation.color || C.gold) + "44" }}></div>
            </div>
            {/* Value tag */}
            <div style={{ display: "inline-block", padding: "5px 18px", borderRadius: 20, background: (showMotivation.color || C.gold) + "0d", border: "1px solid " + (showMotivation.color || C.gold) + "28", color: (showMotivation.color || C.gold) + "cc", fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 40 }}>
              {showMotivation.value}
            </div>
            {/* CTA button */}
            <div>
              <button onClick={() => setShowMotivation(null)} style={{ padding: "16px 52px", borderRadius: 14, background: "linear-gradient(135deg, " + C.teal + ", " + C.tealD + ")", color: C.white, fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", letterSpacing: 0.5, boxShadow: "0 6px 24px rgba(12,123,111,0.35)", transition: "all .2s" }}>
                {"Bắt đầu ngày mới! →"}
              </button>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.12)", marginTop: 24, letterSpacing: 1 }}>Nhấn để tiếp tục</div>
          </div>
        </div>
      )}

      {/* ═══ REWARD REVEAL OVERLAY ═══ */}
      {rewardReveal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: "rgba(10,45,58,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn .5s" }} onClick={() => setRewardReveal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ textAlign: "center", maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 14, color: C.gold, letterSpacing: 4, marginBottom: 12, animation: "pulse 1s infinite" }}>🎯 THỬ THÁCH HOÀN THÀNH</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.white, fontFamily: "'Be Vietnam Pro',sans-serif", marginBottom: 24 }}>{rewardReveal.chTitle}</div>
            <div style={{ fontSize: 13, color: `${C.gold}aa`, marginBottom: 8 }}>+{rewardReveal.xp} XP</div>

            {/* Reward boxes */}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>🎁 BỐC THĂM PHẦN THƯỞNG</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
              {rewardReveal.rewards.map((r, i) => {
                const isWon = r === rewardReveal.wonReward;
                return (
                  <div key={i} style={{ width: 90, padding: "16px 8px", borderRadius: 14, background: isWon ? `linear-gradient(160deg,${C.gold}33,${C.gold}11)` : "rgba(255,255,255,0.04)", border: isWon ? `2px solid ${C.gold}` : `1px solid ${C.border}`, textAlign: "center", position: "relative", animation: isWon ? `fadeIn .8s ${0.3 + i * 0.15}s both` : `fadeIn .5s ${i * 0.1}s both`, opacity: isWon ? 1 : 0.4, transform: isWon ? "scale(1.1)" : "scale(0.95)" }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{isWon ? "🎁" : "🎁"}</div>
                    <div style={{ fontSize: 11, color: isWon ? C.gold : "rgba(255,255,255,0.3)", fontWeight: isWon ? 700 : 400, lineHeight: 1.3 }}>{r}</div>
                    {isWon && <div style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: 11, background: C.gold, color: C.dark, fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>★</div>}
                  </div>
                );
              })}
            </div>

            {/* Won reward highlight */}
            <div style={{ padding: "18px 24px", borderRadius: 16, background: `linear-gradient(160deg,${C.gold}22,${C.gold}08)`, border: `2px solid ${C.gold}`, marginBottom: 20, animation: "fadeIn 1.2s both" }}>
              <div style={{ fontSize: 12, color: C.gold, letterSpacing: 2, marginBottom: 8, fontSize: 12 }}>BẠN NHẬN ĐƯỢC</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: C.white, fontFamily: "'Be Vietnam Pro',sans-serif" }}>🎁 {rewardReveal.wonReward}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Liên hệ người tạo thử thách để nhận thưởng!</div>
            </div>

            <button onClick={() => setRewardReveal(null)} style={{ ...btnG, padding: "14px 32px", fontSize: 15 }}>🎉 Tuyệt vời!</button>
          </div>
        </div>
      )}



      {/* ═══ IMPORT PREVIEW OVERLAY ═══ */}
      {importPreview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99997, background: "rgba(10,45,58,0.97)", display: "flex", flexDirection: "column", padding: 20, animation: "fadeIn .25s" }}>
          <div style={{ maxWidth: "min(640px, 95vw)", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", height: "100%", maxHeight: "92vh" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 13, color: C.goldL, fontWeight: 700, letterSpacing: 1 }}>📥 XÁC NHẬN IMPORT ĐỀ</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Kiểm tra và chỉnh sửa trước khi lưu vào hệ thống</div>
              </div>
              <button onClick={() => setImportPreview(null)} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", fontSize: 18, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Editable fields */}
            <div style={{ ...card, flexShrink: 0, padding: 16, marginBottom: 10 }}>
              {/* Title */}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>📝 Tên đề kiểm tra *</label>
                <input value={importPreview.quiz.title} onChange={e => setImportPreview({ ...importPreview, quiz: { ...importPreview.quiz, title: e.target.value } })} style={inp} placeholder="Nhập tên đề..." />
              </div>
              {/* Depts */}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>🏢 Phòng ban</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {["Tất cả", ...DEPTS].map(d => {
                    const on = (importPreview.quiz.depts || ["Tất cả"]).includes(d);
                    return <button key={d} onClick={() => {
                      let nd = on ? (importPreview.quiz.depts || []).filter(x => x !== d) : [...(importPreview.quiz.depts || []).filter(x => x !== "Tất cả"), d];
                      if (d === "Tất cả") nd = ["Tất cả"];
                      if (!nd.length) nd = ["Tất cả"];
                      setImportPreview({ ...importPreview, quiz: { ...importPreview.quiz, depts: nd } });
                    }} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: on ? 700 : 500, background: on ? `${C.teal}22` : "rgba(255,255,255,0.03)", color: on ? C.teal : "rgba(255,255,255,0.35)", border: `1px solid ${on ? C.teal + "44" : C.border}` }}>{on ? "✓ " : ""}{d}</button>;
                  })}
                </div>
              </div>
              {/* Difficulty */}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>🎯 Độ khó</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ v: "easy", l: "🟢 Dễ" }, { v: "medium", l: "🟡 TB" }, { v: "hard", l: "🟠 Khó" }, { v: "advanced", l: "🔴 NC" }].map(opt => (
                    <button key={opt.v} onClick={() => setImportPreview({ ...importPreview, quiz: { ...importPreview.quiz, difficulty: opt.v } })} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: (importPreview.quiz.difficulty || "medium") === opt.v ? `${C.gold}22` : "rgba(255,255,255,0.03)", color: (importPreview.quiz.difficulty || "medium") === opt.v ? C.gold : "rgba(255,255,255,0.4)", border: `1px solid ${(importPreview.quiz.difficulty || "medium") === opt.v ? C.gold + "55" : C.border}` }}>{opt.l}</button>
                  ))}
                </div>
              </div>
              {/* Time limit */}
              <div>
                <label style={lbl}>⏱ Thời gian làm bài (giây)</label>
                <input type="number" value={importPreview.quiz.timeLimit || 1800} onChange={e => setImportPreview({ ...importPreview, quiz: { ...importPreview.quiz, timeLimit: Math.max(60, +e.target.value) } })} style={{ ...inp, width: 120 }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>{Math.floor((importPreview.quiz.timeLimit || 1800) / 60)} phút</span>
              </div>
            </div>

            {/* Stats summary */}
            <div style={{ ...card, flexShrink: 0, padding: 14, marginBottom: 10, background: `${C.teal}06` }}>
              <div style={{ fontSize: 12, color: C.teal, fontWeight: 700, marginBottom: 8 }}>📊 THỐNG KÊ ĐỀ</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8, textAlign: "center" }}>
                {[
                  { l: "Tổng câu", v: importPreview.quiz.questions.length, c: C.white },
                  { l: "Trắc nghiệm", v: importPreview.quiz.questions.filter(q => q.type === "single").length, c: C.teal },
                  { l: "Đúng/Sai", v: importPreview.quiz.questions.filter(q => q.type === "truefalse").length, c: C.gold },
                  { l: "Tự luận", v: importPreview.quiz.questions.filter(q => q.type === "essay").length, c: C.purple },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "10px 6px", borderRadius: 10, background: `${s.c}08`, border: `1px solid ${s.c}22` }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.c, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                File: {importPreview.fileName} &nbsp;·&nbsp; Loại đề: {importPreview.quiz.quizType === "mixed" ? "📝 Kết hợp" : importPreview.quiz.quizType === "essay" ? "✍️ Tự luận" : "✅ Trắc nghiệm"}
              </div>
            </div>

            {/* Preview questions (scrollable) */}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.goldL, fontWeight: 700, marginBottom: 6 }}>XEM TRƯỚC CÂU HỎI</div>
              {importPreview.quiz.questions.slice(0, 5).map((q, i) => (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${q.type === "essay" ? C.purple + "33" : q.type === "truefalse" ? C.gold + "33" : C.teal + "22"}`, marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10, padding: "5px 10px", borderRadius: 4, background: q.type === "essay" ? `${C.purple}22` : q.type === "truefalse" ? `${C.gold}22` : `${C.teal}22`, color: q.type === "essay" ? C.purple : q.type === "truefalse" ? C.gold : C.teal, fontWeight: 700, flexShrink: 0 }}>{i + 1}. {q.type === "essay" ? "TL" : q.type === "truefalse" ? "Đ/S" : "TN"}</span>
                    <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 1.5 }}>{q.q}</span>
                  </div>
                </div>
              ))}
              {importPreview.quiz.questions.length > 5 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: 8 }}>...và {importPreview.quiz.questions.length - 5} câu nữa</div>}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <button onClick={() => {
                if (!(importPreview.quiz.title || "").trim()) { setAiStatus("⚠️ Vui lòng nhập tên đề!"); return; }
                const newQ = [...quizzes, importPreview.quiz];
                setQuizzes(newQ); save("km-quizzes", newQ);
                setImportPreview(null);
                setAiStatus(`✅ Đã import "${importPreview.quiz.title}" — ${importPreview.quiz.questions.length} câu`);
              }} style={{ flex: 1, padding: "14px", borderRadius: 12, background: `linear-gradient(135deg,${C.teal},${C.tealD})`, color: C.white, fontSize: 15, fontWeight: 800, border: "none" }}>
                ✅ Xác nhận Import
              </button>
              <button onClick={() => setImportPreview(null)} style={{ padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600, border: `1px solid ${C.border}` }}>Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PROMPT PANEL OVERLAY ═══ */}
      {promptPanel && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998, background: "rgba(10,45,58,0.96)", display: "flex", flexDirection: "column", padding: 20, animation: "fadeIn .25s" }} onClick={() => setPromptPanel(null)}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "min(720px, 95vw)", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", height: "100%", maxHeight: "92vh" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 13, color: C.goldL, fontWeight: 700, letterSpacing: 1 }}>📋 PROMPT ĐÃ TẠO</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{promptPanel.title || "prompt"}</div>
              </div>
              <button onClick={() => setPromptPanel(null)} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", fontSize: 18, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            {/* Actions TOP — download + copy */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0 }}>
              {/* Download as .txt */}
              <button onClick={() => {
                try {
                  const fname = (promptPanel.title || "prompt").replace(/[^a-zA-Z0-9À-ỹ\s]/g, "_").trim() + ".txt";
                  const blob = new Blob([promptPanel.text], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = fname;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 3000);
                } catch (e) { alert("Trình duyệt không hỗ trợ download. Dùng Copy thay thế."); }
              }} style={{ flex: 1, padding: "12px", borderRadius: 10, background: `linear-gradient(135deg,${C.gold},${C.goldL})`, color: C.dark, fontSize: 14, fontWeight: 800, border: "none" }}>
                ⬇️ Tải file .txt
              </button>
              <button onClick={async () => {
                try { await navigator.clipboard.writeText(promptPanel.text); setPromptCopied(true); setTimeout(() => setPromptCopied(false), 2500); }
                catch (e) { const ta = document.createElement("textarea"); ta.value = promptPanel.text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); setPromptCopied(true); setTimeout(() => setPromptCopied(false), 2500); }
              }} style={{ flex: 1, padding: "12px", borderRadius: 10, background: promptCopied ? `linear-gradient(135deg,${C.green},${C.greenD})` : `rgba(255,255,255,0.06)`, color: promptCopied ? C.white : "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700, border: `1px solid ${promptCopied ? C.green : C.border}`, transition: "all .3s" }}>
                {promptCopied ? "✅ Đã copy!" : "📋 Copy text"}
              </button>
              <button onClick={() => setPromptPanel(null)} style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", fontSize: 13, border: `1px solid ${C.border}` }}>✕</button>
            </div>
            {/* Prompt preview */}
            <div style={{ flex: 1, overflowY: "auto", background: "rgba(0,0,0,0.35)", borderRadius: 12, border: `1px solid ${C.teal}33`, padding: "14px 16px", fontFamily: "'Courier New',monospace", fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {promptPanel.text}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 8, flexShrink: 0 }}>
              ⬇️ Tải .txt → Mở claude.ai → Tải file lên → Claude tạo CSV → Import vào app
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{ background: "linear-gradient(135deg," + C.tealD + "," + C.dark + ")", borderBottom: "2px solid " + C.gold, padding: "8px 12px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, cursor: role === "admin" ? "pointer" : "default" }} onClick={() => { if (role === "admin" && logoInputRef.current) logoInputRef.current.click(); }}>
            {companyLogo ? (<img src={companyLogo} alt="Logo" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "contain", background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />) : (<div style={{ width: 32, height: 32, background: C.gold, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Be Vietnam Pro',sans-serif", fontWeight: 900, fontSize: 14, color: C.dark, flexShrink: 0 }}>K</div>)}
            <div style={{ minWidth: 0 }}><div style={{ fontFamily: "'Be Vietnam Pro',sans-serif", fontWeight: 800, fontSize: 14, color: C.white, letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>KINGSMEN</div><div style={{ fontSize: 11, color: C.goldL, letterSpacing: 2 }}>Training Platform v3</div></div>
            {role === "admin" && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 2, padding: "4px 7px", borderRadius: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>🖼 Logo</div>}
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {saveStatus && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, background: saveStatus === "saved" ? (C.green + "22") : (C.red + "22"), color: saveStatus === "saved" ? C.green : C.red, animation: "fadeIn .3s" }}>{saveStatus === "saved" ? "Saved" : "Error"}</span>}
            {currentUser && (currentUser.accRole === "director" || currentUser.empId === "admin") && (
              <button
                onClick={() => {
                  if (role === "admin") { setRole("employee"); setScreen("emp_home"); }
                  else { setRole("admin"); setScreen("admin_home"); }
                }}
                style={{ padding: "4px 8px", background: `${C.gold}22`, borderRadius: 4, fontSize: 10, fontWeight: 700, color: C.gold, border: `1px solid ${C.gold}44`, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {role === "admin" ? "🔄 Về học viên" : "🎩 Về trang QL"}
              </button>
            )}
            {currentUser && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", position: "relative", minWidth: 0 }} onClick={() => { if (avatarInputRef.current) avatarInputRef.current.click(); }}>
                {currentUser.avatar ? (<img src={currentUser.avatar} alt="av" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "2px solid " + C.gold + "55", flexShrink: 0 }} />) : (<span style={{ fontSize: 14, flexShrink: 0 }}>{gL(currentUser.xp || 0).icon}</span>)}
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>{currentUser.name}</span>
                {currentUser.streak > 0 && <span style={{ fontSize: 11, color: C.orange, flexShrink: 0 }}>{"🔥" + currentUser.streak}</span>}
                <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleAvatarUpload(e, currentUser.id)} />
              </div>
            )}
            {role && <button onClick={async () => { try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) { } setRole(null); setScreen("login"); setCurrentUser(null); setSubScreen(null); setFormData({}); Session.clear("km-session"); }} style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", padding: "6px 12px", borderRadius: 6, fontSize: 11, border: "1px solid " + C.border }}>Logout</button>}
          </div>
        </div>
        {role === "employee" && currentUser && (
          <div className="nav-scroll" style={{ display: "flex", gap: 2, background: "rgba(0,0,0,0.15)", padding: "4px 6px", borderTop: "1px solid rgba(255,255,255,0.06)", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {[
              { i: "🏠", t: "HOME", s: "emp_home" },
              { i: "📖", t: "HỌC", s: "emp_knowledge" },
              { i: "✏️", t: "THI", s: "emp_quizzes" },
              { i: "📊", t: "KẾT QUẢ", s: "emp_results" },
              { i: "🏆", t: "HẠNG", s: "emp_ranking" },
              { i: "🎯", t: "THÁCH", s: "emp_challenges" },
              { i: "🧠", t: "NLỰC", s: "emp_competency" },
              { i: "📢", t: "TIN", s: "emp_bulletins" },
            ].map(function (m) { return <button key={m.s} onClick={function () { setScreen(m.s); setSubScreen(null) }} style={{ padding: "10px 12px", fontSize: 11, fontWeight: screen === m.s ? 800 : 600, color: screen === m.s ? "#fff" : "rgba(255,255,255,0.5)", background: "none", border: "none", borderBottom: screen === m.s ? "3px solid " + C.gold : "3px solid transparent", whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0, minHeight: 44 }}>{m.i + " " + m.t}</button> })}
          </div>
        )}
        {role === "admin" && (
          <div className="nav-scroll" style={{ display: "flex", gap: 2, background: "rgba(0,0,0,0.15)", padding: "4px 6px", borderTop: "1px solid rgba(255,255,255,0.06)", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {[
              { i: "🏠", t: "HOME", s: "admin_home" },
              { i: "📚", t: "BÀI HỌC", s: "admin_lessons" },
              { i: "🤖", t: "ĐỀ THI", s: "admin_quizzes" },
              { i: "🎯", t: "THỬ THÁCH", s: "admin_challenges" },
              { i: "📢", t: "BẢNG TIN", s: "admin_bulletins" },
              { i: "📊", t: "NĂNG LỰC", s: "admin_analytics" },
              { i: "🏆", t: "XẾP HẠNG", s: "admin_ranking" },
              { i: "📈", t: "HOẠT ĐỘNG", s: "admin_activity" },
              { i: "👥", t: "TÀI KHOẢN", s: "admin_accounts" },
              { i: "⚙️", t: "CÀI ĐẶT", s: "admin_settings" },
              { i: "💾", t: "SAO LƯU", s: "admin_backup" },
            ].map(function (m) { return <button key={m.s} onClick={function () { setScreen(m.s); setSubScreen(null) }} style={{ padding: "10px 12px", fontSize: 11, fontWeight: screen === m.s ? 800 : 600, color: screen === m.s ? "#fff" : "rgba(255,255,255,0.5)", background: "none", border: "none", borderBottom: screen === m.s ? "3px solid " + C.teal : "3px solid transparent", whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0, minHeight: 44 }}>{m.i + " " + m.t}</button> })}
          </div>
        )}
      </header>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "12px 10px 60px" }}>

        {/* ═══ LOGIN ═══ */}
        {screen === "login" && (
          <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px 16px", background: C.bg }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              {settings.logo ? <img src={settings.logo} alt="logo" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", margin: "0 auto 8px" }} /> : <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg," + C.gold + "," + C.gold + "aa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: C.bg, margin: "0 auto 8px" }}>{"K"}</div>}
              <div style={{ fontSize: 11, letterSpacing: 4, color: C.goldL, textTransform: "uppercase" }}>{"Kingsmen Academy"}</div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4 }}>{"Đăng Nhập"}</h1>
            </div>
            <div style={{ width: "100%", maxWidth: 360 }}>
              <div style={{ ...card, padding: 24 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: C.goldL, fontWeight: 700, display: "block", marginBottom: 4 }}>{"Mã NV hoặc Admin"}</label>
                  <input value={formData.empId || ""} onChange={function (e) { setFormData(Object.assign({}, formData, { empId: e.target.value, loginErr: null })) }} placeholder="VD: 001 hoặc admin" style={{ ...inp, fontSize: 15, padding: "14px 16px" }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: C.goldL, fontWeight: 700, display: "block", marginBottom: 4 }}>{"Mật khẩu"}</label>
                  <div style={{ position: "relative" }}>
                    <input type={formData.showPw ? "text" : "password"} value={formData.pw || ""} onChange={function (e) { setFormData(Object.assign({}, formData, { pw: e.target.value, loginErr: null })) }} placeholder="Mật khẩu" onKeyDown={function (e) { if (e.key === "Enter") { var btn = document.getElementById("km-login-btn"); if (btn) btn.click() } }} style={{ ...inp, fontSize: 15, padding: "14px 44px 14px 16px", width: "100%" }} />
                    <button type="button" onClick={function () { setFormData(Object.assign({}, formData, { showPw: !formData.showPw })) }} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>{formData.showPw ? "🙈" : "👁"}</button>
                  </div>
                </div>
                {formData.loginErr && <div style={{ color: C.red, fontSize: 12, marginBottom: 10, textAlign: "center" }}>{formData.loginErr}</div>}
                <button id="km-login-btn" disabled={!!formData.loginLoading} onClick={async function () {
                  var id = (formData.empId || "").trim(); var pw = (formData.pw || "").trim();
                  if (!id || !pw) { setFormData(Object.assign({}, formData, { loginErr: "Nhập mã NV và mật khẩu" })); return }
                  setFormData(Object.assign({}, formData, { loginLoading: true, loginErr: null }));
                  try {
                    var email = id.toLowerCase() + "@kingsmen.internal";
                    var { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password: pw });
                    if (authErr) { setFormData(Object.assign({}, formData, { loginErr: "Sai mã NV hoặc mật khẩu", loginLoading: false })); return }
                    var { data: profile, error: pErr } = await supabase.from("profiles").select("*").eq("id", authData.user.id).single();
                    if (pErr || !profile) { setFormData(Object.assign({}, formData, { loginErr: "Không tìm thấy hồ sơ nhân viên", loginLoading: false })); return }
                    if (profile.status === "inactive") { await supabase.auth.signOut({ scope: 'local' }); setFormData(Object.assign({}, formData, { loginErr: "Tài khoản đã bị vô hiệu hóa. Liên hệ Admin.", loginLoading: false })); return }
                    if (profile.emp_id === "admin" || profile.acc_role === "director") { var adminAcc = profileToCamel(profile); var updatedAdmin = await doCheckIn(adminAcc); setCurrentUser(updatedAdmin); setRole("admin"); setScreen("admin_home"); setFormData({}); Session.set("km-session", { role: "admin" }); await loadAllData(); return }
                    var acc = profileToCamel(profile);
                    var updated = await doCheckIn(acc);
                    setCurrentUser(updated); setRole("employee"); setScreen("emp_home"); setFormData({});
                    Session.set("km-session", { role: "employee", userId: updated.id, screen: "emp_home" });
                    setShowMotivation(getRandomQuote());
                  } catch (e) { setFormData(Object.assign({}, formData, { loginErr: "Đã xảy ra lỗi, vui lòng thử lại.", loginLoading: false })); }
                }} style={{ width: "100%", padding: "16px", borderRadius: 12, background: "linear-gradient(135deg," + C.teal + "," + C.tealD + ")", color: "#fff", fontSize: 16, fontWeight: 800, border: "none", cursor: formData.loginLoading ? "not-allowed" : "pointer", opacity: formData.loginLoading ? 0.7 : 1 }}>{formData.loginLoading ? "Đang đăng nhập..." : "Đăng nhập →"}</button>
              </div>
              <div style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Quên mật khẩu? Liên hệ Admin để được hỗ trợ.</div>
              {(accounts.length > 0 || knowledge.length > 0 || quizzes.length > 0) && <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.15)" }}>{accounts.length + " tài khoản · " + knowledge.length + " bài · " + quizzes.length + " đề"}</div>}
            </div>
          </div>
        )}


        {/* ═══ ADMIN HOME ═══ */}
        {role === "admin" && screen === "admin_home" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <h2 style={{ ...hd(24), marginBottom: 20 }}>🏠 Bảng Điều Khiển</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10, marginBottom: 16 }}>
              {[{ l: "Nhân viên", v: accounts.length, i: "👥", c: C.blue }, { l: "Bài kiến thức", v: knowledge.length, i: "📚", c: C.green }, { l: "Đề kiểm tra", v: quizzes.length, i: "📝", c: C.purple }, { l: "Lượt thi", v: results.length, i: "📊", c: C.orange }].map((s, i) => (
                <div key={i} style={{ background: `${s.c}0a`, borderRadius: 12, padding: "14px 12px", border: `1px solid ${s.c}22`, textAlign: "center" }}>
                  <div style={{ fontSize: 20, marginBottom: 3 }}>{s.i}</div><div style={{ fontSize: 20, fontWeight: 800, color: s.c, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{s.v}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 8 }}>{"QUẢN LÝ ĐÀO TẠO"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8, marginBottom: 16 }}>
              {[
                { i: "📚", t: "Bài Học & Kiến Thức", d: knowledge.length + " bài · " + knowledge.filter(function (k2) { return k2.interactive }).length + " đã tạo", s: "admin_lessons" },
                { i: "🤖", t: "Đề Kiểm Tra", d: quizzes.length + " đề · Claude AI", s: "admin_quizzes" },
                { i: "🎯", t: "Thử Thách & Lộ Trình", d: "Challenge + Path", s: "admin_challenges" },
                { i: "📢", t: "Bảng Tin", d: bulletins.length + " bài đăng", s: "admin_bulletins" },
              ].map(function (c2, ci) {
                return (
                  <button key={ci} onClick={function () { setScreen(c2.s) }} style={{ background: "rgba(12,123,111,0.07)", borderRadius: 14, padding: "18px 14px", border: "1px solid rgba(12,123,111,0.2)", textAlign: "left", width: "100%" }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{c2.i}</div><div style={{ fontFamily: "'Be Vietnam Pro',sans-serif", fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 2 }}>{c2.t}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{c2.d}</div>
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 8 }}>{"BÁO CÁO & PHÂN TÍCH"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, marginBottom: 16 }}>
              {[
                { i: "📊", t: "Năng Lực", d: "Radar + Gap", s: "admin_analytics" },
                { i: "🏆", t: "Xếp Hạng", d: "Bảng xếp hạng", s: "admin_ranking" },
                { i: "📈", t: "Hoạt Động", d: "30 ngày", s: "admin_activity" },
              ].map(function (c2, ci) {
                return (
                  <button key={ci} onClick={function () { setScreen(c2.s) }} style={{ background: "rgba(197,153,62,0.06)", borderRadius: 12, padding: "14px 10px", border: "1px solid rgba(197,153,62,0.15)", textAlign: "center", width: "100%" }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{c2.i}</div><div style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{c2.t}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{c2.d}</div>
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 8 }}>{"HỆ THỐNG"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 6 }}>
              {[
                { i: "👥", t: "Tài Khoản", s: "admin_accounts" },
                { i: "⚙️", t: "Cài Đặt", s: "admin_settings" },
                { i: "💾", t: "Sao Lưu", s: "admin_backup" },
                { i: "📋", t: "Changelog", s: "admin_changelog" },
              ].map(function (c2, ci) {
                return (
                  <button key={ci} onClick={function () { setScreen(c2.s) }} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 8px", border: "1px solid rgba(255,255,255,0.08)", textAlign: "center", width: "100%" }}>
                    <div style={{ fontSize: 16, marginBottom: 3 }}>{c2.i}</div><div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{c2.t}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ ADMIN: KNOWLEDGE (with file upload + AI lessons) ═══ */}

        {role === "admin" && screen === "admin_lessons" && (
          <div style={{ animation: "fadeIn .4s" }}>
            {/* ── LIST VIEW ── */}
            {!subScreen && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <h2 style={hd(20)}>{"📚 Bài Học & Kiến Thức"}</h2>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{knowledge.length + " bài · " + knowledge.filter(function (k2) { return k2.interactive }).length + " có interactive"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={function () { var nid = "k" + Date.now(); updKnowledge([].concat(knowledge, [{ id: nid, title: "Bài mới", content: "", depts: ["Tất cả"], docUrl: "", hasPdf: false, pdfName: "", videoUrl: "", audioUrl: "", images: [], createdAt: new Date().toISOString() }])); setSubScreen(nid) }} style={{ ...btnG, padding: "8px 12px", fontSize: 11 }}>{"+ Thêm"}</button>
                    <label style={{ ...btnO, padding: "8px 12px", fontSize: 11, display: "inline-flex", alignItems: "center", cursor: "pointer" }}>{aiLoading ? "⏳" : "📎 File"}<input type="file" accept=".txt,.md,.csv,.pdf" disabled={aiLoading} style={{ display: "none" }} onChange={function (e) { if (e.target.files[0]) { handleFileUpload(e.target.files[0]).then(function (f) { if (f.content && f.content.length > 10) { var nid = "k" + Date.now(); var newK = { id: nid, title: f.title, content: f.content, depts: ["Tất cả"], docUrl: "", videoUrl: "", audioUrl: "", images: [], hasPdf: f.fromPdf || false, createdAt: new Date().toISOString() }; updKnowledge([].concat(knowledge, [newK])); if (f.fromPdf && formData.pdfBase64) { DB.set("km-pdf-" + nid, formData.pdfBase64).catch(function () { }) } setSubScreen(nid); } }) } }} /></label>
                    <button onClick={function () { setScreen("admin_home") }} style={{ ...btnO, padding: "8px 12px", fontSize: 11 }}>{"←"}</button>
                  </div>
                </div>
                {aiStatus && <div style={{ textAlign: "center", color: C.goldL, fontSize: 12, marginBottom: 8 }}>{aiStatus}</div>}
                {knowledge.map(function (k) {
                  var hasL = !!k.interactive;
                  var sl = hasL && k.interactive.slides ? k.interactive.slides.length : 0;
                  var fc = hasL && k.interactive.flashcards ? k.interactive.flashcards.length : 0;
                  return (
                    <div key={k.id} onClick={function () { setSubScreen(k.id) }} style={{ ...card, cursor: "pointer", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "3px solid " + (hasL ? C.teal : C.orange) }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.white, marginBottom: 4 }}>{k.title}</div>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: k.hasPdf && k.pdfName ? 4 : 0 }}>
                          {(k.depts || []).map(function (d) { return <span key={d}>{tag(d, d === "Tất cả" ? C.green : C.blue)}</span> })}
                          {hasL && tag(sl + "S " + fc + "F", C.teal)}
                          {!!(k.docUrl) && tag("🔗 Link", C.blue)}
                          {!!(k.videoUrl) && tag("🎬 Video", C.red)}
                          {!!(k.audioUrl) && tag("🎧 Audio", "#9b59b6")}
                          {k.images && k.images.length > 0 && tag(k.images.length + " 🖼️", C.gold)}
                        </div>
                        {k.hasPdf && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 4, background: C.purple + "18", border: "1px solid " + C.purple + "33" }}>
                            <span style={{ fontSize: 12 }}>{"📄"}</span>
                            <span style={{ fontSize: 12, color: C.purple, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{k.pdfName || "PDF đính kèm"}</span>
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)", flexShrink: 0, marginLeft: 8 }}>{"→"}</span>
                    </div>
                  );
                })}
                {knowledge.length === 0 && <Empty msg={"Bấm + Thêm để tạo bài đầu tiên."} />}
              </div>
            )}

            {/* ── DETAIL VIEW ── */}
            {subScreen && knowledge.find(function (x) { return x.id === subScreen }) && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ ...hd(18), margin: 0 }}>{knowledge.find(function (x) { return x.id === subScreen }).title || "Bài mới"}</h2>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {aiStatus && <span style={{ fontSize: 11, padding: "6px 12px", borderRadius: 6, background: C.gold + "15", color: C.gold, animation: "pulse 1.5s infinite" }}>{aiStatus}</span>}
                    <button onClick={function () { setSubScreen(null); setFormData(Object.assign({}, formData, { _impLesson: null })) }} style={btnO}>{"← Danh sách"}</button>
                  </div>
                </div>
                {(function () {
                  var k = knowledge.find(function (x) { return x.id === subScreen }); if (!k) return null;
                  var hasL = !!k.interactive;
                  var sl = hasL && k.interactive.slides ? k.interactive.slides.length : 0;
                  var fc = hasL && k.interactive.flashcards ? k.interactive.flashcards.length : 0;
                  var upd = function (obj) { updKnowledge(knowledge.map(function (x) { return x.id === k.id ? Object.assign({}, x, obj) : x })) };
                  return (
                    <div>

                      {/* ① NỘI DUNG */}
                      <div style={{ ...card, padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: C.gold, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>{"① NỘI DUNG KIẾN THỨC"}</div>
                        <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>{"Tên bài"}</div><input value={k.title || ""} onChange={function (e) { upd({ title: e.target.value }) }} style={{ ...inp, fontSize: 13, fontWeight: 700 }} /></div>
                        <div style={{ marginBottom: 6 }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>{"Phòng ban"}</div><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{["Tất cả", "Sales", "Marketing", "Kế toán", "Kho", "HR", "Kỹ thuật"].map(function (d) { var sel = (k.depts || []).includes(d); return <button key={d} onClick={function () { upd({ depts: sel ? (k.depts || []).filter(function (dd) { return dd !== d }) : [].concat(k.depts || [], [d]) }) }} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 10, background: sel ? C.teal + "18" : "transparent", color: sel ? C.teal : "rgba(255,255,255,0.3)", border: "1px solid " + (sel ? C.teal + "33" : "rgba(255,255,255,0.08)") }}>{d}</button> })}</div></div>
                        <div>
                          <button onClick={function () { setFormData(Object.assign({}, formData, { _editContent: k.id })) }} style={{ width: "100%", padding: "12px 16px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid " + C.border, textAlign: "left", cursor: "pointer" }}>
                            <div style={{ fontSize: 10, color: C.goldL, fontWeight: 700, marginBottom: 4 }}>{"📝 Nội dung (" + (k.content || "").length + " ký tự)"}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4, maxHeight: 40, overflow: "hidden" }}>{(k.content || "").slice(0, 120) || "Bấm để thêm nội dung..."}</div>
                          </button>
                        </div>
                      </div>

                      {/* ② TÀI NGUYÊN */}
                      <div style={{ ...card, padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: C.blue, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>{"② TÀI NGUYÊN"}</div>
                        {formData._upSt && <div onClick={function () { setFormData(Object.assign({}, formData, { _upSt: null })) }} style={{ padding: "6px 10px", borderRadius: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, textAlign: "center", cursor: "pointer", background: formData._upSt.indexOf("✅") >= 0 ? C.green + "12" : formData._upSt.indexOf("❌") >= 0 ? C.red + "12" : C.gold + "12", color: formData._upSt.indexOf("✅") >= 0 ? C.green : formData._upSt.indexOf("❌") >= 0 ? C.red : C.gold }}>{formData._upSt}</div>}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{"🔗 Tài liệu gốc"}</div><input value={k.docUrl || ""} onChange={function (e) { upd({ docUrl: e.target.value }) }} placeholder="docs.google.com/..." style={{ ...inp, fontSize: 10 }} /></div>
                          <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{"🎬 Video (YouTube/hosting)"}</div><input value={k.videoUrl || ""} onChange={function (e) { upd({ videoUrl: e.target.value }) }} placeholder="youtube.com/... hoặc /media/video.mp4" style={{ ...inp, fontSize: 10 }} />{k.videoUrl && <div style={{ fontSize: 10, color: C.green, marginTop: 2 }}>{/youtu/.test(k.videoUrl) ? "✓ YouTube" : /^(http|\/media)/.test(k.videoUrl) ? "✓ Direct URL" : "✓ Link"}</div>}</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{"🎧 Audio (hosting/link)"}</div><input value={k.audioUrl || ""} onChange={function (e) { upd({ audioUrl: e.target.value }) }} placeholder="/media/audio.mp3 hoặc link" style={{ ...inp, fontSize: 10 }} />{k.audioUrl && <div style={{ fontSize: 10, color: C.green, marginTop: 2 }}>{"✓ " + (k.audioUrl.length > 35 ? k.audioUrl.slice(0, 35) + "..." : k.audioUrl)}</div>}</div>
                        </div>

                        {/* ── PDF — full-width row ── */}
                        <div style={{ borderRadius: 10, border: "1px solid " + (k.hasPdf ? C.purple + "44" : "rgba(255,255,255,0.1)"), background: k.hasPdf ? C.purple + "08" : "rgba(255,255,255,0.02)", padding: "12px 14px", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            {/* Left: status + filename */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: k.hasPdf ? C.purple + "25" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{k.hasPdf ? "📄" : "📭"}</div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2, letterSpacing: 1 }}>{"TỆP PDF ĐÍNH KÈM"}</div>
                                {k.hasPdf && k.pdfName
                                  ? <div style={{ fontSize: 13, fontWeight: 700, color: C.purple, wordBreak: "break-all", lineHeight: 1.4 }}>{k.pdfName}</div>
                                  : <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>{"Chưa có PDF — bấm Tải lên để thêm"}</div>
                                }
                              </div>
                            </div>
                            {/* Right: actions */}
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid " + (k.hasPdf ? C.purple + "55" : C.border), background: k.hasPdf ? C.purple + "15" : "rgba(255,255,255,0.04)", cursor: "pointer", fontSize: 11, fontWeight: 700, color: k.hasPdf ? C.purple : "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>
                                {k.hasPdf ? "🔄 Thay thế" : "📎 Tải lên PDF"}
                                <input type="file" accept=".pdf" style={{ display: "none" }} onChange={async function (e) { if (!e.target.files[0]) return; var file = e.target.files[0]; setFormData(Object.assign({}, formData, { _upSt: "⏳ Đang tải lên..." })); var path = 'knowledge/' + k.id + '.pdf'; var { error: upErr } = await supabase.storage.from('pdfs').upload(path, file, { upsert: true, contentType: 'application/pdf' }); if (upErr) { setFormData(Object.assign({}, formData, { _upSt: "❌ Lỗi tải PDF: " + upErr.message + " — Vui lòng tạo bucket 'pdfs' trong Supabase Storage." })); return; } var fr = new FileReader(); fr.onload = function (ev) { _pdfCache[k.id] = ev.target.result; }; fr.readAsDataURL(file); upd({ hasPdf: true, pdfName: file.name }); setFormData(Object.assign({}, formData, { _upSt: "✅ PDF đã lưu vào Storage thành công!" })); }} />
                              </label>
                              {k.hasPdf && <button onClick={async function () { delete _pdfCache[k.id]; await supabase.storage.from('pdfs').remove(['knowledge/' + k.id + '.pdf']).catch(function(){}); upd({ hasPdf: false, pdfName: "" }); setFormData(Object.assign({}, formData, { _upSt: "✅ Đã xóa PDF" })); }} style={{ padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, color: C.red, background: C.red + "08", border: "1px solid " + C.red + "22", whiteSpace: "nowrap" }}>{"🗑 Xóa"}</button>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{"🖼️ Ảnh"}</div>
                          <label style={{ padding: "6px 12px", borderRadius: 6, background: C.gold + "10", color: C.gold, fontSize: 10, fontWeight: 700, border: "1px solid " + C.gold + "22", cursor: "pointer" }}>{"📎 Tải ảnh"}<input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={function (e) {
                            var files = e.target.files; if (!files || !files.length) return;
                            var newImgs = [].concat(k.images || []); var loaded = 0;
                            for (var fi = 0; fi < files.length; fi++) { (function (file) { var reader = new FileReader(); reader.onload = function (ev) { newImgs.push(ev.target.result); loaded++; if (loaded === files.length) { upd({ images: newImgs }) } }; reader.readAsDataURL(file) })(files[fi]) }
                          }} /></label>
                          {k.images && k.images.length > 0 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{k.images.length + " ảnh"}</span>}
                        </div>
                        {k.images && k.images.length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(60px,1fr))", gap: 4, marginTop: 6 }}>
                            {k.images.map(function (imgData, imgIdx) {
                              return <div key={imgIdx} style={{ position: "relative", borderRadius: 4, overflow: "hidden", border: "1px solid " + C.border }}>
                                <img src={imgData} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
                                <button onClick={function () { upd({ images: (k.images || []).filter(function (_, i) { return i !== imgIdx }) }) }} style={{ position: "absolute", top: 1, right: 1, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.7)", color: C.red, fontSize: 10, border: "none", cursor: "pointer" }}>{"✕"}</button>
                              </div>
                            })}
                          </div>
                        )}
                      </div>

                      {/* ③ BÀI HỌC TƯƠNG TÁC */}
                      <div style={{ ...card, padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: C.teal, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>{"③ BÀI HỌC TƯƠNG TÁC" + (hasL ? " ✅ " + sl + "S " + fc + "F" : " ⏳")}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                          <button onClick={function () { setAiLoading(true); setAiStatus("🤖 Đang tạo..."); var prompt = buildPrompt({ type: "lesson_interactive_json", knowledgeItem: k }); callAIWithRetry(prompt, 1, 6000).then(function (txt) { try { var raw = String(txt || "").replace(/```json/g, "").replace(/```/g, "").trim(); var j1 = raw.indexOf("{"); if (j1 >= 0) raw = raw.slice(j1); var j2 = raw.lastIndexOf("}"); if (j2 >= 0) raw = raw.slice(0, j2 + 1); raw = raw.replace(/[\x00-\x1F]/g, " ").replace(/,\s*([}\]])/g, "$1"); var obj = JSON.parse(raw); upd({ interactive: { slides: obj.slides || [], flashcards: obj.flashcards || [], cheatsheet: obj.cheatsheet || { title: "", rows: [] }, miniQuiz: obj.miniQuiz || [] } }); setAiStatus("✅ Tạo xong!"); setAiLoading(false) } catch (e5) { setAiStatus("❌ " + String(e5.message).slice(0, 200)); setAiLoading(false) } }).catch(function (e6) { setAiStatus("❌ " + String(e6.message || "").slice(0, 200)); setAiLoading(false) }) }} disabled={aiLoading} style={{ padding: "8px 16px", borderRadius: 8, background: C.purple + "15", color: C.purple, fontSize: 12, fontWeight: 700, border: "1px solid " + C.purple + "33" }}>{"🤖 AI Tạo"}</button>
                          <button onClick={function () { setPromptPanel({ text: buildPrompt({ type: "lesson_interactive_json", knowledgeItem: k }), title: k.title }) }} style={{ padding: "8px 16px", borderRadius: 8, background: C.green + "15", color: C.green, fontSize: 12, fontWeight: 700, border: "1px solid " + C.green + "33" }}>{"🎴 Prompt"}</button>
                          <button onClick={function () { setFormData(Object.assign({}, formData, { _impLesson: formData._impLesson === k.id ? null : k.id })) }} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: formData._impLesson === k.id ? C.teal + "15" : "rgba(255,255,255,0.04)", color: formData._impLesson === k.id ? C.teal : "rgba(255,255,255,0.5)", border: "1px solid " + (formData._impLesson === k.id ? C.teal + "44" : "rgba(255,255,255,0.1)") }}>{formData._impLesson === k.id ? "▼ Đóng" : "📥 Import JSON"}</button>
                        </div>
                        {formData._impLesson === k.id && (<div style={{ padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8, marginBottom: 8 }}><textarea id={"ljson_" + k.id} defaultValue="" placeholder='{"slides":[...],"flashcards":[...],...}' style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid " + C.teal + "33", background: C.teal + "08", color: C.white, fontSize: 11, fontFamily: "monospace", minHeight: 80, resize: "vertical", boxSizing: "border-box" }} /><button onClick={function () { try { var el = document.getElementById("ljson_" + k.id); var raw = (el ? el.value : "").trim(); if (!raw) return; var j1 = raw.indexOf("{"); if (j1 > 0) raw = raw.slice(j1); var j2 = raw.lastIndexOf("}"); if (j2 >= 0) raw = raw.slice(0, j2 + 1); raw = raw.replace(/```[\s\S]*?```/g, "").replace(/[\x00-\x1F]/g, " ").replace(/,\s*([}\]])/g, "$1"); var obj = JSON.parse(raw); upd({ interactive: { slides: obj.slides || [], flashcards: obj.flashcards || [], cheatsheet: obj.cheatsheet || { title: "", rows: [] }, miniQuiz: obj.miniQuiz || [] } }); setFormData(Object.assign({}, formData, { _impLesson: null })); setAiStatus("✅ Import OK") } catch (e2) { setAiStatus("❌ " + e2.message) } }} style={{ marginTop: 6, padding: "8px 20px", borderRadius: 6, background: "linear-gradient(135deg," + C.teal + "," + C.tealD + ")", color: C.white, fontSize: 12, fontWeight: 700, border: "none" }}>{"✅ Import & Lưu"}</button></div>)}
                        {hasL && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button onClick={function () { setFormData(Object.assign({}, formData, { _returnAdmin: subScreen })); setRole("employee"); setScreen("emp_knowledge"); setSubScreen(k.id) }} style={{ padding: "8px 16px", borderRadius: 8, background: C.blue + "15", color: C.blue, fontSize: 12, fontWeight: 700, border: "1px solid " + C.blue + "33" }}>{"👁 Xem bài học"}</button>
                            <button onClick={function () { var it2 = k.interactive; var h = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + k.title + "</title><style>body{font-family:sans-serif;background:#0a1e28;color:#e8e8e8;padding:20px;max-width:700px;margin:0 auto;line-height:1.7}.c{background:#ffffff08;border-radius:8px;padding:12px;margin-bottom:6px;border-left:3px solid #0c7b6f}h3{color:#fff;font-size:13px}li{font-size:11px;color:#ffffffb3;list-style:none}li:before{content:'• ';color:#0c7b6f}</style></head><body><h1 style=text-align:center>" + k.title + "</h1>"; (it2.slides || []).forEach(function (s2) { h += "<div class=c><h3>" + s2.title + "</h3><ul>"; (s2.points || []).forEach(function (p2) { h += "<li>" + p2 + "</li>" }); h += "</ul></div>" }); h += "</body></html>"; var blob = new Blob([h], { type: "text/html" }); var u = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = u; a.download = k.title + ".html"; a.click() }} style={{ padding: "8px 16px", borderRadius: 8, background: C.purple + "15", color: C.purple, fontSize: 12, fontWeight: 700, border: "1px solid " + C.purple + "33" }}>{"📥 Tải HTML"}</button>

                          </div>
                        )}
                      </div>

                      {/* DELETE KNOWLEDGE */}
                      <div style={{ ...card, padding: 14, marginTop: 10, background: C.red + "06", border: "1px solid " + C.red + "22" }}>
                        <div style={{ fontSize: 10, color: C.red, letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>{"⚠️ VÙNG NGUY HIỂM"}</div>
                        {formData._confirmDel === k.id ? (
                          <div>
                            <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{"Xác nhận xóa \"" + k.title + "\"?"}</div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={async function () { await supabase.from("knowledge").delete().eq("id", k.id); updKnowledge(knowledge.filter(function (x) { return x.id !== k.id })); setSubScreen(null); setFormData(Object.assign({}, formData, { _confirmDel: null })) }} style={{ padding: "10px 20px", borderRadius: 8, background: C.red, color: C.white, fontSize: 12, fontWeight: 700, border: "none" }}>{"✅ Xác nhận xóa"}</button>
                              <button onClick={function () { setFormData(Object.assign({}, formData, { _confirmDel: null })) }} style={{ padding: "10px 20px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", fontSize: 12, border: "1px solid rgba(255,255,255,0.1)" }}>{"Hủy"}</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={function () { setFormData(Object.assign({}, formData, { _confirmDel: k.id })) }} style={{ padding: "10px 20px", borderRadius: 8, background: C.red + "15", color: C.red, fontSize: 12, fontWeight: 700, border: "1px solid " + C.red + "33" }}>{"🗑 Xóa kiến thức"}</button>
                            {hasL && <button onClick={function () { upd({ interactive: null }); setAiStatus("✅ Đã xóa bài học") }} style={{ padding: "10px 20px", borderRadius: 8, background: C.orange + "15", color: C.orange, fontSize: 12, fontWeight: 700, border: "1px solid " + C.orange + "33" }}>{"🗑 Xóa bài học"}</button>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ═══ CONTENT EDIT POPUP ═══ */}
        {formData._editContent && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: "rgba(10,30,40,0.98)", display: "flex", flexDirection: "column", animation: "fadeIn .2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid " + C.border, flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{"📝 Nội dung kiến thức"}</div>
              <button onClick={function () { setFormData(Object.assign({}, formData, { _editContent: null })) }} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.1)", color: C.white, fontSize: 18, border: "none" }}>{"✕"}</button>
            </div>
            <div style={{ flex: 1, padding: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <textarea value={(knowledge.find(function (x) { return x.id === formData._editContent }) || {}).content || ""} onChange={function (e) { var kid = formData._editContent; updKnowledge(knowledge.map(function (x) { return x.id === kid ? Object.assign({}, x, { content: e.target.value }) : x })) }} placeholder="Dán nội dung kiến thức vào đây..." style={{ flex: 1, width: "100%", padding: 14, borderRadius: 10, border: "1px solid " + C.teal + "33", background: "rgba(12,123,111,0.06)", color: C.white, fontSize: 13, lineHeight: 1.8, resize: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{((knowledge.find(function (x) { return x.id === formData._editContent }) || {}).content || "").length + " ký tự"}</span>
                <button onClick={function () { setFormData(Object.assign({}, formData, { _editContent: null })) }} style={{ ...btnG, padding: "10px 24px", fontSize: 13 }}>{"✅ Xong"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ADMIN: QUIZZES ═══ */}
        {role === "admin" && screen === "admin_quizzes" && (() => {
          const qFilter = formData.qFilter || "all";
          const qSearch = (formData.qSearch || "").toLowerCase();
          const diffColor = { easy: C.green, medium: C.gold, hard: C.orange, advanced: C.red };
          const diffLabel = { easy: "🟢 Dễ", medium: "🟡 TB", hard: "🟠 Khó", advanced: "🔴 NC" };
          const filteredQ = quizzes.filter(q => {
            if (qFilter === "mc" && q.quizType !== "mc") return false;
            if (qFilter === "mixed" && q.quizType !== "mixed") return false;
            if (qFilter === "ai" && !q.aiGenerated) return false;
            if (qFilter === "import" && q.aiGenerated) return false;
            if (qSearch && !q.title.toLowerCase().includes(qSearch)) return false;
            return true;
          });
          const totalAttempts = (q) => results.filter(r => r.quizId === q.id).length;
          const passRate = (q) => { const rs = results.filter(r => r.quizId === q.id); return rs.length ? Math.round(rs.filter(r => r.passed).length / rs.length * 100) : null; };
          const avgScore = (q) => { const rs = results.filter(r => r.quizId === q.id); return rs.length ? Math.round(rs.reduce((s, r) => s + r.pct, 0) / rs.length) : null; };
          const lastUsed = (q) => { const rs = results.filter(r => r.quizId === q.id); return rs.length ? rs[rs.length - 1].date : null; };
          return (
            <div style={{ animation: "fadeIn .4s" }}>
              {/* ── Header ── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h2 style={hd(22)}>📝 Quản Lý Đề Kiểm Tra</h2>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{quizzes.length} đề · {results.length} lượt làm</div>
                </div>
                <button onClick={() => setScreen("admin_home")} style={btnO}>← Quay lại</button>
              </div>

              {/* ── Overview stats ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8, marginBottom: 14 }}>
                {[
                  { l: "Tổng đề", v: quizzes.length, c: C.teal, i: "📝" },
                  { l: "Lượt thi", v: results.length, c: C.blue, i: "📊" },
                  { l: "Trắc nghiệm", v: quizzes.filter(q => q.quizType !== "mixed").length, c: C.green, i: "✅" },
                  { l: "Kết hợp TL", v: quizzes.filter(q => q.quizType === "mixed").length, c: C.purple, i: "✍️" },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "12px", borderRadius: 12, background: `${s.c}08`, border: `1px solid ${s.c}22`, textAlign: "center" }}>
                    <div style={{ fontSize: 11, marginBottom: 2 }}>{s.i}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.c, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* ── Create panel (collapsible) ── */}
              <div style={{ ...card, background: `${C.gold}04`, border: `1px solid ${C.gold}22`, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setFormData({ ...formData, showCreate: !formData.showCreate })}>
                  <div style={{ fontSize: 13, color: C.goldL, fontWeight: 700 }}>➕ TẠO ĐỀ MỚI</div>
                  <span style={{ color: C.gold, fontSize: 16 }}>{formData.showCreate ? "▲" : "▼"}</span>
                </div>
                {formData.showCreate && (<React.Fragment>
                  <div style={{ height: 1, background: `${C.gold}22`, margin: "10px 0" }} />
                  <div style={{ marginBottom: 10 }}><label style={lbl}>Tên đề kiểm tra *</label><input value={formData.quizTitle || ""} onChange={e => setFormData({ ...formData, quizTitle: e.target.value })} placeholder="VD: Kiểm tra Polyurea nâng cao - Đợt 2" style={inp} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div><label style={lbl}>Bài kiến thức nguồn</label><select value={formData.selK || ""} onChange={e => setFormData({ ...formData, selK: e.target.value })} style={inp}><option value="">— Chọn —</option>{knowledge.map(k => <option key={k.id} value={k.id}>{k.title}</option>)}</select></div>
                    <div><label style={lbl}>Số câu</label><select value={formData.numQ || 10} onChange={e => setFormData({ ...formData, numQ: +e.target.value })} style={inp}>{[5, 10, 15, 20, 30, 40].map(n => <option key={n} value={n}>{n} câu</option>)}</select></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8, marginBottom: 10 }}>
                    <div>
                      <label style={lbl}>🎯 Độ khó</label>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {[{ v: "easy", l: "🟢 Dễ" }, { v: "medium", l: "🟡 TB" }, { v: "hard", l: "🟠 Khó" }, { v: "advanced", l: "🔴 NC" }].map(opt => (
                          <button key={opt.v} onClick={() => setFormData({ ...formData, difficulty: opt.v })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: (formData.difficulty || "medium") === opt.v ? `${C.gold}22` : "rgba(255,255,255,0.03)", border: `1px solid ${(formData.difficulty || "medium") === opt.v ? C.gold + "55" : C.border}`, color: (formData.difficulty || "medium") === opt.v ? C.gold : "rgba(255,255,255,0.4)" }}>{opt.l}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>📋 Loại đề</label>
                      <div style={{ display: "flex", gap: 5 }}>
                        {[{ v: "mc", l: "✅ Trắc nghiệm" }, { v: "mixed", l: "📝 Kết hợp TL" }].map(opt => (
                          <button key={opt.v} onClick={() => setFormData({ ...formData, quizType: opt.v })} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, background: (formData.quizType || "mc") === opt.v ? `${C.purple}22` : "rgba(255,255,255,0.03)", border: `1px solid ${(formData.quizType || "mc") === opt.v ? C.purple + "55" : C.border}`, color: (formData.quizType || "mc") === opt.v ? C.purple : "rgba(255,255,255,0.4)" }}>{opt.l}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => { if (!(formData.quizTitle || "").trim()) { setAiStatus("⚠️ Hãy đặt tên đề!"); return; } const k = knowledge.find(x => x.id === formData.selK); const txt = buildPrompt({ type: k && k.content && k.content.length > 50 ? "quiz_from_knowledge" : "quiz_no_content", knowledgeItem: k || { title: "[Chưa chọn bài]", content: "" }, numQ: formData.numQ || 10, difficulty: formData.difficulty || "medium", quizType: formData.quizType || "mc", quizTitle: formData.quizTitle || "" }); setPromptPanel({ text: txt, title: formData.quizTitle || "prompt" }); setPromptCopied(false); }} style={{ padding: "10px 16px", borderRadius: 8, background: `${C.gold}15`, color: C.gold, fontSize: 12, fontWeight: 700, border: `1px solid ${C.gold}44` }}>📋 Tạo Prompt</button>
                    <button onClick={async () => { const k = knowledge.find(x => x.id === formData.selK); if (k) await aiGenerate(k, "quiz", formData.numQ || 10, formData.quizTitle || "", formData.difficulty || "medium", formData.quizType || "mc"); }} disabled={!formData.selK || aiLoading} style={{ ...btnG, padding: "10px 16px", fontSize: 12, opacity: (!formData.selK || aiLoading) ? 0.4 : 1 }}>{aiLoading ? "⏳ Đang tạo..." : "🤖 Tạo bằng AI"}</button>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "10px 16px", borderRadius: 8, background: `${C.teal}22`, color: C.teal, fontSize: 12, fontWeight: 700, border: `1px solid ${C.teal}44`, cursor: "pointer" }}>📥 Import file<input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) importQuizFile(e.target.files[0]); e.target.value = ""; }} />
                    </label>
                  </div>
                  {aiStatus && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: aiStatus.startsWith("❌") ? `${C.red}11` : aiStatus.startsWith("✅") ? `${C.green}11` : `${C.gold}08`, color: aiStatus.startsWith("❌") ? "#e74c3c" : aiStatus.startsWith("✅") ? C.green : C.goldL, fontSize: 12, animation: aiStatus.startsWith("❌") || aiStatus.startsWith("✅") ? "none" : "pulse 1.5s infinite", border: `1px solid ${aiStatus.startsWith("❌") ? C.red : aiStatus.startsWith("✅") ? C.green : C.gold}22` }}>{aiStatus}</div>}
                </React.Fragment>)}
              </div>

              {/* ── Search + Filter bar ── */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input value={formData.qSearch || ""} onChange={e => setFormData({ ...formData, qSearch: e.target.value })} placeholder="🔍 Tìm đề theo tên..." style={{ ...inp, width: "auto", flex: 1, minWidth: 160, padding: "8px 12px", fontSize: 12 }} />
                <div style={{ display: "flex", gap: 4 }}>
                  {[{ v: "all", l: "Tất cả" }, { v: "mc", l: "TN" }, { v: "mixed", l: "Kết hợp" }, { v: "ai", l: "🤖 AI" }, { v: "import", l: "📥 Import" }].map(f => (
                    <button key={f.v} onClick={() => setFormData({ ...formData, qFilter: f.v })} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: qFilter === f.v ? 700 : 500, background: qFilter === f.v ? `${C.teal}22` : "rgba(255,255,255,0.04)", color: qFilter === f.v ? C.teal : "rgba(255,255,255,0.4)", border: `1px solid ${qFilter === f.v ? C.teal + "44" : C.border}` }}>{f.l}</button>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{filteredQ.length}/{quizzes.length} đề</span>
              </div>

              {/* ── Quiz list ── */}
              {filteredQ.length === 0 && <Empty msg="Không tìm thấy đề nào." />}
              {filteredQ.map(q => {
                const att = totalAttempts(q), pr = passRate(q), avg = avgScore(q), last = lastUsed(q);
                const isExpanded = formData.expandQ === q.id;
                const dc = diffColor[q.difficulty || "medium"] || C.gold;
                return (
                  <div key={q.id} style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 10 }}>
                    {/* Main row */}
                    <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                      {/* Left: diff color bar */}
                      <div style={{ width: 4, borderRadius: 2, background: dc, alignSelf: "stretch", flexShrink: 0 }} />
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Title row */}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                          {formData.editQId === q.id ? (
                            <input value={formData.editQTitle || q.title} onChange={e => setFormData({ ...formData, editQTitle: e.target.value })}
                              onBlur={() => { if ((formData.editQTitle || "").trim() && formData.editQTitle !== q.title) { updQuizzes(quizzes.map(x => x.id === q.id ? { ...x, title: formData.editQTitle.trim() } : x)); } setFormData({ ...formData, editQId: null, editQTitle: "" }); }}
                              onKeyDown={e => { if (e.key === "Enter" && (formData.editQTitle || "").trim()) { updQuizzes(quizzes.map(x => x.id === q.id ? { ...x, title: formData.editQTitle.trim() } : x)); setFormData({ ...formData, editQId: null, editQTitle: "" }); } if (e.key === "Escape") setFormData({ ...formData, editQId: null, editQTitle: "" }); }}
                              style={{ ...inp, flex: 1, padding: "5px 10px", fontSize: 14, fontWeight: 700 }} autoFocus />
                          ) : (
                            <span style={{ color: C.white, fontWeight: 700, fontSize: 14, cursor: "pointer" }} onClick={() => setFormData({ ...formData, editQId: q.id, editQTitle: q.title })} title="Bấm để sửa tên">{q.title} ✏️</span>
                          )}
                        </div>
                        {/* Tags row */}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                          {(q.depts || ["Tất cả"]).map(d => <span key={d}>{tag(d, d === "Tất cả" ? C.green : C.blue)}</span>)}
                          <span style={{ fontSize: 10, padding: "5px 10px", borderRadius: 4, background: `${dc}22`, color: dc, fontWeight: 700 }}>{diffLabel[q.difficulty || "medium"]}</span>
                          {q.quizType === "mixed" && <span style={{ fontSize: 10, padding: "5px 10px", borderRadius: 4, background: `${C.purple}22`, color: C.purple, fontWeight: 700 }}>📝 Kết hợp</span>}
                          {q.aiGenerated ? <span style={{ fontSize: 10, padding: "5px 10px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}>🤖 AI</span> : <span style={{ fontSize: 10, padding: "5px 10px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}>📥 Import</span>}
                        </div>
                        {/* Stats row */}
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>📝 {q.questions.length} câu ({q.questions.filter(x => x.type === "single").length} TN · {q.questions.filter(x => x.type === "truefalse").length} Đ/S · {q.questions.filter(x => x.type === "essay").length} TL)</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>📅 {fmtDate(q.createdAt)}</span>
                          {att > 0 && <span style={{ fontSize: 11, color: C.blue }}>👥 {att} lượt thi</span>}
                          {pr !== null && <span style={{ fontSize: 11, color: pr >= 70 ? C.green : C.orange }}>✓ Đạt {pr}%</span>}
                          {avg !== null && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Avg {avg}%</span>}
                          {last && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Thi gần nhất: {fmtDate(last)}</span>}
                        </div>
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", gap: 5, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => setFormData({ ...formData, expandQ: isExpanded ? null : q.id })} style={{ padding: "5px 8px", borderRadius: 6, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", fontSize: 11, border: `1px solid ${C.border}` }} title="Xem câu hỏi">{isExpanded ? "▲ Ẩn" : "▼ Xem"}</button>
                          <button onClick={() => exportQuizCSV(q)} style={{ padding: "5px 8px", borderRadius: 6, background: `${C.blue}22`, color: C.blue, fontSize: 11, fontWeight: 600, border: "none" }} title="Xuất CSV">📥</button>
                          <button onClick={() => { const txt = buildPrompt({ type: "quiz_from_knowledge", knowledgeItem: knowledge.find(x => x.id === q.knowledgeId) || { title: q.title, content: "" }, numQ: q.questions.length, difficulty: q.difficulty || "medium", quizType: q.quizType || "mc", quizTitle: q.title }); setPromptPanel({ text: txt, title: q.title }); setPromptCopied(false); }} style={{ padding: "5px 8px", borderRadius: 6, background: `${C.gold}15`, color: C.gold, fontSize: 11, fontWeight: 600, border: "none" }} title="Tạo lại với Claude">📋</button>
                          <button onClick={async () => { if (window.confirm("Xóa đề \"" + q.title + "\"?\nThao tác này không thể hoàn tác.")) { await supabase.from("quizzes").delete().eq("id", q.id); updQuizzes(quizzes.filter(x => x.id !== q.id)); } }} style={{ padding: "5px 8px", borderRadius: 6, background: `${C.red}22`, color: C.red, fontSize: 11, fontWeight: 600, border: "none" }} title="Xóa">🗑️</button>
                        </div>
                        {att > 0 && pr !== null && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                            <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pr}%`, background: pr >= 70 ? C.green : C.orange, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{pr}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Expanded: question list */}
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", background: "rgba(0,0,0,0.15)" }}>
                        <div style={{ fontSize: 11, color: C.goldL, fontWeight: 700, marginBottom: 8 }}>📋 DANH SÁCH CÂU HỎI ({q.questions.length})</div>
                        <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                          {q.questions.map((qs, qi) => (
                            <div key={qi} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
                              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: qs.type === "essay" ? `${C.purple}22` : qs.type === "truefalse" ? `${C.gold}22` : `${C.teal}22`, color: qs.type === "essay" ? C.purple : qs.type === "truefalse" ? C.gold : C.teal, fontWeight: 700, flexShrink: 0 }}>{qi + 1}</span>
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.4 }}>{qs.q}</span>
                              {qs.type !== "essay" && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", flexShrink: 0, marginLeft: "auto" }}>{qs.type === "truefalse" ? (qs.ans === 0 ? "✓ Đúng" : "✓ Sai") : String.fromCharCode(65 + Number(qs.ans))}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ═══ ADMIN: ACCOUNTS ═══ */}
        {role === "admin" && screen === "admin_accounts" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>👥 Tài Khoản</h2>
              <div style={{ display: "flex", gap: 8 }}><button onClick={() => setSubScreen(subScreen === "add" ? "" : "add")} style={btnG}>{subScreen === "add" ? "Đóng" : "+ Thêm NV"}</button><button onClick={() => setSubScreen(subScreen === "deptMgr" ? "" : "deptMgr")} style={btnO}>{subScreen === "deptMgr" ? "Đóng" : "🏢 Phòng ban"}</button><button onClick={() => { setScreen("admin_home"); setSubScreen(null); }} style={btnO}>← Quay lại</button></div>
            </div>
            {subScreen === "add" && (
              <div style={{ ...card, background: "rgba(197,153,62,0.04)", border: "1px solid rgba(197,153,62,0.15)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8, marginBottom: 10 }}>
                  <div><label style={lbl}>Họ tên *</label><input value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} style={inp} /></div>
                  <div><label style={lbl}>Mã NV *</label><input value={formData.empId || ""} onChange={e => setFormData({ ...formData, empId: e.target.value })} style={inp} /></div>
                  <div><label style={lbl}>Phòng ban</label><select value={formData.dept || DEPTS[0]} onChange={e => setFormData({ ...formData, dept: e.target.value })} style={inp}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></div>
                  <div><label style={lbl}>Team / Nhóm</label><input value={formData.team || ""} onChange={e => setFormData({ ...formData, team: e.target.value })} placeholder="VD: Team A" style={inp} /></div>
                  <div><label style={lbl}>Cấp bậc</label><select value={formData.accRole || "employee"} onChange={e => setFormData({ ...formData, accRole: e.target.value })} style={inp}>{ROLES.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}</select></div>
                  <div><label style={lbl}>Mật khẩu</label><input value={formData.pw || "Kingsmen@2026"} onChange={e => setFormData({ ...formData, pw: e.target.value })} style={inp} /></div>
                  <div><label style={lbl}>Xác nhận MK</label><input value={formData.confirmPw || ""} onChange={e => setFormData({ ...formData, confirmPw: e.target.value })} placeholder="Nhập lại mật khẩu" style={{ ...inp, borderColor: formData.confirmPw && formData.confirmPw !== (formData.pw || "Kingsmen@2026") ? C.red : undefined }} /></div>
                </div>
                {formData.confirmPw && formData.confirmPw !== (formData.pw || "Kingsmen@2026") && <div style={{ color: C.red, fontSize: 11, marginBottom: 8 }}>⚠ Mật khẩu xác nhận không khớp</div>}
                <button onClick={async () => {
                  const name = (formData.name || "").trim(); const empId = (formData.empId || "").trim();
                  if (!name || !empId) { alert("Vui lòng nhập Họ tên và Mã NV"); return; }
                  if (accounts.some(a => a.empId === empId)) { alert("Mã NV \"" + empId + "\" đã tồn tại!"); return; }
                  const password = (formData.pw || "Kingsmen@2026");
                  if (formData.confirmPw && formData.confirmPw !== password) { alert("Mật khẩu xác nhận không khớp!"); return; }
                  setFormData({ ...formData, _creating: true });
                  try {
                    await supabase.auth.getSession();
                    const { data: rawRes, error: fnErr } = await supabase.functions.invoke("create-user", {
                      body: { name, empId, dept: formData.dept || DEPTS[0], team: formData.team || "", accRole: formData.accRole || "employee", password },
                      responseType: "text"
                    });
                    if (fnErr) throw new Error(fnErr.message || "Edge function error");
                    var resData; try { resData = typeof rawRes === "string" ? JSON.parse(rawRes) : rawRes; } catch (e) { throw new Error("Response parse error"); }
                    if (resData.error) throw new Error(resData.error);
                    const newAccounts = await DB.get("km-accounts", []);
                    setAccounts(newAccounts); accountsRef.current = newAccounts;
                    setFormData({}); setSubScreen(null);
                    alert("✅ Tài khoản \"" + name + "\" đã tạo thành công!");
                  } catch (err) {
                    setFormData({ ...formData, _creating: false });
                    alert("Lỗi tạo tài khoản: " + (err.message || "Không xác định"));
                  }
                }} disabled={!!formData._creating} style={{ ...btnG, opacity: formData._creating ? 0.6 : 1 }}>{formData._creating ? "⏳ Đang tạo..." : "Tạo tài khoản"}</button>
              </div>
            )}
            {/* Department Management */}
            {subScreen === "deptMgr" && (
              <div style={{ ...card, background: "rgba(197,153,62,0.04)", border: "1px solid rgba(197,153,62,0.15)" }}>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>🏢 QUẢN LÝ PHÒNG BAN</div>
                {DEPTS.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 14 }}>🏢</span>
                    <input value={d} onChange={e => { const nd = [...DEPTS]; nd[i] = e.target.value; setSettings({ ...settings, depts: nd }); }} style={{ ...inp, flex: 1, padding: "5px 10px", fontSize: 13 }} />
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{accounts.filter(a => a.dept === d).length} NV</span>
                    <button onClick={() => { if (accounts.some(a => a.dept === d)) return; const nd = DEPTS.filter((_, j) => j !== i); setSettings({ ...settings, depts: nd }); }} disabled={accounts.some(a => a.dept === d)} style={{ padding: "5px 10px", borderRadius: 4, background: `${C.red}22`, color: accounts.some(a => a.dept === d) ? "rgba(255,255,255,0.15)" : C.red, fontSize: 11, border: "none" }}>✕</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input value={formData.newDept || ""} onChange={e => setFormData({ ...formData, newDept: e.target.value })} placeholder="Tên phòng ban mới..." style={{ ...inp, flex: 1, padding: "6px 10px", fontSize: 12 }} />
                  <button onClick={() => { if (!(formData.newDept || "").trim() || DEPTS.includes(formData.newDept.trim())) return; const nd = [...DEPTS, formData.newDept.trim()]; setSettings({ ...settings, depts: nd }); setFormData({ ...formData, newDept: "" }); }} style={{ ...btnG, fontSize: 11, padding: "6px 14px" }}>+ Thêm</button>
                </div>
                <button onClick={async () => { await DB.set("km-settings", settings); setSaveStatus("saved"); }} style={{ ...btnG, width: "100%", marginTop: 10, fontSize: 12 }}>💾 Lưu phòng ban</button>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Không xóa được phòng ban đang có nhân viên. Đổi tên sẽ không tự cập nhật NV cũ.</div>
              </div>
            )}
            {/* Filter bar */}
            {!subScreen && <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <button onClick={() => setFormData({ ...formData, accFilter: "active" })} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 10, fontWeight: (formData.accFilter || "active") === "active" ? 700 : 500, background: (formData.accFilter || "active") === "active" ? C.green + "22" : "rgba(255,255,255,0.04)", color: (formData.accFilter || "active") === "active" ? C.green : "rgba(255,255,255,0.4)", border: `1px solid ${(formData.accFilter || "active") === "active" ? C.green + "44" : C.border}` }}>Đang làm ({accounts.filter(a => a.status !== "inactive").length})</button>
              <button onClick={() => setFormData({ ...formData, accFilter: "inactive" })} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 10, fontWeight: formData.accFilter === "inactive" ? 700 : 500, background: formData.accFilter === "inactive" ? C.red + "22" : "rgba(255,255,255,0.04)", color: formData.accFilter === "inactive" ? C.red : "rgba(255,255,255,0.4)", border: `1px solid ${formData.accFilter === "inactive" ? C.red + "44" : C.border}` }}>Nghỉ việc ({accounts.filter(a => a.status === "inactive").length})</button>
            </div>}
            {!subScreen && accounts.filter(a => (formData.accFilter || "active") === "active" ? a.status !== "inactive" : a.status === "inactive").map(a => {
              const lv = gL(a.xp || 0); const isInactive = a.status === "inactive"; return (
                <div key={a.id} style={{ ...card, display: "flex", alignItems: "center", gap: 12, opacity: isInactive ? 0.5 : 1 }}>
                  <span style={{ fontSize: 20 }}>{isInactive ? "🚫" : lv.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: isInactive ? "rgba(255,255,255,0.4)" : C.white, fontWeight: 700, fontSize: 14 }}>{a.name} <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>({a.empId})</span> {a.accRole === "director" && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${C.purple}22`, color: C.purple, fontWeight: 600 }}>🎩 QL Cao</span>}{a.accRole === "manager" && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${C.gold}22`, color: C.gold, fontWeight: 600 }}>👔 QL</span>}{isInactive && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${C.red}22`, color: C.red, fontWeight: 600 }}>Nghỉ việc</span>}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{a.dept}{a.team ? " · " + a.team : ""} · {lv.name} · {a.xp || 0} XP</div>
                    {/* Edit form */}
                    {formData.editAccId === a.id && (
                      <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                          <div><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Họ tên</label><input value={formData.editName || a.name} onChange={e => setFormData({ ...formData, editName: e.target.value })} style={{ ...inp, padding: "5px 8px", fontSize: 12 }} /></div>
                          <div><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Mã NV</label><input value={formData.editEmpId || a.empId} onChange={e => setFormData({ ...formData, editEmpId: e.target.value })} style={{ ...inp, padding: "5px 8px", fontSize: 12 }} /></div>
                          <div><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Phòng ban</label><select value={formData.editDept || a.dept} onChange={e => setFormData({ ...formData, editDept: e.target.value })} style={{ ...inp, padding: "5px 8px", fontSize: 12 }}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></div>
                          <div><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Team</label><input value={(formData.editTeam || a.team) || ""} onChange={e => setFormData({ ...formData, editTeam: e.target.value })} style={{ ...inp, padding: "5px 8px", fontSize: 12 }} /></div>
                          <div><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Cấp bậc</label><select value={formData.editRole || a.accRole} onChange={e => setFormData({ ...formData, editRole: e.target.value })} style={{ ...inp, padding: "5px 8px", fontSize: 12 }}>{ROLES.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}</select></div>
                          <div><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Mật khẩu mới</label><input type="password" value={formData.editNewPw || ""} onChange={e => setFormData({ ...formData, editNewPw: e.target.value, editPwMsg: "" })} placeholder="Nhập mật khẩu mới (≥6 ký tự)" style={{ ...inp, padding: "5px 8px", fontSize: 12 }} /></div>
                          <div><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Xác nhận MK mới</label><input type="password" value={formData.editConfirmPw || ""} onChange={e => setFormData({ ...formData, editConfirmPw: e.target.value, editPwMsg: "" })} placeholder="Nhập lại mật khẩu mới" style={{ ...inp, padding: "5px 8px", fontSize: 12, borderColor: formData.editConfirmPw && formData.editConfirmPw !== formData.editNewPw ? C.red : undefined }} /></div>
                        </div>
                        {formData.editPwMsg && <div style={{ fontSize: 11, marginBottom: 6, color: formData.editPwMsg.startsWith("✓") ? C.green : C.red }}>{formData.editPwMsg}</div>}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={async () => {
                            if (!window.confirm("Lưu thay đổi thông tin tài khoản của " + a.name + "?")) return;
                            const newEmpId = (formData.editEmpId || a.empId).trim();
                            const empIdChanged = newEmpId !== a.empId;
                            // If empId changed, update Auth email via edge function first
                            if (empIdChanged) {
                              if (accounts.some(x => x.id !== a.id && x.empId === newEmpId)) { alert("Mã NV \"" + newEmpId + "\" đã tồn tại!"); return; }
                              try {
                                await supabase.auth.getSession();
                                const { data: rawRes, error: fnErr } = await supabase.functions.invoke("update-user", { body: { targetUserId: a.id, newEmpId }, responseType: "text" });
                                if (fnErr) throw new Error(fnErr.message);
                                var resData; try { resData = typeof rawRes === "string" ? JSON.parse(rawRes) : rawRes; } catch (e) { throw new Error("Response parse error"); }
                                if (resData.error) throw new Error(resData.error);
                              } catch (err) { alert("Lỗi cập nhật mã NV: " + err.message); return; }
                            }
                            const updated = accounts.map(x => x.id === a.id ? { ...x, name: formData.editName || a.name, empId: newEmpId, dept: formData.editDept || a.dept, team: (formData.editTeam || a.team) || "", accRole: formData.editRole || a.accRole } : x);
                            setAccounts(updated); accountsRef.current = updated; await DB.set("km-accounts", updated);
                            setSaveStatus("saved"); setFormData({});
                          }} style={{ ...btnG, fontSize: 11, padding: "6px 14px" }}>💾 Lưu thông tin</button>
                          <button onClick={async () => {
                            if (!formData.editNewPw || formData.editNewPw.length < 6) { setFormData({ ...formData, editPwMsg: "✗ Mật khẩu mới tối thiểu 6 ký tự" }); return; }
                            if (formData.editNewPw !== formData.editConfirmPw) { setFormData({ ...formData, editPwMsg: "✗ Xác nhận mật khẩu không khớp" }); return; }
                            if (!window.confirm("Đổi mật khẩu của " + a.name + " (" + a.empId + ")?")) return;
                            setFormData({ ...formData, editPwMsg: "⏳ Đang cập nhật..." });
                            try {
                              await supabase.auth.getSession();
                              const { data: rawRes, error: fnErr } = await supabase.functions.invoke("reset-password", { body: { targetUserId: a.id, newPassword: formData.editNewPw }, responseType: "text" });
                              if (fnErr) throw new Error(fnErr.message || "Edge function error");
                              var resData; try { resData = typeof rawRes === "string" ? JSON.parse(rawRes) : rawRes; } catch (pe) { throw new Error("Response parse error"); }
                              if (resData.error) throw new Error(resData.error);
                              setFormData({ ...formData, editNewPw: "", editConfirmPw: "", editPwMsg: "✓ Đổi mật khẩu thành công!" });
                            } catch (err) {
                              setFormData({ ...formData, editPwMsg: "✗ " + (err.message || "Lỗi không xác định").slice(0, 100) });
                            }
                          }} disabled={!formData.editNewPw} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: formData.editNewPw ? C.orange + "22" : "rgba(255,255,255,0.03)", color: formData.editNewPw ? C.orange : "rgba(255,255,255,0.2)", border: "1px solid " + (formData.editNewPw ? C.orange + "44" : C.border) }}>🔐 Reset MK</button>
                          <button onClick={() => setFormData({})} style={{ ...btnO, fontSize: 11, padding: "6px 14px" }}>Hủy</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => setFormData({ editAccId: formData.editAccId === a.id ? null : a.id })} style={{ padding: "6px 8px", borderRadius: 6, background: `${C.blue}22`, color: C.blue, fontSize: 11, fontWeight: 600, border: "none" }}>✏️</button>
                    {!isInactive ? <button onClick={async () => {
                      if (!window.confirm("Vô hiệu hóa tài khoản của " + a.name + "?\nNhân viên này sẽ không đăng nhập được nữa.")) return;
                      const updated = accounts.map(x => x.id === a.id ? { ...x, status: "inactive", deactivatedAt: new Date().toISOString() } : x);
                      setAccounts(updated); accountsRef.current = updated; await DB.set("km-accounts", updated); setSaveStatus("saved");
                    }} style={{ padding: "6px 8px", borderRadius: 6, background: `${C.red}22`, color: C.red, fontSize: 11, fontWeight: 600, border: "none" }}>🚫</button>
                      : <button onClick={async () => {
                        if (!window.confirm("Kích hoạt lại tài khoản của " + a.name + "?")) return;
                        const updated = accounts.map(x => x.id === a.id ? { ...x, status: "active", deactivatedAt: null } : x);
                        setAccounts(updated); accountsRef.current = updated; await DB.set("km-accounts", updated); setSaveStatus("saved");
                      }} style={{ padding: "6px 8px", borderRadius: 6, background: `${C.green}22`, color: C.green, fontSize: 11, fontWeight: 600, border: "none" }}>✅</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ ADMIN: ANALYTICS ═══ */}
        {role === "admin" && screen === "admin_analytics" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>📊 Phân Tích Năng Lực</h2><button onClick={() => setScreen("admin_home")} style={btnO}>← Quay lại</button>
            </div>

            {/* Filters: Dept + Team + Employee */}
            <div style={{ ...card, padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                <div><label style={lbl}>Phòng ban</label>
                  <select value={formData.anaDept || ""} onChange={e => setFormData({ ...formData, anaDept: e.target.value, anaTeam: "", anaEmp: "" })} style={inp}>
                    <option value="">Tất cả phòng ban</option>{DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Team</label>
                  <select value={formData.anaTeam || ""} onChange={e => setFormData({ ...formData, anaTeam: e.target.value, anaEmp: "" })} style={inp}>
                    <option value="">Tất cả team</option>
                    {[...new Set(accounts.filter(a => !formData.anaDept || a.dept === formData.anaDept).map(a => a.team).filter(Boolean))].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Nhân viên</label>
                  <select value={formData.anaEmp || ""} onChange={e => setFormData({ ...formData, anaEmp: e.target.value })} style={inp}>
                    <option value="">Tất cả NV</option>
                    {accounts.filter(a => (!formData.anaDept || a.dept === formData.anaDept) && (!formData.anaTeam || a.team === formData.anaTeam)).map(a => <option key={a.id} value={a.id}>{a.name} ({a.empId})</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Individual employee detail */}
            {formData.anaEmp ? (() => {
              const emp = accounts.find(a => a.id === formData.anaEmp); if (!emp) return null;
              const myR = results.filter(r => r.empId === emp.id);
              const lv = gL(emp.xp || 0);
              const byQuiz = {}; myR.forEach(r => { if (!byQuiz[r.quizTitle]) byQuiz[r.quizTitle] = []; byQuiz[r.quizTitle].push(r); });
              const radarData = Object.entries(byQuiz).map(([title, rs]) => ({ name: title.slice(0, 12), score: Math.round(rs.reduce((s, r) => s + r.pct, 0) / rs.length) }));
              return (
                <div>
                  <div style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 12, background: `${lv.color || C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{lv.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.white, fontWeight: 700, fontSize: 16 }}>{emp.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{emp.dept}{emp.team ? " · " + emp.team : ""} · {emp.empId} · {lv.name} · {emp.xp || 0} XP · 🔥{emp.streak || 0} · 📅{(emp.checkIns || []).length} lần ĐN</div>
                    </div>
                    <div style={{ textAlign: "right" }}><div style={{ fontSize: 22, fontWeight: 800, color: lv.color || C.gold, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{myR.length > 0 ? Math.round(myR.reduce((s, r) => s + r.pct, 0) / myR.length) : 0}%</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Điểm TB</div></div>
                  </div>
                  {radarData.length > 0 && <div style={card}>
                    <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>NĂNG LỰC THEO ĐỀ THI</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={radarData}><PolarGrid stroke="rgba(255,255,255,0.1)" /><PolarAngleAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} /><PolarRadiusAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} /><Radar dataKey="score" stroke={C.gold} fill={C.gold} fillOpacity={0.3} /><Tooltip contentStyle={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} /></RadarChart>
                    </ResponsiveContainer>
                  </div>}
                  {/* Competency assessment */}
                  {(() => {
                    const myK = knowledge.filter(k2 => visibleToDept(k2, emp.dept));
                    const compScores = evalCompetency(myR, emp.streak || 0, (emp.readLessons || []).length, myK.length);
                    const posComps = POS_COMPETENCIES[emp.dept] || [];
                    const improvements = getImprovements(compScores, emp.dept);
                    return (
                      <div style={card}>
                        <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>🧠 ĐÁNH GIÁ NĂNG LỰC</div>
                        {CORE_COMPETENCIES.map(c2 => {
                          const s2 = compScores[c2.id] || 0; const lv2 = getCompetencyLevel(s2); return (
                            <div key={c2.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                              <span style={{ fontSize: 14 }}>{c2.icon}</span>
                              <div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.white, fontSize: 12 }}>{c2.name}</span><span style={{ fontSize: 12, fontWeight: 700, color: lv2.color }}>{s2}%</span></div>
                                <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 2 }}><div style={{ height: "100%", width: `${s2}%`, background: lv2.color, borderRadius: 2 }} /></div>
                              </div>
                            </div>
                          );
                        })}
                        {improvements.length > 0 && <div style={{ marginTop: 10, padding: "10px 12px", background: `${C.orange}08`, borderRadius: 8, border: `1px solid ${C.orange}22` }}>
                          <div style={{ fontSize: 11, color: C.orange, fontWeight: 700, marginBottom: 6 }}>💡 ĐỀ XUẤT CẢI THIỆN</div>
                          {improvements.map((imp, idx) => <div key={idx} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", padding: "2px 0" }}><b style={{ color: C.white }}>{imp.comp}:</b> {imp.action}</div>)}
                        </div>}
                      </div>
                    );
                  })()}
                  <div style={card}>
                    <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>LỊCH SỬ KẾT QUẢ ({myR.length} lượt)</div>
                    {myR.slice(-10).reverse().map(r => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${getRating(r.pct).color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: getRating(r.pct).color }}>{r.pct}%</div>
                        <div style={{ flex: 1 }}><div style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{r.quizTitle}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{r.score}/{r.total} · {fmtDate(r.date)}</div></div>
                        <span style={{ padding: "5px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: r.passed ? `${C.green}18` : `${C.red}18`, color: r.passed ? C.green : C.red }}>{r.passed ? "ĐẠT" : "X"}</span>
                      </div>
                    ))}
                    {myR.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center", padding: 12 }}>Chưa có kết quả</div>}
                  </div>
                </div>
              );
            }) : (
              <div>
                {/* Department radar */}
                <div style={card}>
                  <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>NĂNG LỰC THEO PHÒNG BAN</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <RadarChart data={Object.entries(getDeptAnalytics()).filter(([dept]) => !formData.anaDept || dept === formData.anaDept).map(([dept, d]) => ({ dept: dept.slice(0, 6), avg: d.avg, passRate: d.total > 0 ? Math.round(d.passed / Math.max(d.quizzes, 1) * 100) : 0 }))}>
                      <PolarGrid stroke="rgba(255,255,255,0.1)" /><PolarAngleAxis dataKey="dept" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} /><PolarRadiusAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} domain={[0, 100]} />
                      <Radar name="Điểm TB" dataKey="avg" stroke={C.gold} fill={C.gold} fillOpacity={0.2} />
                      <Radar name="Tỷ lệ đạt" dataKey="passRate" stroke={C.green} fill={C.green} fillOpacity={0.15} />
                      <Tooltip contentStyle={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                {/* Employee list in filtered dept/team */}
                <div style={card}>
                  <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>
                    NHÂN VIÊN {formData.anaDept ? `· ${formData.anaDept}` : ""}{formData.anaTeam ? ` · ${formData.anaTeam}` : ""}
                  </div>
                  {accounts.filter(a => (!formData.anaDept || a.dept === formData.anaDept) && (!formData.anaTeam || a.team === formData.anaTeam)).sort((a, b) => (a.empId || "").localeCompare(b.empId || "", undefined, { numeric: true, sensitivity: "base" })).map(a => {
                    const myR = results.filter(r => r.empId === a.id); const avg = myR.length ? Math.round(myR.reduce((s, r) => s + r.pct, 0) / myR.length) : 0;
                    return (
                      <div key={a.id} onClick={() => setFormData({ ...formData, anaEmp: a.id })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                        <span style={{ fontSize: 16 }}>{gL(a.xp || 0).icon}</span>
                        <div style={{ flex: 1 }}><div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{a.name}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{a.dept}{a.team ? " · " + a.team : ""} · {myR.length} lượt thi · 🔥{a.streak || 0} · 📅{(a.checkIns || []).length} lần đăng nhập</div></div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: avg >= 70 ? C.green : avg > 0 ? C.orange : "rgba(255,255,255,0.15)", fontFamily: "'Be Vietnam Pro',sans-serif" }}>{avg || "—"}%</div>
                          <button onClick={e => { e.stopPropagation(); const txt = buildPrompt({ type: "analyze_results", empId: a.id, empName: a.name, dept: a.dept, resultsData: results }); setPromptPanel({ text: txt }); setPromptCopied(false); }} style={{ padding: "3px 7px", borderRadius: 5, background: `${C.gold}15`, color: C.gold, fontSize: 10, fontWeight: 700, border: `1px solid ${C.gold}33` }} title="Phân tích với Claude">📋</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Gap */}
                <div style={card}>
                  <div style={{ fontSize: 13, color: C.red, fontWeight: 700, marginBottom: 12 }}>{"⚠️ GAP KIẾN THỨC (Tỷ lệ đạt < 70%)"}</div>
                  {getKnowledgeGaps().length === 0 ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: 12 }}>✓ Không có gap nghiêm trọng</div> :
                    getKnowledgeGaps().slice(0, 8).map((g, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${C.red}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: C.red }}>{g.passRate}%</div>
                        <div style={{ flex: 1 }}><div style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{g.quiz}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{g.dept} · {g.count} lượt</div></div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ ADMIN: RANKING & RECOGNITION ═══ */}
        {role === "admin" && screen === "admin_ranking" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>🏆 Xếp Hạng & Tuyên Dương</h2><button onClick={() => setScreen("admin_home")} style={btnO}>← Quay lại</button>
            </div>
            {/* Recognition form */}
            <div style={{ ...card, background: "rgba(197,153,62,0.04)", border: "1px solid rgba(197,153,62,0.15)" }}>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>🎖️ TUYÊN DƯƠNG MỚI</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <select value={formData.recEmp || ""} onChange={e => setFormData({ ...formData, recEmp: e.target.value })} style={inp}><option value="">— Chọn NV —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <select value={formData.recType || "excellent"} onChange={e => setFormData({ ...formData, recType: e.target.value })} style={inp}><option value="excellent">🏆 Xuất sắc</option><option value="improved">📈 Tiến bộ</option><option value="star">⭐ Ngôi sao</option></select>
              </div>
              <input value={formData.recMsg || ""} onChange={e => setFormData({ ...formData, recMsg: e.target.value })} placeholder="Nội dung tuyên dương..." style={{ ...inp, marginBottom: 8 }} />
              <button onClick={() => { if (!formData.recEmp || !(formData.recMsg || "").trim()) return; const emp = accounts.find(a => a.id === formData.recEmp); updRecognitions([...recognitions, { id: uid(), empId: formData.recEmp, empName: (emp && emp.name) || "", type: formData.recType || "excellent", message: formData.recMsg, givenBy: currentUser ? currentUser.name : "Admin", createdAt: new Date().toISOString() }]); addNotif(formData.recEmp, `🎖️ Bạn được tuyên dương: ${formData.recMsg}`, "recognition"); setFormData({}); }} style={btnG}>📢 Xuất bản</button>
            </div>
            {/* Leaderboard */}
            <Leaderboard accounts={accounts} results={results} card={card} currentUserId={currentUser && currentUser.id} depts={DEPTS} levels={LEVELS} />
            {/* Recognitions list */}
            {recognitions.length > 0 && <div style={card}><div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>LỊCH SỬ TUYÊN DƯƠNG</div>
              {[...recognitions].reverse().slice(0, 10).map(r => (
                <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 18 }}>{r.type === "excellent" ? "🏆" : r.type === "improved" ? "📈" : "⭐"}</span>
                  <div style={{ flex: 1 }}><div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{r.empName}</div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{r.message}</div><div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>{fmtDate(r.createdAt)}</div></div>
                </div>
              ))}
            </div>}
          </div>
        )}

        {/* ═══ ADMIN: CHALLENGES & LEARNING PATHS ═══ */}
        {role === "admin" && screen === "admin_challenges" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>🎯 Thử Thách</h2>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={async () => { try { const [ch, r, ac] = await Promise.all([DB.get("km-challenges", []), DB.get("km-results", []), DB.get("km-accounts", [])]); if (Array.isArray(ch)) setChallenges(ch); if (Array.isArray(r)) setResults(r); if (Array.isArray(ac)) { setAccounts(ac); accountsRef.current = ac; } setSaveStatus("saved"); } catch (e) { } }} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontSize: 11, border: `1px solid ${C.border}` }}>🔄 Cập nhật</button>
                <button onClick={() => { setScreen("admin_home"); setSubScreen(null); }} style={btnO}>← Quay lại</button>
              </div>
            </div>

            {!subScreen && <React.Fragment>
              {/* Create challenge */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <button onClick={() => setSubScreen("newCh")} style={btnG}>+ Tạo thử thách mới</button>
                <button onClick={() => { const txt = buildPrompt({ type: "create_challenge", quizItem: quizzes }); setPromptPanel({ text: txt }); setPromptCopied(false); }} style={{ padding: "12px 20px", borderRadius: 10, background: `${C.gold}15`, color: C.gold, fontSize: 13, fontWeight: 700, border: `1px solid ${C.gold}44` }}>📋 Gợi ý thử thách từ Claude</button>
              </div>

              {/* Challenge list */}
              {challenges.length === 0 && <Empty msg="Chưa có thử thách nào." />}
              {challenges.map(ch => {
                const assignee = ch.assignTo === "all" ? "Tất cả" : ch.assignTo === "dept" ? ch.assignDept : !ch.assignTo ? "Tất cả" : (() => { const _a = accounts.find(a => a.id === ch.assignTo); return _a ? _a.name : ch.assignTo; });
                const completed = ch.completedBy || [];
                const targetAccs = !ch.assignTo || ch.assignTo === "all" ? accounts : ch.assignTo === "dept" ? accounts.filter(a => a.dept === ch.assignDept) : accounts.filter(a => a.id === ch.assignTo);
                const expanded = formData.chExpand === ch.id;
                return (
                  <div key={ch.id} style={{ ...card }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <span style={{ fontSize: 24 }}>🎯</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: C.white, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{ch.title}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          {tag("+" + ch.xpReward + " XP", C.gold)}
                          {tag("👤 " + assignee, C.blue)}
                          {ch.deadline && tag("⏰ " + ch.deadline, ch.deadline && daysSince(ch.deadline + "T23:59") > 0 ? C.red : C.orange)}
                          <button onClick={() => setFormData({ ...formData, chExpand: expanded ? null : ch.id })} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: completed.length > 0 ? `${C.green}22` : "rgba(255,255,255,0.06)", color: completed.length > 0 ? C.green : "rgba(255,255,255,0.4)", fontWeight: 700, border: `1px solid ${completed.length > 0 ? C.green + "44" : C.border}`, cursor: "pointer" }}>{completed.length}/{targetAccs.length} hoàn thành {expanded ? "▲" : "▼"}</button>
                        </div>
                        {ch.rewards && ch.rewards.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                            {ch.rewards.map((r, i) => <span key={i} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: `${C.purple}15`, color: C.purple, border: `1px solid ${C.purple}33` }}>🎁 {r}</span>)}
                          </div>
                        )}
                        {/* Completion details */}
                        {expanded && (
                          <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, marginBottom: 6 }}>TIẾN ĐỘ ({completed.length}/{targetAccs.length})</div>
                            {targetAccs.map(a => {
                              const done = completed.includes(a.id);
                              return (
                                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                                  <span style={{ fontSize: 14 }}>{done ? "✅" : "⬜"}</span>
                                  <span style={{ flex: 1, color: done ? C.green : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: done ? 600 : 400 }}>{a.name} ({a.empId})</span>
                                  <span style={{ fontSize: 10, color: done ? C.green : "rgba(255,255,255,0.2)" }}>{done ? "Đã hoàn thành" : "Chưa thực hiện"}{done && ch.wonRewards && ch.wonRewards[a.id] ? <span style={{ color: C.purple }}>{" · 🎁 " + ch.wonRewards[a.id]}</span> : null}{done && ch.wonRewards && ch.wonRewards[a.id] && (
                                    <button onClick={async (ev) => { ev.stopPropagation(); const delivered = { ...(ch.delivered || {}), [a.id]: !(ch.delivered || {})[a.id] }; const upd = challenges.map(c => c.id === ch.id ? { ...c, delivered } : c); setChallenges(upd); await DB.set("km-challenges", upd); if (delivered[a.id]) addNotif(a.id, "🎁 Phần thưởng '" + ch.wonRewards[a.id] + "' đã được trao! Thử thách: " + ch.title); }} style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: (ch.delivered || {})[a.id] ? `${C.green}22` : "rgba(255,255,255,0.06)", color: (ch.delivered || {})[a.id] ? C.green : "rgba(255,255,255,0.3)", border: `1px solid ${(ch.delivered || {})[a.id] ? C.green + "44" : C.border}`, cursor: "pointer" }}>{(ch.delivered || {})[a.id] ? "✅ Đã trao" : "☐ Trao thưởng"}</button>
                                  )}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 4 }}>Tạo bởi {ch.createdByName || "Admin"} · {fmtDate(ch.createdAt)}</div>
                      </div>
                      <button onClick={async () => { if (window.confirm("Xóa thử thách \"" + ch.title + "\"?\nThao tác này không thể hoàn tác.")) { await supabase.from("challenges").delete().eq("id", ch.id); updChallenges(challenges.filter(x => x.id !== ch.id)); } }} style={{ padding: "6px 10px", borderRadius: 6, background: `${C.red}22`, color: C.red, fontSize: 11, fontWeight: 600, border: "none" }}>Xóa</button>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>}

            {/* ── NEW CHALLENGE FORM ── */}
            {subScreen === "newCh" && (
              <div style={{ ...card, background: "rgba(197,153,62,0.04)", border: "1px solid rgba(197,153,62,0.15)" }}>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>TẠO THỬ THÁCH MỚI</div>
                <div style={{ marginBottom: 10 }}><label style={lbl}>Tên thử thách *</label><input value={formData.chTitle || ""} onChange={e => setFormData({ ...formData, chTitle: e.target.value })} placeholder="VD: Chinh phục kiến thức Polyurea" style={inp} /></div>

                {/* Quiz selection */}
                <div style={{ marginBottom: 10, padding: 14, borderRadius: 10, background: `${C.green}06`, border: `1px solid ${C.green}22` }}>
                  <label style={{ ...lbl, color: C.green }}>📝 Bài kiểm tra gắn kết *</label>
                  <select value={formData.chQuiz || ""} onChange={e => setFormData({ ...formData, chQuiz: e.target.value })} style={inp}>
                    <option value="">— Chọn đề kiểm tra —</option>
                    {quizzes.map(q => <option key={q.id} value={q.id}>{q.title} ({q.questions.length} câu)</option>)}
                  </select>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <div><label style={lbl}>Điều kiện đạt (% tối thiểu)</label><input type="number" value={formData.chMinScore || 70} onChange={e => setFormData({ ...formData, chMinScore: Math.min(100, Math.max(0, +e.target.value)) })} min={0} max={100} style={inp} /></div>
                    <div><label style={lbl}>XP thưởng thêm</label><input type="number" value={formData.chXP || 50} onChange={e => setFormData({ ...formData, chXP: +e.target.value })} style={inp} /></div>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>Học viên làm bài kiểm tra → đạt ≥{formData.chMinScore || 70}% → tự động hoàn thành thử thách</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 10 }}>
                  <div><label style={lbl}>Hạn hoàn thành</label><input type="date" value={formData.chDeadline || ""} onChange={e => setFormData({ ...formData, chDeadline: e.target.value })} style={inp} /></div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Gán cho</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    {[{ v: "all", l: "Tất cả" }, { v: "dept", l: "Phòng ban" }, { v: "person", l: "Cá nhân" }].map(o => <button key={o.v} onClick={() => setFormData({ ...formData, chAssign: o.v })} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: (formData.chAssign || "all") === o.v ? 700 : 500, background: (formData.chAssign || "all") === o.v ? `${C.gold}22` : "rgba(255,255,255,0.03)", color: (formData.chAssign || "all") === o.v ? C.gold : "rgba(255,255,255,0.3)", border: `1px solid ${(formData.chAssign || "all") === o.v ? C.gold + "44" : C.border}` }}>{o.l}</button>)}
                  </div>
                  {formData.chAssign === "dept" && <select value={formData.chDept || DEPTS[0]} onChange={e => setFormData({ ...formData, chDept: e.target.value })} style={inp}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select>}
                  {formData.chAssign === "person" && <select value={formData.chPerson || ""} onChange={e => setFormData({ ...formData, chPerson: e.target.value })} style={inp}><option value="">— Chọn NV —</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.empId})</option>)}</select>}
                </div>
                {/* Rewards */}
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>🎁 Phần thưởng (tối đa 5 món)</label>
                  {(formData.chRewards || []).map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                      <input value={r} onChange={e => { const rw = [...(formData.chRewards || [])]; rw[i] = e.target.value; setFormData({ ...formData, chRewards: rw }); }} placeholder={"Món quà " + (i + 1)} style={{ ...inp, flex: 1 }} />
                      <button onClick={() => { const rw = [...(formData.chRewards || [])]; rw.splice(i, 1); setFormData({ ...formData, chRewards: rw }); }} style={{ padding: "6px 10px", borderRadius: 6, background: `${C.red}22`, color: C.red, fontSize: 14, border: "none" }}>✕</button>
                    </div>
                  ))}
                  {(formData.chRewards || []).length < 5 && <button onClick={() => setFormData({ ...formData, chRewards: [...(formData.chRewards || []), ""], })} style={{ ...btnO, fontSize: 11, padding: "6px 14px" }}>+ Thêm phần thưởng</button>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={async () => {
                    if (!(formData.chTitle || "").trim() || !formData.chQuiz) return;
                    const assignTo = formData.chAssign === "dept" ? "dept" : formData.chAssign === "person" ? (formData.chPerson || "all") : "all";
                    const selQuiz = quizzes.find(q => q.id === formData.chQuiz);
                    const ch = { id: uid(), title: formData.chTitle, quizId: formData.chQuiz, quizTitle: (selQuiz && selQuiz.title) || "", minScore: formData.chMinScore || 70, xpReward: formData.chXP || 50, deadline: formData.chDeadline || "", assignTo, assignDept: formData.chDept || "", rewards: (formData.chRewards || []).filter(r => r.trim()), createdAt: new Date().toISOString(), createdBy: currentUser ? currentUser.id : null, createdByName: currentUser ? currentUser.name : "Admin", active: true, completedBy: [], wonRewards: {} };
                    // Reload latest from storage before appending
                    let existing = challenges;
                    try { const fromDB = await DB.get("km-challenges", []); if (Array.isArray(fromDB) && fromDB.length >= existing.length) existing = fromDB; } catch (e) { }
                    const newCh = [...existing, ch];
                    setChallenges(newCh);
                    const saved = await DB.set("km-challenges", newCh);
                    if (!saved) { setSaveStatus("error"); return; }
                    // Notifications
                    const targets = assignTo === "all" ? accounts : assignTo === "dept" ? accounts.filter(a => a.dept === formData.chDept) : accounts.filter(a => a.id === assignTo);
                    let curNotifs = notifications;
                    try { const nfDB = await DB.get("km-notifications", []); if (Array.isArray(nfDB) && nfDB.length >= curNotifs.length) curNotifs = nfDB; } catch (e) { }
                    const newNotifs = [...curNotifs];
                    targets.forEach(t => newNotifs.push({ id: uid(), empId: t.id, msg: "🎯 Thử thách: " + formData.chTitle + " — Đạt ≥" + ch.minScore + "% bài " + ch.quizTitle + (ch.rewards.length > 0 ? " · 🎁 " + ch.rewards.length + " phần thưởng" : ""), type: "challenge", date: new Date().toISOString(), read: false }));
                    setNotifications(newNotifs); await DB.set("km-notifications", newNotifs);
                    setSaveStatus("saved"); setFormData({}); setSubScreen(null);
                  }} style={{ ...btnG, opacity: (!(formData.chTitle || "").trim() || !formData.chQuiz) ? 0.4 : 1 }}>🎯 Tạo thử thách</button>
                  <button onClick={() => { setFormData({}); setSubScreen(null); }} style={btnO}>Hủy</button>
                </div>
              </div>
            )}

            {/* ═══ LEARNING PATHWAYS ═══ */}
            {!subScreen && <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700 }}>📋 LỘ TRÌNH ĐÀO TẠO</div>
                <button onClick={() => setSubScreen("newPath")} style={{ ...btnO, fontSize: 11, padding: "6px 14px" }}>+ Tạo lộ trình</button>
              </div>
              {paths.length === 0 && <Empty msg="Chưa có lộ trình. Bấm + Tạo lộ trình." />}
              {paths.map(p => {
                const stageCount = (p.stages || []).length; const moduleCount = (p.stages || []).reduce((s, st) => s + (st.modules || []).length, 0);
                const assigned = (p.assignedTo || []).map(id => accounts.find(a => a.id === id)).filter(Boolean);
                const expanded = formData.pathExpand === p.id;
                // Calc progress per user
                const getUserProg = (m) => { let total = 0, done = 0; (p.stages || []).forEach(st => (st.modules || []).forEach(mod => { total++; const prog = (m.pathProgress || {})[p.id] || {}; const checkDone = (mod.checklist || []).length === 0 || (mod.checklist || []).every((_, ci) => (prog.checks || {})[mod.id + "_" + ci]); const quizDone = !mod.quizId || results.some(r => r.empId === m.id && r.quizId === mod.quizId && r.pct >= (mod.minScore || 70)); if (checkDone && quizDone) done++; })); return { total, done, pct: total > 0 ? Math.round(done / total * 100) : 0 }; };
                const completedCount = assigned.filter(a => getUserProg(a).pct === 100).length;
                return (
                  <div key={p.id} style={{ ...card }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📋</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>{p.title}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>{tag(p.dept || "Tất cả", C.blue)}{tag(stageCount + " giai đoạn", C.gold)}{tag(moduleCount + " module", C.purple)}</div>
                        {assigned.length > 0 && (
                          <button onClick={() => setFormData({ ...formData, pathExpand: expanded ? null : p.id })} style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 6, fontSize: 10, fontWeight: 700, color: completedCount > 0 ? C.green : "rgba(255,255,255,0.4)", background: completedCount > 0 ? `${C.green}22` : "rgba(255,255,255,0.06)", padding: "3px 10px", borderRadius: 4, border: `1px solid ${completedCount > 0 ? C.green + "44" : C.border}`, cursor: "pointer" }}>{completedCount}/{assigned.length} hoàn thành {expanded ? "▲" : "▼"}</button>
                        )}
                        {expanded && assigned.length > 0 && (
                          <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                            {assigned.map(a => {
                              const pg = getUserProg(a); return (
                                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                                  <span style={{ fontSize: 12 }}>{pg.pct === 100 ? "✅" : "⬜"}</span>
                                  <span style={{ flex: 1, color: pg.pct === 100 ? C.green : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: pg.pct === 100 ? 600 : 400 }}>{a.name} ({a.empId})</span>
                                  <div style={{ width: 60, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${pg.pct}%`, background: pg.pct === 100 ? C.green : C.gold, borderRadius: 3 }} /></div>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: pg.pct === 100 ? C.green : C.gold, width: 30, textAlign: "right" }}>{pg.pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button onClick={() => { setFormData({ editPathId: p.id }); setSubScreen("editPath"); }} style={{ padding: "6px 10px", borderRadius: 6, background: `${C.blue}22`, color: C.blue, fontSize: 11, fontWeight: 600, border: "none" }}>Sửa</button>
                      <button onClick={async () => { if (!window.confirm("Xóa lộ trình \"" + p.title + "\"?\nThao tác này không thể hoàn tác.")) return; await supabase.from("paths").delete().eq("id", p.id); const np = paths.filter(x => x.id !== p.id); setPaths(np); }} style={{ padding: "6px 10px", borderRadius: 6, background: `${C.red}22`, color: C.red, fontSize: 11, fontWeight: 600, border: "none" }}>Xóa</button>
                    </div>
                  </div>
                );
              })}
            </div>}

            {/* ── CREATE/EDIT PATHWAY ── */}
            {(subScreen === "newPath" || subScreen === "editPath") && (() => {
              const isEdit = subScreen === "editPath";
              const editPath = isEdit ? paths.find(p => p.id === formData.editPathId) : null;
              const pTitle = isEdit ? (formData.pTitle !== undefined ? formData.pTitle : (editPath && editPath.title) || "") : (formData.pTitle || "");
              const pDept = isEdit ? (formData.pDept !== undefined ? formData.pDept : (editPath && editPath.dept) || DEPTS[0]) : (formData.pDept || DEPTS[0]);
              const pStages = isEdit ? (formData.pStages !== undefined ? formData.pStages : (editPath && editPath.stages) || []) : (formData.pStages || []);
              const pAssign = isEdit ? (formData.pAssign !== undefined ? formData.pAssign : (editPath && editPath.assignedTo) || []) : (formData.pAssign || []);
              return (
                <div style={{ ...card, background: "rgba(197,153,62,0.04)", border: "1px solid rgba(197,153,62,0.15)" }}>
                  <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>{isEdit ? "CHỈNH SỬA" : "TẠO"} LỘ TRÌNH</div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div><label style={lbl}>Tên lộ trình *</label><input value={pTitle} onChange={e => setFormData({ ...formData, pTitle: e.target.value })} placeholder="VD: Onboarding NV Kinh doanh" style={inp} /></div>
                    <div><label style={lbl}>Phòng ban</label><select value={pDept} onChange={e => setFormData({ ...formData, pDept: e.target.value })} style={inp}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></div>
                  </div>

                  {/* Assign employees */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Gán cho NV (chọn nhiều)</label>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {accounts.filter(a => a.dept === pDept || pDept === "Tất cả").map(a => {
                        const on = pAssign.includes(a.id); return (
                          <button key={a.id} onClick={() => { const na = on ? pAssign.filter(x => x !== a.id) : [...pAssign, a.id]; setFormData({ ...formData, pAssign: na }); }} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 10, background: on ? `${C.green}22` : "rgba(255,255,255,0.03)", color: on ? C.green : "rgba(255,255,255,0.3)", border: `1px solid ${on ? C.green + "44" : C.border}` }}>{on ? "✓ " : ""}{a.name}</button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stages */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <label style={{ ...lbl, marginBottom: 0 }}>Giai đoạn</label>
                      <button onClick={() => { const ns = [...pStages, { id: uid(), title: "Giai đoạn " + (pStages.length + 1), modules: [] }]; setFormData({ ...formData, pStages: ns }); }} style={{ ...btnO, fontSize: 10, padding: "4px 12px" }}>+ Thêm giai đoạn</button>
                    </div>
                    {pStages.map((stage, si) => (
                      <div key={stage.id} style={{ borderRadius: 10, border: `1px solid ${C.gold}22`, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "10px 14px", background: `${C.gold}08`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <input value={stage.title} onChange={e => { const ns = [...pStages]; ns[si] = { ...ns[si], title: e.target.value }; setFormData({ ...formData, pStages: ns }); }} style={{ ...inp, background: "transparent", border: "none", padding: "2px 6px", fontWeight: 700, color: C.goldL }} placeholder="Tên giai đoạn" />
                          <button onClick={() => { const ns = pStages.filter((_, i) => i !== si); setFormData({ ...formData, pStages: ns }); }} style={{ fontSize: 14, color: C.red, background: "none", border: "none", padding: "2px 6px" }}>✕</button>
                        </div>
                        <div style={{ padding: "10px 14px" }}>
                          {/* Modules */}
                          {(stage.modules || []).map((mod, mi) => (
                            <div key={mod.id} style={{ borderRadius: 8, border: `1px solid ${C.border}`, padding: "10px 12px", marginBottom: 6, background: "rgba(255,255,255,0.02)" }}>
                              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                <input value={mod.title} onChange={e => { const ns = [...pStages]; ns[si].modules[mi] = { ...ns[si].modules[mi], title: e.target.value }; setFormData({ ...formData, pStages: ns }); }} style={{ ...inp, flex: 1, padding: "6px 10px", fontSize: 12 }} placeholder="Tên module" />
                                <button onClick={() => { const ns = [...pStages]; ns[si].modules = ns[si].modules.filter((_, i) => i !== mi); setFormData({ ...formData, pStages: ns }); }} style={{ fontSize: 12, color: C.red, background: "none", border: "none" }}>✕</button>
                              </div>
                              {/* Link quiz */}
                              <div style={{ marginBottom: 4 }}><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Bài kiểm tra (mở khóa tuần tự)</label>
                                <select value={mod.quizId || ""} onChange={e => { const ns = [...pStages]; ns[si].modules[mi] = { ...ns[si].modules[mi], quizId: e.target.value, quizTitle: (() => { const _q = quizzes.find(q => q.id === e.target.value); return _q ? _q.title : ""; }) }; setFormData({ ...formData, pStages: ns }); }} style={{ ...inp, padding: "5px 8px", fontSize: 11 }}>
                                  <option value="">— Không gắn đề —</option>{quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                                </select>
                              </div>
                              {mod.quizId && <div style={{ marginBottom: 4 }}><label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Điểm tối thiểu (%)</label><input type="number" value={mod.minScore || 70} onChange={e => { const ns = [...pStages]; ns[si].modules[mi] = { ...ns[si].modules[mi], minScore: +e.target.value }; setFormData({ ...formData, pStages: ns }); }} style={{ ...inp, padding: "5px 8px", fontSize: 11, width: 80 }} /></div>}
                              {/* Checklist */}
                              <div style={{ marginTop: 4 }}>
                                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Checklist việc cần làm</label>
                                {(mod.checklist || []).map((cl, ci) => (
                                  <div key={ci} style={{ display: "flex", gap: 4, marginBottom: 3 }}>
                                    <input value={cl} onChange={e => { const ns = [...pStages]; const nl = [...(ns[si].modules[mi].checklist || [])]; nl[ci] = e.target.value; ns[si].modules[mi] = { ...ns[si].modules[mi], checklist: nl }; setFormData({ ...formData, pStages: ns }); }} style={{ ...inp, flex: 1, padding: "5px 10px", fontSize: 11 }} placeholder={"Việc " + (ci + 1)} />
                                    <button onClick={() => { const ns = [...pStages]; ns[si].modules[mi].checklist = ns[si].modules[mi].checklist.filter((_, i) => i !== ci); setFormData({ ...formData, pStages: ns }); }} style={{ fontSize: 10, color: C.red, background: "none", border: "none" }}>✕</button>
                                  </div>
                                ))}
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button onClick={() => { const ns = [...pStages]; ns[si].modules[mi] = { ...ns[si].modules[mi], checklist: [...(ns[si].modules[mi].checklist || []), ""] }; setFormData({ ...formData, pStages: ns }); }} style={{ ...btnO, fontSize: 10, padding: "5px 10px" }}>+ Thêm việc</button>
                                  <button onClick={async () => {
                                    if (!mod.title) return; setAiLoading(true); setAiStatus("AI đang gợi ý checklist...");
                                    try {
                                      await supabase.auth.getSession(); // Refresh JWT
                                      const { data: rawCl, error: fnErr } = await supabase.functions.invoke("claude-proxy", { body: { model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: `Tạo checklist 5-8 việc cần làm cho module đào tạo "${mod.title}" phòng ban ${pDept}. Trả về CHỈ JSON array: ["việc 1","việc 2",...]. Cụ thể, thực tế.` }] }, responseType: "text" });
                                      if (fnErr) throw new Error(fnErr.message || "Edge function error");
                                      var clData; try { clData = typeof rawCl === "string" ? JSON.parse(rawCl) : rawCl; } catch (pe) { throw new Error("Response parse error: " + String(rawCl).slice(0, 200)); }
                                      if (clData && clData.error) throw new Error(clData.error.message || "API error");
                                      let txt = (clData?.content || []).map(c => c.text || "").join("") || ""; txt = txt.replace(/```json\s*/g, "").replace(/```/g, "").replace(/,\s*]/g, "]").trim(); const arr = JSON.parse(txt);
                                      const ns = [...pStages]; ns[si].modules[mi] = { ...ns[si].modules[mi], checklist: [...(ns[si].modules[mi].checklist || []), ...arr] }; setFormData({ ...formData, pStages: ns });
                                      setAiLoading(false); setAiStatus("");
                                    } catch (err) { setAiLoading(false); setAiStatus("Lỗi: " + err.message.slice(0, 200)); }
                                  }} disabled={aiLoading} style={{ ...btnO, fontSize: 10, padding: "5px 10px", color: C.green }}>{aiLoading ? "⏳" : "🤖 AI gợi ý"}</button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button onClick={() => { const ns = [...pStages]; ns[si].modules = [...(ns[si].modules || []), { id: uid(), title: "", quizId: "", minScore: 70, checklist: [] }]; setFormData({ ...formData, pStages: ns }); }} style={{ ...btnO, fontSize: 10, padding: "5px 12px", width: "100%" }}>+ Thêm module</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {aiStatus && <div style={{ fontSize: 11, color: C.goldL, marginBottom: 8, animation: "pulse 1.5s infinite" }}>{aiStatus}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={async () => {
                      if (!pTitle.trim() || pStages.length === 0) return;
                      const pathData = { id: isEdit ? editPath.id : uid(), title: pTitle, dept: pDept, stages: pStages.map(s => ({ ...s, modules: (s.modules || []).filter(m => m.title || m.quizId).map(m => ({ ...m, checklist: (m.checklist || []).filter(Boolean) })) })), assignedTo: pAssign, createdAt: isEdit ? editPath.createdAt : new Date().toISOString() };
                      let existing = paths; try { const fromDB = await DB.get("km-paths", []); if (Array.isArray(fromDB)) existing = fromDB; } catch (e) { }
                      const np = isEdit ? existing.map(p => p.id === pathData.id ? pathData : p) : [...existing, pathData];
                      setPaths(np); await DB.set("km-paths", np);
                      // Notify assigned employees
                      if (!isEdit) { pAssign.forEach(aId => { addNotif(aId, "📋 Bạn được gán lộ trình đào tạo: " + pTitle, "pathway"); }); }
                      setSaveStatus("saved"); setFormData({}); setSubScreen(null);
                    }} style={{ ...btnG, opacity: (!pTitle.trim() || pStages.length === 0) ? 0.4 : 1 }}>{isEdit ? "Cập nhật" : "Tạo lộ trình"}</button>
                    <button onClick={() => { setFormData({}); setSubScreen(null); }} style={btnO}>Hủy</button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ ADMIN: ACTIVITY ═══ */}
        {role === "admin" && screen === "admin_activity" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>📈 Hoạt Động 30 Ngày</h2><button onClick={() => setScreen("admin_home")} style={btnO}>← Quay lại</button>
            </div>
            <div style={card}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={getActivityData()}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} /><YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} /><Tooltip contentStyle={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={(value, name) => [value, name === "logins" ? "Đăng nhập" : "Lượt thi"]} /><Bar dataKey="logins" fill={C.teal} radius={[4, 4, 0, 0]} name="logins" /><Bar dataKey="quizzes" fill={C.gold} radius={[4, 4, 0, 0]} name="quizzes" /></BarChart>
              </ResponsiveContainer>
            </div>
            {/* Inactive employees */}
            <div style={card}>
              <div style={{ fontSize: 13, color: C.orange, fontWeight: 700, marginBottom: 10 }}>{"⚠️ NHÂN VIÊN KHÔNG HOẠT ĐỘNG (>7 ngày)"}</div>
              {accounts.filter(a => !a.lastCheckIn || daysSince(a.lastCheckIn) > 7).length === 0 ? <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: 12 }}>✓ Tất cả đang hoạt động</div> :
                accounts.filter(a => !a.lastCheckIn || daysSince(a.lastCheckIn) > 7).map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 16 }}>😴</span>
                    <div style={{ flex: 1 }}><div style={{ color: C.white, fontSize: 13 }}>{a.name}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{a.dept} · {a.lastCheckIn ? `${daysSince(a.lastCheckIn)} ngày trước` : "Chưa bao giờ đăng nhập"}</div></div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ═══ ADMIN: BACKUP ═══ */}
        {role === "admin" && screen === "admin_backup" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>💾 Sao Lưu & Khôi Phục</h2><button onClick={() => setScreen("admin_home")} style={btnO}>← Quay lại</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ ...card, textAlign: "center", padding: 28 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📤</div>
                <div style={{ color: C.white, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Xuất Backup</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>Tải toàn bộ dữ liệu về máy tính</div>
                <button onClick={async () => {
                  setSaveStatus("saved");
                  // Reload ALL data fresh from DB before backup — avoid stale state
                  const [a, k, q, r, rec, ch, notif, p, s, bul] = await Promise.all([
                    DB.get("km-accounts", []), DB.get("km-knowledge", []), DB.get("km-quizzes", []),
                    DB.get("km-results", []), DB.get("km-recognitions", []), DB.get("km-challenges", []),
                    DB.get("km-notifications", []), DB.get("km-paths", []), DB.get("km-settings", null), DB.get("km-bulletins", []),
                  ]);
                  const safeAcc = (Array.isArray(a) ? a : accounts).map(ac => ({ ...ac }));
                  const d = {
                    accounts: safeAcc,
                    knowledge: Array.isArray(k) && k.length > 0 ? k : knowledge,
                    quizzes: Array.isArray(q) && q.length > 0 ? q : quizzes,
                    results: Array.isArray(r) && r.length > 0 ? r : results,
                    recognitions: Array.isArray(rec) && rec.length > 0 ? rec : recognitions,
                    challenges: Array.isArray(ch) && ch.length > 0 ? ch : challenges,
                    notifications: Array.isArray(notif) && notif.length > 0 ? notif : notifications,
                    paths: Array.isArray(p) && p.length > 0 ? p : paths,
                    bulletins: Array.isArray(bul) && bul.length > 0 ? bul : bulletins,
                    settings: s || settings,
                    exportDate: new Date().toISOString(), version: "v3"
                  };
                  const j = JSON.stringify(d, null, 2);
                  setBackupJson(j); setBkCopied(false);
                  // Try download as .txt
                  try {
                    const fname = `kingsmen-backup-${today()}.txt`;
                    const blob = new Blob([j], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a2 = document.createElement("a"); a2.href = url; a2.download = fname;
                    document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
                    setTimeout(() => URL.revokeObjectURL(url), 3000);
                  } catch (e) { }
                }} style={btnG}>📦 Tải Backup (.txt)</button>
                {backupJson && (<React.Fragment>
                  {(() => {
                    let bd = {};
                    try { bd = JSON.parse(backupJson); } catch (e) { }
                    return (<React.Fragment>
                      <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: `${C.teal}08`, border: `1px solid ${C.teal}22`, fontSize: 11, lineHeight: 1.8 }}>
                        <b style={{ color: C.goldL }}>✅ Backup gồm:</b>&nbsp;
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>
                          👤{(bd.accounts || []).length} TK &nbsp;·&nbsp;
                          📚{(bd.knowledge || []).length} KT &nbsp;·&nbsp;
                          📝{(bd.quizzes || []).length} đề &nbsp;·&nbsp;
                          📊{(bd.results || []).length} KQ &nbsp;·&nbsp;
                          🎯{(bd.challenges || []).length} TC &nbsp;·&nbsp;
                          📋{(bd.paths || []).length} LT &nbsp;·&nbsp;
                          📢{(bd.bulletins || []).length} BT
                        </span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: C.goldL, fontWeight: 700 }}>📋 Chọn tất cả rồi Copy:</div>
                      <textarea
                        readOnly
                        value={backupJson}
                        onFocus={e => { e.target.select(); }}
                        onClick={e => { e.target.select(); }}
                        style={{ ...inp, height: 120, fontSize: 10, fontFamily: "monospace", resize: "vertical", marginTop: 4, cursor: "text", letterSpacing: 0 }}
                      />
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, lineHeight: 1.7 }}>
                        ① Bấm vào ô trên → tự động chọn hết<br />
                        ② Nhấn <b style={{ color: C.white }}>Ctrl+C</b> (Windows) hoặc <b style={{ color: C.white }}>Cmd+C</b> (Mac)<br />
                        ③ Mở Notepad → Ctrl+V → <b style={{ color: C.white }}>File → Save As → đặt tên .txt → Save</b>
                      </div>
                    </React.Fragment>);
                  })()}
                </React.Fragment>)}
              </div>
              <div style={{ ...card, textAlign: "center", padding: 28 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📥</div>
                <div style={{ color: C.white, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Khôi Phục</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>Tải lên file backup JSON để khôi phục</div>
                <label style={{ ...btnG, display: "inline-block", cursor: "pointer" }} onClick={() => setImportStatus(null)}>⬆️ Chọn file backup (.json hoặc .txt)<input type="file" accept=".json,.txt" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) { setImportStatus(null); importBackup(e.target.files[0]); e.target.value = ""; } }} />
                </label>
                {importStatus && (
                  <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: importStatus.ok === null ? `${C.gold}08` : importStatus.ok ? `${C.green}10` : `${C.red}10`, border: `1px solid ${importStatus.ok === null ? C.gold : importStatus.ok ? C.green : C.red}33`, fontSize: 12, color: importStatus.ok === null ? C.goldL : importStatus.ok ? C.green : "#e74c3c", lineHeight: 1.9, whiteSpace: "pre-line", textAlign: "left" }}>
                    {importStatus.msg}
                    {importStatus.ok && <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Tải lại trang hoặc đăng nhập lại để thấy dữ liệu mới.</div>}
                  </div>
                )}

              </div>
            </div>
            <div style={{ ...card, marginTop: 8 }}>
              <div style={{ fontSize: 13, color: C.purple, fontWeight: 700, marginBottom: 10 }}>📦 CODE NGUỒN — PHIÊN BẢN v3.5</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>
                Để nâng cấp app, lấy file source code theo cách sau:
              </div>
              <div style={{ padding: 12, marginTop: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 2 }}>
                {"1. Mở cuộc trò chuyện Claude chứa artifact"}<br />
                {"2. Bấm vào artifact → biểu tượng tải (↓) góc phải"}<br />
                {"3. File kingsmen-platform-v3.jsx = chạy trên Claude"}<br />
                {"4. File App-hosting.jsx = chạy trên hosting riêng"}<br />
                {"5. Gửi file + yêu cầu trong cuộc trò chuyện mới"}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.2)" }}>v3.5 · {accounts.length} NV · {knowledge.length} bài · {quizzes.length} đề · {challenges.length} thử thách · {paths.length} lộ trình</div>
            </div>
            <div style={{ ...card, marginTop: 8 }}>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>THÔNG TIN DỮ LIỆU HIỆN TẠI</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
                {[["Tài khoản", accounts.length], ["Kiến thức", knowledge.length], ["Đề thi", quizzes.length], ["Kết quả", results.length], ["Tuyên dương", recognitions.length], ["Thử thách", challenges.length], ["Lộ trình", paths.length], ["Thông báo", notifications.length]].map(([l, v], i) => (
                  <div key={i} style={{ textAlign: "center", padding: 8 }}><div style={{ fontSize: 16, fontWeight: 800, color: C.goldL }}>{v}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{l}</div></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ ADMIN: CHANGELOG ═══ */}
        {role === "admin" && screen === "admin_changelog" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={hd(22)}>📋 Lịch Sử Nâng Cấp</h2>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Ghi lại tất cả thay đổi theo phiên bản</div>
              </div>
              <button onClick={() => setScreen("admin_home")} style={btnO}>← Quay lại</button>
            </div>
            {/* Version timeline */}
            <div style={{ position: "relative", paddingLeft: 28 }}>
              {/* Vertical line */}
              <div style={{ position: "absolute", left: 10, top: 8, bottom: 8, width: 2, background: `linear-gradient(180deg,${C.gold},${C.gold}22)` }} />
              {CHANGELOG.map((log, idx) => {
                const isLatest = idx === 0;
                const vColor = isLatest ? C.gold : idx === 1 ? C.blue : idx === 2 ? C.purple : "rgba(255,255,255,0.3)";
                return (
                  <div key={log.version} style={{ position: "relative", marginBottom: 24 }}>
                    {/* Dot */}
                    <div style={{ position: "absolute", left: -23, top: 14, width: 14, height: 14, borderRadius: 7, background: isLatest ? C.gold : "rgba(255,255,255,0.1)", border: `2px solid ${vColor}`, boxShadow: isLatest ? `0 0 10px ${C.gold}66` : undefined }} />
                    <div style={{ ...card, border: `1px solid ${vColor}22`, background: isLatest ? `${C.gold}06` : "rgba(255,255,255,0.02)" }}>
                      {/* Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ padding: "4px 12px", borderRadius: 20, background: `${vColor}22`, border: `1px solid ${vColor}44` }}>
                            <span style={{ fontFamily: "'Be Vietnam Pro',sans-serif", fontSize: 14, fontWeight: 900, color: vColor }}>{log.version}</span>
                          </div>
                          {isLatest && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${C.gold}22`, color: C.gold, fontWeight: 700, animation: "pulse 2s infinite" }}>● HIỆN TẠI</span>}
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{log.title}</span>
                        </div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>📅 {log.date}</span>
                      </div>
                      {/* Changes list */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {log.changes.map((ch, ci) => {
                          const isFix = ch.startsWith("🐛");
                          const isAdd = ch.startsWith("✨");
                          const isRefactor = ch.startsWith("🔄");
                          const isLaunch = ch.startsWith("🚀");
                          const bgColor = isFix ? `${C.red}0a` : isAdd ? `${C.green}0a` : isRefactor ? `${C.blue}0a` : isLaunch ? `${C.gold}0a` : "rgba(255,255,255,0.02)";
                          const borderColor = isFix ? `${C.red}22` : isAdd ? `${C.green}22` : isRefactor ? `${C.blue}22` : isLaunch ? `${C.gold}22` : `${C.border}`;
                          return (
                            <div key={ci} style={{ padding: "7px 12px", borderRadius: 8, background: bgColor, border: `1px solid ${borderColor}`, fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                              {ch}
                            </div>
                          );
                        })}
                      </div>
                      {/* Stats footer */}
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", gap: 12, fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                        <span>🔧 {log.changes.filter(c => c.startsWith("🐛")).length} bugfix</span>
                        <span>✨ {log.changes.filter(c => c.startsWith("✨")).length} tính năng mới</span>
                        <span>🔄 {log.changes.filter(c => c.startsWith("🔄")).length} cải tiến</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Summary stats */}
            <div style={{ ...card, background: `${C.purple}06`, border: `1px solid ${C.purple}22`, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: C.purple, fontWeight: 700, marginBottom: 10 }}>📊 TỔNG KẾT</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8, textAlign: "center" }}>
                {[
                  { l: "Phiên bản", v: CHANGELOG.length, c: C.gold },
                  { l: "Tính năng mới", v: CHANGELOG.reduce((s, l) => s + l.changes.filter(c => c.startsWith("✨")).length, 0), c: C.green },
                  { l: "Bug đã sửa", v: CHANGELOG.reduce((s, l) => s + l.changes.filter(c => c.startsWith("🐛")).length, 0), c: C.red },
                  { l: "Cải tiến", v: CHANGELOG.reduce((s, l) => s + l.changes.filter(c => c.startsWith("🔄") || c.startsWith("🚀")).length, 0), c: C.blue },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "12px 8px", borderRadius: 10, background: `${s.c}08`, border: `1px solid ${s.c}22` }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: s.c, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
                Kingsmen Training Platform · keokingsmen.com · 19007121
              </div>
            </div>
          </div>
        )}

        {/* ═══ ADMIN: SETTINGS ═══ */}
        {role === "admin" && screen === "admin_settings" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>⚙️ Cài Đặt Điểm & Cấp Độ</h2><button onClick={() => setScreen("admin_home")} style={btnO}>← Quay lại</button>
            </div>
            {/* XP Settings */}
            <div style={{ ...card, background: "rgba(197,153,62,0.04)", border: "1px solid rgba(197,153,62,0.15)" }}>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>🏅 ĐIỂM XP</div>
              {[
                { k: "xpCorrect", l: "XP mỗi câu đúng", d: "Cộng mỗi câu trả lời đúng" },
                { k: "xpPass", l: "XP bonus khi đạt (≥ điểm đạt)", d: "Cộng thêm khi đậu bài thi" },
                { k: "xpBonus90", l: "XP bonus khi ≥90%", d: "Thưởng cho kết quả xuất sắc" },
                { k: "xpPerfect", l: "XP bonus khi 100%", d: "Thưởng cho điểm tuyệt đối" },
                { k: "streakXP", l: "XP streak mỗi ngày", d: "Cộng khi check-in liên tục" },
              ].map(s => (
                <div key={s.k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1 }}><div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{s.l}</div><div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{s.d}</div></div>
                  <input type="number" value={settings[s.k] || 0} onChange={e => { const ns = { ...settings, [s.k]: +e.target.value }; setSettings(ns); }} style={{ ...inp, width: 70, textAlign: "center", padding: "6px 8px" }} />
                </div>
              ))}
            </div>
            {/* Pass Score */}
            <div style={{ ...card }}>
              <div style={{ fontSize: 13, color: C.green, fontWeight: 700, marginBottom: 12 }}>✅ ĐIỂM ĐẠT</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}><div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>Điểm đạt tối thiểu (%)</div><div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Dưới mức này = không đạt bài kiểm tra</div></div>
                <input type="number" value={settings.passScore || 70} onChange={e => { const ns = { ...settings, passScore: +e.target.value }; setSettings(ns); }} style={{ ...inp, width: 70, textAlign: "center", padding: "6px 8px" }} />
              </div>
            </div>
            {/* Level System - Editable */}
            <div style={{ ...card }}>
              <div style={{ fontSize: 13, color: C.purple, fontWeight: 700, marginBottom: 12 }}>🏆 HỆ THỐNG CẤP ĐỘ (tùy chỉnh XP)</div>
              {LEVELS.map((lv, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 18 }}>{lv.icon}</span>
                  <div style={{ flex: 1, color: C.white, fontSize: 13, fontWeight: 600 }}>{lv.name}</div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginRight: 4 }}>≥</span>
                  <input type="number" value={lv.min} onChange={e => { const nl = [...LEVELS]; nl[i] = { ...nl[i], min: Math.max(0, +e.target.value) }; setSettings({ ...settings, levels: nl }); }} style={{ ...inp, width: 70, textAlign: "center", padding: "5px 8px", fontSize: 12 }} disabled={i === 0} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>XP</span>
                </div>
              ))}
            </div>
            {/* Decay Settings */}
            <div style={{ ...card, background: "rgba(231,76,60,0.04)", border: "1px solid rgba(231,76,60,0.15)" }}>
              <div style={{ fontSize: 13, color: C.red, fontWeight: 700, marginBottom: 12 }}>📉 CƠ CHẾ TRỪ ĐIỂM (Decay)</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>NV không mở app quá số ngày quy định sẽ bị trừ XP. Khuyến khích học tập đều đặn.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
                <div>
                  <label style={lbl}>Số ngày được vắng</label>
                  <input type="number" value={settings.decayDays || 3} onChange={e => setSettings({ ...settings, decayDays: Math.max(1, +e.target.value) })} style={inp} />
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>Sau {settings.decayDays || 3} ngày không mở app → bắt đầu trừ</div>
                </div>
                <div>
                  <label style={lbl}>XP trừ mỗi ngày vắng</label>
                  <input type="number" value={settings.decayXP || 10} onChange={e => setSettings({ ...settings, decayXP: Math.max(0, +e.target.value) })} style={inp} />
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>VD: vắng 5 ngày = trừ {((settings.decayDays || 3) < 5 ? 5 - (settings.decayDays || 3) : 0) * (settings.decayXP || 10)} XP</div>
                </div>
              </div>
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{"Ví dụ: Vắng " + (settings.decayDays || 3) + " ngày = miễn phí. Ngày thứ " + ((settings.decayDays || 3) + 1) + " trở đi mỗi ngày trừ " + (settings.decayXP || 10) + " XP. XP không giảm dưới 0."}</div>
              </div>
            </div>
            {/* Idle Decay Settings */}
            <div style={{ ...card, background: "rgba(231,76,60,0.04)", border: "1px solid rgba(231,76,60,0.15)" }}>
              <div style={{ fontSize: 13, color: C.orange, fontWeight: 700, marginBottom: 12 }}>🧊 TRỪ ĐIỂM KHI KHÔNG HỌC TẬP</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>NV mở app nhưng không làm bài/học kiến thức (XP không tăng) trong thời gian dài → trừ XP. Khuyến khích học tập chủ động.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
                <div>
                  <label style={lbl}>Số ngày không tăng XP</label>
                  <input type="number" value={settings.idleDays || 7} onChange={e => setSettings({ ...settings, idleDays: Math.max(1, +e.target.value) })} style={inp} />
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>Sau {settings.idleDays || 7} ngày XP không tăng → trừ</div>
                </div>
                <div>
                  <label style={lbl}>XP trừ mỗi lần</label>
                  <input type="number" value={settings.idleXP || 15} onChange={e => setSettings({ ...settings, idleXP: Math.max(0, +e.target.value) })} style={inp} />
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>Trừ 1 lần khi đăng nhập</div>
                </div>
              </div>
              <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{"Ví dụ: NV mở app mỗi ngày nhưng " + (settings.idleDays || 7) + " ngày không thi/học → trừ " + (settings.idleXP || 15) + " XP. Cách khắc phục: làm 1 bài kiểm tra hoặc đọc 1 bài học."}</div>
              </div>
            </div>
            {/* Department Management */}
            <div style={{ ...card }}>
              <div style={{ fontSize: 13, color: C.blue, fontWeight: 700, marginBottom: 12 }}>🏢 PHÒNG BAN / BỘ PHẬN</div>
              {DEPTS.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 14 }}>🏢</span>
                  <input value={d} onChange={e => { const nd = [...DEPTS]; nd[i] = e.target.value; setSettings({ ...settings, depts: nd }); }} style={{ ...inp, flex: 1, padding: "5px 8px", fontSize: 12, border: "none", background: "transparent" }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{accounts.filter(a => a.dept === d).length} NV</span>
                  <button onClick={() => { if (DEPTS.length <= 1) return; const nd = DEPTS.filter((_, j) => j !== i); setSettings({ ...settings, depts: nd }); }} style={{ fontSize: 12, color: C.red, background: "none", border: "none", padding: "2px 6px" }}>✕</button>
                </div>
              ))}
              <button onClick={() => { const nd = [...DEPTS, "Phòng ban mới"]; setSettings({ ...settings, depts: nd }); }} style={{ ...btnO, fontSize: 11, padding: "6px 14px", marginTop: 8 }}>+ Thêm phòng ban</button>
            </div>
            {/* Save */}
            <button onClick={async () => { await DB.set("km-settings", settings); setSaveStatus("saved"); }} style={{ ...btnG, width: "100%", marginTop: 8 }}>💾 Lưu cài đặt</button>
            {/* Admin Password */}
            <div style={{ ...card, marginTop: 12, background: "rgba(231,76,60,0.04)", border: "1px solid rgba(231,76,60,0.15)" }}>
              <div style={{ fontSize: 13, color: C.red, fontWeight: 700, marginBottom: 10 }}>🔐 ĐỔI MẬT KHẨU ADMIN</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={lbl}>Mật khẩu mới</label><input type="password" value={formData.adminNewPw || ""} onChange={e => setFormData({ ...formData, adminNewPw: e.target.value })} style={inp} placeholder="Tối thiểu 6 ký tự" /></div>
                <div><label style={lbl}>Xác nhận mật khẩu</label><input type="password" value={formData.adminConfirmPw || ""} onChange={e => setFormData({ ...formData, adminConfirmPw: e.target.value })} style={inp} placeholder="Nhập lại MK mới" /></div>
              </div>
              <button onClick={async () => {
                if (!formData.adminNewPw || formData.adminNewPw.length < 6) { setSaveStatus("error"); return; }
                if (formData.adminNewPw !== formData.adminConfirmPw) { setSaveStatus("error"); return; }
                const { error } = await supabase.auth.updateUser({ password: formData.adminNewPw });
                if (error) { setSaveStatus("error"); return; }
                setSaveStatus("saved"); setFormData({ ...formData, adminNewPw: "", adminConfirmPw: "" });
              }} style={{ ...btnO, marginTop: 8, color: C.red, borderColor: `${C.red}44` }}>🔐 Đổi mật khẩu</button>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Mật khẩu tối thiểu 6 ký tự. Thay đổi qua Supabase Auth.</div>
            </div>
          </div>
        )}

        {/* ═══ ADMIN: BULLETINS ═══ */}
        {(role === "admin" && screen === "admin_bulletins" || (role === "employee" && screen === "dir_bulletins" && currentUser && currentUser.accRole === "director")) && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>📢 Bảng Tin & Chính Sách</h2>
              <div style={{ display: "flex", gap: 8 }}>
                {role === "admin" && <button onClick={() => { const txt = buildPrompt({ type: "bulletin_draft", bulletinType: formData.bulletinType || "notice" }); setPromptPanel({ text: txt }); setPromptCopied(false); }} style={{ padding: "8px 14px", borderRadius: 8, background: `${C.gold}15`, color: C.gold, fontSize: 12, fontWeight: 700, border: `1px solid ${C.gold}44` }}>📋 Soạn với Claude</button>}
                <button onClick={() => { setScreen(role === "admin" ? "admin_home" : "emp_home"); setSubScreen(null); }} style={btnO}>← Quay lại</button>
              </div>
            </div>
            {!subScreen && <React.Fragment>
              <button onClick={() => setSubScreen("newBul")} style={{ ...btnG, marginBottom: 14 }}>+ Đăng bài mới</button>
              {bulletins.length === 0 && <Empty msg="Chưa có bài đăng nào." />}
              {[...bulletins].reverse().map(b => (
                <div key={b.id} onClick={() => setFormData({ ...formData, expandBulId: formData.expandBulId === b.id ? null : b.id })} style={{ ...card, borderLeft: `4px solid ${b.type === "policy" ? C.red : b.type === "news" ? C.blue : C.gold}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 16 }}>{b.type === "policy" ? "📋" : b.type === "news" ? "📰" : b.type === "event" ? "🎉" : "📢"}</span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: b.type === "policy" ? `${C.red}22` : b.type === "news" ? `${C.blue}22` : `${C.gold}22`, color: b.type === "policy" ? C.red : b.type === "news" ? C.blue : C.gold, fontWeight: 700 }}>{b.type === "policy" ? "Chính sách" : b.type === "news" ? "Tin tức" : b.type === "event" ? "Sự kiện" : "Thông báo"}</span>
                        {b.pinned && <span style={{ fontSize: 10, color: C.gold }}>📌 Ghim</span>}
                      </div>
                      <div style={{ color: C.white, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{b.title}</div>
                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{formData.expandBulId === b.id ? b.content : (b.content.length > 200 ? b.content.slice(0, 200) + "..." : b.content)}</div>
                      {b.content.length > 200 && <div style={{ fontSize: 11, color: formData.expandBulId === b.id ? "rgba(255,255,255,0.3)" : C.teal, marginTop: 4 }}>{formData.expandBulId === b.id ? "▲ Thu gọn" : "▼ Xem thêm..."}</div>}
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 6 }}>{fmtDate(b.createdAt)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button onClick={async () => { const nb = bulletins.map(x => x.id === b.id ? { ...x, pinned: !x.pinned } : x); setBulletins(nb); await DB.set("km-bulletins", nb); }} style={{ padding: "5px 10px", borderRadius: 4, background: b.pinned ? `${C.gold}22` : "rgba(255,255,255,0.04)", color: b.pinned ? C.gold : "rgba(255,255,255,0.3)", fontSize: 11, border: "none" }}>📌</button>
                      <button onClick={async () => { if (!window.confirm("Xóa bài đăng \"" + b.title + "\"?")) return; await supabase.from("bulletins").delete().eq("id", b.id); const nb = bulletins.filter(x => x.id !== b.id); setBulletins(nb); }} style={{ padding: "5px 10px", borderRadius: 4, background: `${C.red}22`, color: C.red, fontSize: 11, border: "none" }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </React.Fragment>}
            {subScreen === "newBul" && (
              <div style={{ ...card, background: "rgba(197,153,62,0.04)", border: "1px solid rgba(197,153,62,0.15)" }}>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>ĐĂNG BÀI MỚI</div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div><label style={lbl}>Tiêu đề *</label><input value={formData.bulTitle || ""} onChange={e => setFormData({ ...formData, bulTitle: e.target.value })} placeholder="VD: Chính sách nghỉ phép 2026" style={inp} /></div>
                  <div><label style={lbl}>Loại</label><select value={formData.bulType || "notice"} onChange={e => setFormData({ ...formData, bulType: e.target.value })} style={inp}><option value="notice">📢 Thông báo</option><option value="policy">📋 Chính sách</option><option value="news">📰 Tin tức</option><option value="event">🎉 Sự kiện</option></select></div>
                </div>
                <div style={{ marginBottom: 8 }}><label style={lbl}>Nội dung *</label><textarea value={formData.bulContent || ""} onChange={e => setFormData({ ...formData, bulContent: e.target.value })} rows={6} placeholder="Nội dung chi tiết..." style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 12 }}><input type="checkbox" checked={formData.bulPinned || false} onChange={e => setFormData({ ...formData, bulPinned: e.target.checked })} /> 📌 Ghim lên đầu</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={async () => {
                    if (!(formData.bulTitle || "").trim() || !(formData.bulContent || "").trim()) return;
                    const b = { id: uid(), title: formData.bulTitle, content: formData.bulContent, type: formData.bulType || "notice", pinned: formData.bulPinned || false, author: currentUser ? currentUser.name : "Admin", createdAt: new Date().toISOString() };
                    let existing = bulletins; try { const db = await DB.get("km-bulletins", []); if (Array.isArray(db)) existing = db; } catch (e) { }
                    const nb = [...existing, b]; setBulletins(nb); await DB.set("km-bulletins", nb);
                    setSaveStatus("saved"); setFormData({}); setSubScreen(null);
                  }} style={btnG}>📢 Đăng bài</button>
                  <button onClick={() => { setFormData({}); setSubScreen(null); }} style={btnO}>Hủy</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ EMPLOYEE HOME ═══ */}
        {role === "employee" && screen === "emp_home" && currentUser && (
          <div style={{ animation: "fadeIn .4s" }}>
            {/* Profile */}
            <div style={{ ...card, padding: 20, display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ position: "relative", cursor: "pointer" }} onClick={() => { if (avatarInputRef.current) avatarInputRef.current.click(); }}>
                {currentUser.avatar ? (<img src={currentUser.avatar} alt="av" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", border: "2px solid " + (gL(currentUser.xp || 0).color || C.gold) + "44" }} />) : (<div style={{ width: 56, height: 56, borderRadius: 14, background: (gL(currentUser.xp || 0).color || C.gold) + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{gL(currentUser.xp || 0).icon}</div>)}
                <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.white, border: "2px solid #0f2d3a" }}>{"📷"}</div>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ ...hd(18), marginBottom: 2 }}>{currentUser.name}</h2>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 6 }}>{(currentUser || {}).dept} · {(currentUser || {}).empId} · 🔥 {(currentUser || {}).streak || 0} ngày</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: gL(currentUser.xp || 0).color || C.gold, fontWeight: 700 }}>{gL(currentUser.xp || 0).name} · {currentUser.xp || 0} XP</span>
                  {getNextLevel(currentUser.xp || 0) && <div style={{ flex: 1, maxWidth: 120 }}>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${xpProgress2(currentUser.xp || 0) * 100}%`, background: gL(currentUser.xp || 0).color || C.gold, borderRadius: 3 }} /></div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>{getNextLevel(currentUser.xp || 0).min - (currentUser.xp || 0)} XP → {getNextLevel(currentUser.xp || 0).name}</div>
                  </div>}
                </div>
              </div>
            </div>
            {/* Pinned Bulletins */}
            {bulletins.filter(b => b.pinned).length > 0 && (
              <div style={{ ...card, background: `${C.gold}04`, border: `1px solid ${C.gold}22`, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>📢 BẢNG TIN</div>
                  <button onClick={() => setScreen("emp_bulletins")} style={{ fontSize: 10, color: C.gold, background: "none", border: "none" }}>Xem tất cả →</button>
                </div>
                {bulletins.filter(b => b.pinned).slice(0, 2).map(b => (
                  <div key={b.id} onClick={() => setScreen("emp_bulletins")} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, background: "rgba(255,255,255,0.03)", cursor: "pointer", borderLeft: `3px solid ${b.type === "policy" ? C.red : b.type === "news" ? C.blue : C.gold}` }}>
                    <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{b.type === "policy" ? "📋" : b.type === "news" ? "📰" : "📢"} {b.title}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2 }}>{b.content.slice(0, 80)}...</div>
                  </div>
                ))}
              </div>
            )}
            {/* Notifications */}
            {notifications.filter(n => n.empId === currentUser.id && !n.read).length > 0 && (
              <div style={{ ...card, background: `${C.orange}08`, border: `1px solid ${C.orange}22` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: C.orange, fontWeight: 700 }}>🔔 THÔNG BÁO MỚI ({notifications.filter(n => n.empId === currentUser.id && !n.read).length})</div>
                  <button onClick={() => { updNotifications(notifications.map(n => n.empId === currentUser.id ? { ...n, read: true } : n)); }} style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", background: "none", border: "none", padding: "2px 6px" }}>Đã đọc tất cả</button>
                </div>
                {notifications.filter(n => n.empId === currentUser.id && !n.read).slice(-5).reverse().map(n => (
                  <div key={n.id} onClick={() => {
                    updNotifications(notifications.map(x => x.id === n.id ? { ...x, read: true } : x));
                    if (n.msg.includes("Thử thách")) { setScreen("emp_challenges"); setSubScreen(null); }
                    else if (n.msg.includes("tuyên dương")) { }
                  }} style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", padding: "6px 8px", marginBottom: 2, borderRadius: 6, background: "rgba(255,255,255,0.03)", cursor: n.msg.includes("Thử thách") ? "pointer" : "default", display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ flexShrink: 0 }}>{n.msg.includes("Thử thách") ? "🎯" : n.msg.includes("tuyên dương") ? "🎖️" : "📢"}</span>
                    <span style={{ flex: 1 }}>{n.msg}</span>
                    {n.msg.includes("Thử thách") && <span style={{ fontSize: 10, color: C.gold }}>Xem →</span>}
                  </div>
                ))}
              </div>
            )}
            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
              {[
                { i: "📚", t: "Học Kiến Thức", d: `${knowledge.filter(k => visibleToDept(k, (currentUser || {}).dept)).length} bài`, s: "emp_knowledge" },
                { i: "✏️", t: "Làm Kiểm Tra", d: `${quizzes.filter(q => visibleToDept(q, (currentUser || {}).dept)).length} đề`, s: "emp_quizzes" },
                { i: "📊", t: "Kết Quả", d: `${results.filter(r => r.empId === currentUser.id).length} lượt`, s: "emp_results" },
                { i: "🏆", t: "Xếp Hạng", d: "Toàn công ty", s: "emp_ranking" },
                { i: "🎖️", t: "Huy Hiệu", d: `${getUserBadges(currentUser).length}/${BADGES.length}`, s: "emp_badges" },
                { i: "🎯", t: "Thử Thách", d: `${challenges.filter(ch => challengeVisibleTo(ch, currentUser)).length} thử thách`, s: "emp_challenges" },
                { i: "📋", t: "Lộ Trình", d: `${paths.filter(p => (p.assignedTo || []).includes(currentUser.id)).length} lộ trình`, s: "emp_pathway" },
                { i: "📢", t: "Bảng Tin", d: `${bulletins.length} bài đăng`, s: "emp_bulletins" },
                ...(currentUser.accRole === "director" ? [
                  { i: "📢", t: "Tạo Bảng Tin", d: "Đăng thông báo/chính sách", s: "dir_bulletins" },
                ] : []),
                { i: "🧠", t: "Năng Lực", d: "Đánh giá & cải thiện", s: "emp_competency" },
                { i: "🔑", t: "Đổi Mật Khẩu", d: "Cập nhật bảo mật", s: "emp_changepw" },
                ...(currentUser.accRole === "manager" || currentUser.accRole === "director" ? [
                  { i: currentUser.accRole === "director" ? "🎩" : "👥", t: currentUser.accRole === "director" ? "Quản Lý Nhân Sự" : "Team Của Tôi", d: currentUser.accRole === "director" ? "Xem toàn bộ nhân sự" : "Quản lý nhân viên cấp dưới", s: "mgr_team" },
                ] : []),
              ].map((c, i) => (
                <button key={i} onClick={() => setScreen(c.s)} style={{ background: "rgba(12,123,111,0.07)", borderRadius: 14, padding: "18px 14px", border: `1px solid rgba(12,123,111,0.2)`, textAlign: "left", width: "100%" }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{c.i}</div><div style={{ fontFamily: "'Be Vietnam Pro',sans-serif", fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 2 }}>{c.t}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{c.d}</div>
                </button>
              ))}
            </div>

            {/* Competency quick view + suggestions */}
            {(() => {
              const myR = results.filter(r => r.empId === currentUser.id);
              const myK = knowledge.filter(k => visibleToDept(k, currentUser.dept));
              const scores = evalCompetency(myR, currentUser.streak || 0, (currentUser.readLessons || []).length, myK.length);
              const improvements = getImprovements(scores, (currentUser || {}).dept);
              const avgScore = Object.values(scores).length > 0 ? Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length) : 0;
              return improvements.length > 0 ? (
                <div style={{ ...card, marginTop: 10, background: `${C.orange}06`, border: `1px solid ${C.orange}22` }}>
                  <div style={{ fontSize: 12, color: C.orange, fontWeight: 700, marginBottom: 8 }}>{"💡 ĐỀ XUẤT CẢI THIỆN (Năng lực TB: " + avgScore + "%)"}</div>
                  {improvements.map((s, i) => (
                    <div key={i} style={{ padding: "6px 0", borderBottom: i < improvements.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: s.priority === "Cao" ? `${C.red}22` : `${C.orange}22`, color: s.priority === "Cao" ? C.red : C.orange, fontWeight: 700, flexShrink: 0 }}>{s.priority}</span>
                      <div><div style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{s.comp}</div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{s.action}</div></div>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
            {/* My Rewards */}
            {(() => {
              const myRewards = challenges.filter(ch => (ch.completedBy || []).includes(currentUser.id) && ch.wonRewards && ch.wonRewards[currentUser.id]);
              if (myRewards.length === 0) return null;
              return (
                <div style={{ ...card, marginTop: 10, background: `${C.purple}06`, border: `1px solid ${C.purple}22` }}>
                  <div style={{ fontSize: 12, color: C.purple, fontWeight: 700, marginBottom: 8 }}>🎁 PHẦN THƯỞNG ĐÃ NHẬN ({myRewards.length})</div>
                  {myRewards.map(ch => {
                    const delivered = (ch.delivered || {})[currentUser.id]; return (
                      <div key={ch.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 18 }}>{delivered ? "✅" : "🎁"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ color: C.purple, fontWeight: 700, fontSize: 13 }}>{ch.wonRewards[currentUser.id]}</span>{delivered ? <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${C.green}22`, color: C.green, fontWeight: 700 }}>Đã nhận</span> : <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${C.orange}22`, color: C.orange }}>Chờ trao</span>}</div>
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>Thử thách: {ch.title} · Tạo bởi {ch.createdByName || "Admin"}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>{"Đã nhận = người tạo đã trao thưởng · Chờ trao = liên hệ người tạo"}</div>
                </div>
              );
            })()}
            {/* Recognitions */}
            {recognitions.filter(r => r.empId === currentUser.id).length > 0 && (
              <div style={{ ...card, marginTop: 10 }}>
                <div style={{ fontSize: 12, color: C.goldL, fontWeight: 700, marginBottom: 8 }}>🎖️ TUYÊN DƯƠNG</div>
                {recognitions.filter(r => r.empId === currentUser.id).slice(-3).reverse().map(r => (
                  <div key={r.id} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", padding: "4px 0" }}>{r.type === "excellent" ? "🏆" : r.type === "improved" ? "📈" : "⭐"} {r.message} · {fmtDate(r.createdAt)}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ EMPLOYEE: KNOWLEDGE ═══ */}
        {role === "employee" && screen === "emp_knowledge" && !subScreen && currentUser && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={hd(22)}>{"📚 Kiến Thức"}</h2><button onClick={function () { setScreen("emp_home") }} style={btnO}>{"← Dashboard"}</button></div>
            {knowledge.filter(function (k) { return visibleToDept(k, currentUser.dept) }).map(function (k) {
              var isRead = (currentUser.readLessons || []).includes(k.id);
              return (
                <div key={k.id} style={{ ...card, cursor: "pointer", border: "1px solid " + (isRead ? C.green + "33" : C.border) }} onClick={function () {
                  if (!isRead) { var u = Object.assign({}, currentUser, { readLessons: [].concat(currentUser.readLessons || [], [k.id]) }); setCurrentUser(u); updAccounts(accounts.map(function (a) { return a.id === u.id ? u : a })); }
                  setSubScreen(k.id); setFormData(Object.assign({}, formData, { learnTab: null }));
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: C.white, fontWeight: 700, fontSize: 14, flex: 1 }}>{k.title}</span>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {isRead && tag("✓ Đã đọc", C.green)}
                      {k.interactive && tag("🎴 Tương tác", C.teal)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                    {(k.depts || ["Tất cả"]).map(function (d) { return <span key={d}>{tag(d, d === "Tất cả" ? C.green : C.blue)}</span> })}
                    {k.hasPdf && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 4, background: C.purple + "22", color: C.purple, fontWeight: 600 }}>{"📄 " + (k.pdfName || "PDF")}</span>}
                    {k.videoUrl && tag("🎬 Video", C.red)}
                    {k.audioUrl && tag("🎧 Nghe", "#9b59b6")}
                    {k.docUrl && tag("🔗 Link", C.blue)}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{(k.content || "").slice(0, 100) || "Chưa có nội dung"}</div>
                </div>
              );
            })}
            {knowledge.filter(function (k) { return visibleToDept(k, currentUser.dept) }).length === 0 && <Empty msg={"Chưa có bài nào."} />}
          </div>
        )}

        {/* ═══ EMPLOYEE: KNOWLEDGE DETAIL — IMMERSIVE LEARNING ═══ */}
        {role === "employee" && screen === "emp_knowledge" && subScreen && (() => {
          const k = knowledge.find(x => x.id === subScreen); if (!k) return null;
          const it = k.interactive;
          const tab = formData.learnTab || null;
          const cIdx = formData.cardIdx || 0;
          const cFlip = formData.cardFlip || false;
          const sIdx = formData.slideIdx || 0;
          const mAns = formData.miniQAns || {};
          const exitLearn = () => setFormData({ ...formData, learnTab: null, cardIdx: 0, cardFlip: false, slideIdx: 0, miniQAns: {} });
          const exitAll = () => { if (formData._returnAdmin) { var rid = formData._returnAdmin; setRole("admin"); setScreen("admin_lessons"); setSubScreen(rid); setFormData({ ...formData, learnTab: null, _returnAdmin: null }); } else { setSubScreen(null); setFormData({ ...formData, learnTab: null, cardIdx: 0, cardFlip: false, slideIdx: 0, miniQAns: {}, loadedPdf: null }); } };

          // ── FULLSCREEN LEARNING MODE ──
          if (tab && it) {
            const fs = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: "#0f2d3a", display: "flex", flexDirection: "column", overflow: "hidden", paddingBottom: "env(safe-area-inset-bottom,0px)" };
            const fsHead = { padding: "6px 8px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid " + C.border, flexShrink: 0 };
            const fsBody = { flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column" };
            const fsNav = { padding: "12px 16px", display: "flex", gap: 8, justifyContent: "center", alignItems: "center", borderTop: `1px solid ${C.border}`, flexShrink: 0 };
            const tabBtn = (id, icon, label) => <button key={id} onClick={() => setFormData({ ...formData, learnTab: id, cardIdx: 0, cardFlip: false, slideIdx: 0, miniQAns: {} })} style={{ padding: "8px 12px", borderRadius: 8, fontSize: 11, whiteSpace: "nowrap", minHeight: 36, fontWeight: 700, background: tab === id ? `${C.gold}22` : "rgba(255,255,255,0.04)", color: tab === id ? C.goldL : "rgba(255,255,255,0.3)", border: `1px solid ${tab === id ? C.gold + "44" : C.border}` }}>{icon} {label}</button>;

            return (
              <div style={fs}>
                {/* Fullscreen header */}
                <div style={fsHead}>
                  <div style={{ display: "flex", gap: 3, flex: 1, overflowX: "scroll", WebkitOverflowScrolling: "touch", paddingBottom: 2, msOverflowStyle: "none" }}>{tabBtn("docs", "📄", "Tài liệu")}{tabBtn("slides", "📊", "Slides")}{tabBtn("audio", "🔊", "Nghe")}{tabBtn("video", "🎬", "Video")}<div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)", margin: "0 2px", flexShrink: 0 }} />{tabBtn("cards", "🎴", "Cards")}{tabBtn("sheet", "📋", "Sheet")}{tabBtn("quiz", "✏️", "Quiz")}{tabBtn("info", "🖼️", "Ảnh")}{tabBtn("mind", "🧠", "Sơ đồ")}</div>
                  <button onClick={exitLearn} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", fontSize: 18, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>

                {/* ── SLIDES FULLSCREEN ── */}
                {tab === "slides" && it.slides && (() => {
                  const sl = it.slides; const s = sl[sIdx] || sl[0]; if (!s) return null;
                  return (<React.Fragment>
                    <div style={{ ...fsBody, justifyContent: "center", alignItems: "center", padding: "24px" }}>
                      <div style={{ width: "100%", maxWidth: "min(560px, 100%)" }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", marginBottom: 16 }}>SLIDE {sIdx + 1} / {sl.length}</div>
                        <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>{s.icon || "📌"}</div>
                        <h2 style={{ ...hd(24), textAlign: "center", marginBottom: 24 }}>{s.title}</h2>
                        {(s.points || []).map((p, j) => (
                          <div key={j} style={{ display: "flex", gap: 14, padding: "10px 0", alignItems: "flex-start", animation: `fadeIn .4s ${j * 0.1}s both` }}>
                            <div style={{ width: 32, height: 32, borderRadius: 9, background: `${C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: C.gold, flexShrink: 0 }}>{j + 1}</div>
                            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 16, lineHeight: 1.7 }}>{p}</span>
                          </div>
                        ))}
                        {s.highlight && <div style={{ marginTop: 20, padding: "14px 20px", borderRadius: 12, background: `${C.gold}12`, borderLeft: `4px solid ${C.gold}`, textAlign: "center" }}><span style={{ color: C.goldL, fontSize: 15, fontWeight: 700 }}>💡 {s.highlight}</span></div>}
                      </div>
                    </div>
                    <div style={fsNav}>
                      <button onClick={() => setFormData({ ...formData, slideIdx: Math.max(0, sIdx - 1) })} disabled={sIdx === 0} style={{ ...btnO, opacity: sIdx === 0 ? 0.3 : 1, padding: "14px 24px", fontSize: 14, minHeight: 48 }}>← Trước</button>
                      <div style={{ display: "flex", gap: 4, alignItems: "center", margin: "0 12px" }}>{sl.map((_, i) => <div key={i} style={{ width: i === sIdx ? 20 : 7, height: 7, borderRadius: 4, background: i === sIdx ? C.gold : i < sIdx ? `${C.gold}66` : "rgba(255,255,255,0.12)", transition: "all .3s" }} />)}</div>
                      {sIdx < sl.length - 1 ? <button onClick={() => setFormData({ ...formData, slideIdx: sIdx + 1 })} style={{ ...btnG, padding: "14px 24px", fontSize: 14, minHeight: 48 }}>Tiếp →</button> : <button onClick={() => setFormData({ ...formData, learnTab: "cards", cardIdx: 0, cardFlip: false })} style={{ ...btnG, padding: "12px 24px", fontSize: 14 }}>🎴 Flashcards →</button>}
                    </div>
                  </React.Fragment>);
                })()}

                {/* ── FLASHCARDS FULLSCREEN ── */}
                {tab === "cards" && it.flashcards && (() => {
                  const fc = it.flashcards; const c = fc[cIdx] || fc[0]; if (!c) return null;
                  return (<React.Fragment>
                    <div style={{ ...fsBody, justifyContent: "center", alignItems: "center", padding: "24px" }} onClick={() => setFormData({ ...formData, cardFlip: !cFlip })}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 12 }}>THẺ {cIdx + 1} / {fc.length} · Bấm để lật</div>
                      <div style={{ width: "100%", maxWidth: "min(420px, 100%)", minHeight: 280, borderRadius: 20, padding: "36px 28px", background: cFlip ? `linear-gradient(160deg,#0d3d2d,#0a2620)` : `linear-gradient(160deg,#1a2d40,#0f1f2e)`, border: `2px solid ${cFlip ? C.green + "55" : C.gold + "44"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", cursor: "pointer", transition: "all .4s", boxShadow: cFlip ? "0 0 40px rgba(46,204,113,0.1)" : "0 0 40px rgba(197,153,62,0.1)" }}>
                        <div style={{ fontSize: 12, padding: "3px 12px", borderRadius: 20, background: cFlip ? `${C.green}22` : `${C.gold}22`, color: cFlip ? C.green : C.gold, fontWeight: 700, marginBottom: 16 }}>{cFlip ? "ĐÁP ÁN" : "CÂU HỎI"}</div>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>{cFlip ? "✅" : c.icon || "❓"}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.white, lineHeight: 1.6, maxWidth: 340 }}>{cFlip ? c.back : c.front}</div>
                      </div>
                    </div>
                    <div style={fsNav}>
                      <button onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, cardIdx: Math.max(0, cIdx - 1), cardFlip: false }); }} disabled={cIdx === 0} style={{ ...btnO, opacity: cIdx === 0 ? 0.3 : 1, padding: "14px 24px", fontSize: 14, minHeight: 48 }}>← Trước</button>
                      <div style={{ display: "flex", gap: 3, margin: "0 8px" }}>{fc.map((_, i) => <div key={i} style={{ width: i === cIdx ? 14 : 5, height: 5, borderRadius: 3, background: i === cIdx ? C.gold : i < cIdx ? `${C.gold}66` : "rgba(255,255,255,0.1)" }} />)}</div>
                      {cIdx < fc.length - 1 ? <button onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, cardIdx: cIdx + 1, cardFlip: false }); }} style={{ ...btnG, padding: "14px 24px", fontSize: 14, minHeight: 48 }}>Tiếp →</button> : <button onClick={(e) => { e.stopPropagation(); setFormData({ ...formData, learnTab: "sheet" }); }} style={{ ...btnG, padding: "12px 24px", fontSize: 14 }}>📋 Cheat Sheet →</button>}
                    </div>
                  </React.Fragment>);
                })()}

                {/* ── CHEAT SHEET FULLSCREEN ── */}
                {tab === "sheet" && it.cheatsheet && (
                  <div style={fsBody}>
                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                      <h2 style={{ ...hd(22) }}>{it.cheatsheet.title || "Tóm tắt kiến thức"}</h2>
                    </div>
                    <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.gold}22` }}>
                      {(it.cheatsheet.rows || []).map((r, i) => (
                        <div key={i} style={{ display: "flex", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "rgba(197,153,62,0.04)" : "transparent" }}>
                          <div style={{ width: "38%", color: C.goldL, fontSize: 14, fontWeight: 700, paddingRight: 14 }}>{r.label}</div>
                          <div style={{ flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.6 }}>{r.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: "center", marginTop: 20 }}>
                      <button onClick={() => setFormData({ ...formData, learnTab: "quiz", miniQAns: {} })} style={{ ...btnG, padding: "14px 28px", fontSize: 14 }}>✏️ Kiểm tra kiến thức →</button>
                    </div>
                  </div>
                )}

                {/* ── QUIZ FULLSCREEN ── */}
                {tab === "quiz" && it.miniQuiz && (
                  <div style={fsBody}>
                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", letterSpacing: 2 }}>KIỂM TRA NHANH</div>
                      <h2 style={{ ...hd(20), marginTop: 4 }}>{Object.keys(mAns).length}/{it.miniQuiz.length} câu đã trả lời</h2>
                    </div>
                    {it.miniQuiz.map((q, qi) => {
                      const ans = mAns[qi]; const correct = ans === Number(q.ans); return (
                        <div key={qi} style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 10, background: ans !== undefined ? (correct ? `${C.green}06` : `${C.red}06`) : "rgba(255,255,255,0.02)", border: `1px solid ${ans !== undefined ? (correct ? C.green + "33" : C.red + "33") : C.border}` }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: ans !== undefined ? (correct ? `${C.green}22` : `${C.red}22`) : `${C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: ans !== undefined ? (correct ? C.green : C.red) : C.gold, flexShrink: 0 }}>{qi + 1}</div>
                            <span style={{ color: C.white, fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{q.q}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingLeft: 40 }}>
                            {(q.opts || []).map((opt, oi) => {
                              const isSel = ans === oi; const isRight = oi === Number(q.ans);
                              let bg = "rgba(255,255,255,0.04)", col = "rgba(255,255,255,0.7)", brd2 = C.border;
                              if (ans !== undefined && isRight) { bg = `${C.green}18`; col = C.green; brd2 = C.green + "55"; }
                              else if (isSel && !isRight) { bg = `${C.red}18`; col = C.red; brd2 = C.red + "55"; }
                              return <button key={oi} onClick={() => { if (ans !== undefined) return; setFormData({ ...formData, miniQAns: { ...mAns, [qi]: oi } }); }} style={{ padding: "12px 14px", borderRadius: 10, background: bg, color: col, fontSize: 14, textAlign: "left", border: `2px solid ${brd2}`, fontWeight: isSel || (ans !== undefined && isRight) ? 700 : 400 }}>
                                {ans !== undefined && isRight ? "✓ " : ""}{ans !== undefined && isSel && !isRight ? "✗ " : ""}{opt}
                              </button>;
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {Object.keys(mAns).length === it.miniQuiz.length && (
                      <div style={{ textAlign: "center", padding: 24, borderRadius: 14, background: `${C.gold}08`, border: `1px solid ${C.gold}22`, marginTop: 8 }}>
                        <div style={{ fontSize: 36, fontWeight: 900, color: C.gold, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{Object.entries(mAns).filter(([qi, a]) => a === it.miniQuiz[+qi].ans).length}/{it.miniQuiz.length}</div>
                        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>câu trả lời đúng</div>
                        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                          <button onClick={() => setFormData({ ...formData, miniQAns: {} })} style={btnO}>🔄 Làm lại</button>
                          <button onClick={exitLearn} style={btnG}>✅ Hoàn thành</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TÀI LIỆU GỐC ── */}
                {tab === "docs" && (
                  <div style={{ ...fsBody, padding: "24px 20px", overflowY: "auto" }}>
                    <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>

                      {/* Hero */}
                      <div style={{ textAlign: "center", paddingBottom: 28 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg," + C.teal + "33," + C.gold + "18)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 12, border: "1px solid " + C.gold + "22" }}>{"📚"}</div>
                        <h3 style={{ ...hd(20), marginBottom: 6 }}>{k.title}</h3>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{(k.depts || ["Tất cả"]).join(" · ")}</div>
                        {k.hasPdf && k.pdfName && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "5px 14px", borderRadius: 20, background: C.purple + "18", border: "1px solid " + C.purple + "33" }}>
                            <span style={{ fontSize: 13 }}>📄</span>
                            <span style={{ fontSize: 12, color: C.purple, fontWeight: 600 }}>{k.pdfName}</span>
                          </div>
                        )}
                      </div>

                      {/* Resource rows */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                        {k.hasPdf && (
                          <button onClick={async function () {
                            setFormData(Object.assign({}, formData, { docMsg: "⏳ Đang tải..." }));
                            var cached = _pdfCache[k.id];
                            if (cached) { var a = document.createElement("a"); a.href = cached; a.download = (k.pdfName || k.title + ".pdf"); document.body.appendChild(a); a.click(); document.body.removeChild(a); setFormData(Object.assign({}, formData, { docMsg: "✅ Đã tải xuống" })); return; }
                            var { data: blob, error: dlErr } = await supabase.storage.from('pdfs').download('knowledge/' + k.id + '.pdf');
                            if (dlErr || !blob) { setFormData(Object.assign({}, formData, { docMsg: "❌ Chưa có PDF. Admin cần tải lên trước." })); return; }
                            var blobUrl = URL.createObjectURL(blob);
                            var a2 = document.createElement("a"); a2.href = blobUrl; a2.download = (k.pdfName || k.title + ".pdf"); document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
                            setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 3000);
                            setFormData(Object.assign({}, formData, { docMsg: "✅ Đã tải xuống" }));
                          }} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 14, background: "linear-gradient(135deg," + C.purple + "18," + C.purple + "08)", border: "1px solid " + C.purple + "33", textAlign: "left", cursor: "pointer", width: "100%" }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.purple + "25", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{"⬇️"}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: C.purple, marginBottom: 3 }}>{"Tải PDF về máy"}</div>
                              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.pdfName || k.title + ".pdf"}</div>
                            </div>
                            <div style={{ fontSize: 11, color: C.purple + "99", fontWeight: 600, flexShrink: 0 }}>{"↓ Lưu"}</div>
                          </button>
                        )}
                        {k.hasPdf && (
                          <button onClick={async function () {
                            setFormData(Object.assign({}, formData, { docMsg: "⏳ Đang mở..." }));
                            var cached = _pdfCache[k.id];
                            if (cached) { var byteStr = atob(cached.split(',')[1]); var bytes = new Uint8Array(byteStr.length); for (var i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i); var viewBlob = new Blob([bytes], { type: 'application/pdf' }); var viewUrl = URL.createObjectURL(viewBlob); window.open(viewUrl, '_blank'); setTimeout(function () { URL.revokeObjectURL(viewUrl); }, 10000); setFormData(Object.assign({}, formData, { docMsg: "" })); return; }
                            var { data: signedData, error: signErr } = await supabase.storage.from('pdfs').createSignedUrl('knowledge/' + k.id + '.pdf', 300);
                            if (signErr || !signedData) { setFormData(Object.assign({}, formData, { docMsg: "❌ Không mở được PDF." })); return; }
                            window.open(signedData.signedUrl, "_blank");
                            setFormData(Object.assign({}, formData, { docMsg: "" }));
                          }} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 14, background: "linear-gradient(135deg," + C.teal + "18," + C.teal + "08)", border: "1px solid " + C.teal + "33", textAlign: "left", cursor: "pointer", width: "100%" }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.teal + "25", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{"👁️"}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 3 }}>{"Xem PDF trực tiếp"}</div>
                              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.pdfName || k.title + ".pdf"}</div>
                            </div>
                            <div style={{ fontSize: 11, color: C.teal + "99", fontWeight: 600, flexShrink: 0 }}>{"↗ Mở"}</div>
                          </button>
                        )}
                        {k.docUrl && (
                          <a href={k.docUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 14, background: "linear-gradient(135deg," + C.blue + "18," + C.blue + "08)", border: "1px solid " + C.blue + "33", textDecoration: "none", width: "100%" }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.blue + "25", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{"🔗"}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: C.blue, marginBottom: 3 }}>{"Tài liệu gốc"}</div>
                              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(function(){ try { return new URL(k.docUrl).hostname.replace("www.", ""); } catch(e) { return k.docUrl.replace(/https?:\/\//, "").slice(0, 50); } })()}</div>
                            </div>
                            <div style={{ fontSize: 11, color: C.blue + "99", fontWeight: 600, flexShrink: 0 }}>{"↗ Mở"}</div>
                          </a>
                        )}
                      </div>

                      {formData.docMsg && (
                        <div style={{ textAlign: "center", fontSize: 12, padding: "10px 16px", borderRadius: 10, background: formData.docMsg.startsWith("✅") ? C.green + "15" : formData.docMsg.startsWith("❌") ? C.red + "15" : C.gold + "15", color: formData.docMsg.startsWith("✅") ? C.green : formData.docMsg.startsWith("❌") ? C.red : C.gold, marginBottom: 12 }}>{formData.docMsg}</div>
                      )}

                      {/* Text content toggle */}
                      {k.content && (
                        <div style={{ marginTop: 4 }}>
                          <button onClick={function () { setFormData(Object.assign({}, formData, { showRawDoc: !formData.showRawDoc })) }} style={{ width: "100%", padding: "14px 16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid " + C.border, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                            {formData.showRawDoc ? "▲ Thu gọn nội dung" : "📝 Xem nội dung text (" + (k.content || "").length + " ký tự)"}
                          </button>
                          {formData.showRawDoc && (
                            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", maxHeight: 420, overflow: "auto", padding: 16, background: "rgba(0,0,0,0.25)", borderRadius: "0 0 10px 10px", marginTop: -1 }}>{k.content}</div>
                          )}
                        </div>
                      )}

                      {!k.hasPdf && !k.docUrl && !k.content && (
                        <div style={{ textAlign: "center", padding: "48px 24px", color: "rgba(255,255,255,0.25)" }}>
                          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                          <div style={{ fontSize: 13 }}>{"Chưa có tài liệu đính kèm."}</div>
                          <div style={{ fontSize: 11, marginTop: 4, color: "rgba(255,255,255,0.15)" }}>{"Admin thêm PDF hoặc link trong phần Quản lý bài học."}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── AUDIO / NGHE ── */}
                {tab === "audio" && (function () {
                  var aUrl = k.audioUrl || "";
                  var isDirect = !!aUrl && !/youtu/.test(aUrl);
                  var isYT = /youtu/.test(aUrl);
                  return (
                    <div style={{ ...fsBody, padding: 16 }}>
                      {/* Direct audio player — works on hosting */}
                      {isDirect && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ background: "linear-gradient(135deg,rgba(155,89,182,0.1),rgba(197,153,62,0.05))", borderRadius: 16, padding: 20, textAlign: "center", border: "1px solid rgba(155,89,182,0.15)" }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>{"🎧"}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.purple, marginBottom: 16 }}>{"Nghe Bài Học"}</div>
                            <audio controls preload="metadata" style={{ width: "100%", maxWidth: 400, margin: "0 auto", display: "block" }} src={aUrl}>
                              <source src={aUrl} type="audio/mpeg" />
                            </audio>
                            <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{"⚠ Player hoạt động trên hosting. Nếu không nghe được, dùng link bên dưới."}</div>
                          </div>
                        </div>
                      )}

                      {/* YouTube audio (video as audio) */}
                      {isYT && (function () {
                        var m = aUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/); var ytId = m ? m[1] : "";
                        return ytId ? (
                          <div style={{ marginBottom: 16, maxWidth: "min(800px, 100%)", margin: "0 auto 16px" }}>
                            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", background: "#000", borderRadius: 12, maxHeight: "60vh" }}>
                              <iframe src={"https://www.youtube.com/embed/" + ytId + "?rel=0"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} allow="accelerometer; autoplay; encrypted-media" allowFullScreen title="audio" />
                            </div>
                          </div>
                        ) : null;
                      })()}

                      {/* Fallback link */}
                      {aUrl && (
                        <a href={aUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(155,89,182,0.06)", border: "1px solid rgba(155,89,182,0.15)", textDecoration: "none" }}>
                          <span style={{ fontSize: 18 }}>{"🔗"}</span>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.purple }}>{"Mở audio trong tab mới"}</div>
                        </a>
                      )}

                      {!aUrl && (
                        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)" }}>
                          <div style={{ fontSize: 28, marginBottom: 6 }}>{"🎧"}</div>
                          <div style={{ fontSize: 12 }}>{"Admin thêm link audio trong Bài học"}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── VIDEO ── */}
                {tab === "video" && (function () {
                  var vUrl = k.videoUrl || "";
                  var isYT = /youtu/.test(vUrl);
                  var ytId = "";
                  if (isYT) { var m = vUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/); if (m) ytId = m[1] }
                  var isDirect = !isYT && !!vUrl;
                  return (
                    <div style={{ ...fsBody, padding: 0, alignItems: "center" }}>
                      {/* YouTube embed — works on hosting, blocked in artifact */}
                      {isYT && ytId && (
                        <div style={{ width: "100%", maxWidth: "min(1100px, 100%)", margin: "0 auto" }}>
                          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", background: "#000", borderRadius: 0, maxHeight: "75vh" }}>
                            <iframe src={"https://www.youtube.com/embed/" + ytId + "?rel=0&modestbranding=1"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="video" />
                          </div>
                          <div style={{ padding: "8px 12px", fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>{"⚠ Nếu không hiện: mở link bên dưới"}</div>
                        </div>
                      )}

                      {/* Direct video — works on hosting with MP4/WebM */}
                      {isDirect && (
                        <div style={{ width: "100%", maxWidth: "min(1100px, 100%)", margin: "0 auto", background: "#000" }}>
                          <video controls playsInline preload="metadata" style={{ width: "100%", maxHeight: "75vh", display: "block", margin: "0 auto" }} src={vUrl}>
                            <source src={vUrl} type="video/mp4" />
                          </video>
                        </div>
                      )}

                      {/* Fallback link */}
                      {vUrl && (
                        <div style={{ padding: "10px 16px", width: "100%", maxWidth: "min(1100px, 100%)", margin: "0 auto" }}>
                          <a href={vUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: isYT ? "rgba(255,0,0,0.06)" : "rgba(12,123,111,0.06)", border: "1px solid " + (isYT ? "rgba(255,0,0,0.15)" : "rgba(12,123,111,0.15)"), textDecoration: "none" }}>
                            {isYT ? <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#ff0000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "9px solid #fff", marginLeft: 2 }} /></div> : <span style={{ fontSize: 16 }}>{"🔗"}</span>}
                            <div style={{ fontSize: 12, fontWeight: 600, color: isYT ? "#ff4444" : C.teal }}>{"Mở " + (isYT ? "YouTube" : "video") + " trong tab mới"}</div>
                          </a>
                        </div>
                      )}

                      {!vUrl && (
                        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)" }}>
                          <div style={{ fontSize: 28, marginBottom: 6 }}>{"🎬"}</div>
                          <div style={{ fontSize: 12 }}>{"Admin thêm link video trong Bài học"}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── INFOGRAPHIC / ẢNH ── */}
                {tab === "info" && (
                  <div style={{ ...fsBody, padding: 16, alignItems: "center" }}>
                    <div style={{ textAlign: "center", marginBottom: 14, width: "100%" }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>{"🖼️"}</div>
                      <h3 style={{ ...hd(16), marginBottom: 4 }}>{"Bản đồ thông tin"}</h3>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{"Ảnh đồ họa từ link tải lên"}</div>
                    </div>
                    {k.images && k.images.length > 0 ? (
                      <div style={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
                        {k.images.map(function (imgUrl, imgIdx) {
                          return (
                            <div key={imgIdx} style={{ marginBottom: 12, borderRadius: 12, overflow: "hidden", border: "1px solid " + C.border, background: "rgba(255,255,255,0.02)" }}>
                              <img src={toDriveImageUrl(imgUrl)} alt={"Ảnh " + (imgIdx + 1)} style={{ width: "100%", height: "auto", display: "block", maxHeight: "80vh", objectFit: "contain" }} onError={function (e2) { e2.target.style.display = "none" }} />
                            </div>
                          )
                        })}
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>{k.images.length + " ảnh"}</div>
                      </div>
                    ) : (
                      <div style={{ ...card, padding: 24, textAlign: "center", width: "100%", maxWidth: 400 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>{"🖼️"}</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 8 }}>{"Chưa có ảnh đồ họa."}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{"Admin thêm URL ảnh trong Bài học → 🖼️ Ảnh"}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── MIND MAP / SƠ ĐỒ TƯ DUY ── */}
                {tab === "mind" && (
                  <div style={{ ...fsBody, padding: 8 }}>
                    {/* Center */}
                    <div style={{ textAlign: "center", marginBottom: 4 }}>
                      <div style={{ display: "inline-block", background: "linear-gradient(135deg," + C.teal + "," + C.tealD + ")", color: C.white, padding: "12px 20px", borderRadius: 50, fontSize: 14, fontWeight: 800, boxShadow: "0 4px 16px rgba(12,123,111,0.3)" }}>{k.title}</div>
                    </div>
                    {it.slides && it.slides.map(function (s, si) {
                      var colors = [C.teal, C.gold, C.purple, C.blue, C.green, C.orange];
                      var clr = colors[si % colors.length];
                      var isLeft = si % 2 === 0;
                      return (
                        <div key={si} style={{ display: "flex", alignItems: isLeft ? "flex-start" : "flex-end", flexDirection: "column" }}>
                          <div style={{ width: 2, height: 16, background: clr + "44", margin: isLeft ? "0 0 0 40%" : "0 40% 0 0" }} />
                          <div style={{ width: isLeft ? "85%" : "85%", marginLeft: isLeft ? "8%" : "7%", background: clr + "0c", border: "2px solid " + clr + "33", borderRadius: 14, padding: 12, marginBottom: 2 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              <span style={{ fontSize: 18 }}>{s.icon || "📌"}</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color: clr }}>{s.title}</span>
                            </div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {(s.points || []).map(function (p, pi) {
                                return (
                                  <div key={pi} style={{ padding: "5px 10px", borderRadius: 5, background: clr + "10", border: "1px solid " + clr + "15", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{"• " + p.slice(0, 45) + (p.length > 45 ? "..." : "")}</div>
                                )
                              })}
                            </div>
                            {s.highlight && <div style={{ marginTop: 4, fontSize: 10, color: clr, fontWeight: 600 }}>{"💡 " + s.highlight.slice(0, 60)}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                )
              </div>
            );
          }

          // ── NORMAL VIEW (chưa vào học) ──
          return (
            <div style={{ animation: "fadeIn .4s" }}>
              <button onClick={exitAll} style={{ ...btnO, marginBottom: 14 }}>← Quay lại danh sách</button>

              {/* Header */}
              <div style={{ background: `linear-gradient(135deg,${C.dark},#1a4a50)`, borderRadius: 16, padding: "24px 20px", marginBottom: 14, border: `1px solid ${C.gold}33` }}>
                <div style={{ fontSize: 10, color: C.gold, letterSpacing: 3, marginBottom: 6 }}>BÀI HỌC</div>
                <h2 style={{ ...hd(20), marginBottom: 8 }}>{k.title}</h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(k.depts || ["Tất cả"]).map(d => <span key={d}>{tag(d, d === "Tất cả" ? C.green : C.blue)}</span>)}
                </div>
              </div>

              {/* Document links */}


              {/* Learning options */}
              {it ? (
                <div>
                  <div style={{ fontSize: 11, color: C.goldL, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>{"HỌC BÀI"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 6, marginBottom: 12 }}>
                    {[
                      { id: "docs", icon: "📄", t: "Tài liệu", d: k.hasPdf || k.docUrl ? "Có" : "—", extra: {} },
                      { id: "slides", icon: "📊", t: "Slides", d: (it.slides && it.slides.length || 0) + " trang", extra: { slideIdx: 0 } },
                      { id: "audio", icon: "🔊", t: "Nghe", d: k.audioUrl ? "Có" : "—", extra: {} },
                      { id: "video", icon: "🎬", t: "Video", d: k.docUrl ? "Có link" : "—", extra: {} },
                    ].map(function (b) {
                      return <button key={b.id} onClick={function () { setFormData(Object.assign({}, formData, { learnTab: b.id }, b.extra)) }} style={{ padding: "16px 8px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid " + C.border, textAlign: "center" }}>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>{b.icon}</div>
                        <div style={{ color: C.white, fontWeight: 700, fontSize: 12 }}>{b.t}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 2 }}>{b.d}</div>
                      </button>
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: C.goldL, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>{"ÔN BÀI"}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {[
                      { id: "cards", icon: "🎴", t: "Flashcards", d: (it.flashcards && it.flashcards.length || 0) + " thẻ", extra: { cardIdx: 0, cardFlip: false } },
                      { id: "sheet", icon: "📋", t: "Tóm tắt", d: (it.cheatsheet && it.cheatsheet.rows && it.cheatsheet.rows.length || 0) + " mục", extra: {} },
                      { id: "quiz", icon: "✏️", t: "Quiz", d: (it.miniQuiz && it.miniQuiz.length || 0) + " câu", extra: { miniQAns: {} } },
                      { id: "info", icon: "🖼️", t: "Ảnh", d: (k.images && k.images.length || 0) + " ảnh", extra: {} },
                      { id: "mind", icon: "🧠", t: "Sơ đồ", d: "Mind Map", extra: {} },
                    ].map(function (b) {
                      return <button key={b.id} onClick={function () { setFormData(Object.assign({}, formData, { learnTab: b.id }, b.extra)) }} style={{ padding: "16px 8px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid " + C.border, textAlign: "center" }}>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>{b.icon}</div>
                        <div style={{ color: C.white, fontWeight: 700, fontSize: 12 }}>{b.t}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 2 }}>{b.d}</div>
                      </button>
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  {k.content && k.content.length > 20 ? (
                    <div>
                      {parseContentLP(k.content, k.title).map(function (sec, si) {
                        return (
                          <div key={si} style={{ ...card, marginBottom: 8, borderLeft: "3px solid " + (si % 2 === 0 ? C.teal : C.gold), padding: 14 }}>
                            {sec.title && <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ fontSize: 16 }}>{sec.icon}</span><span style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{sec.title}</span></div>}
                            {sec.items.map(function (item, ii) { return <div key={ii} style={{ padding: "3px 0 3px 10px", borderLeft: "2px solid rgba(255,255,255,0.06)", fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{"• " + item}</div> })}
                            {sec.highlight && <div style={{ marginTop: 4, padding: "5px 8px", borderRadius: 5, background: C.gold + "10", fontSize: 11, color: C.goldL, fontStyle: "italic" }}>{"💡 " + sec.highlight}</div>}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ ...card, padding: 24, textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{"📝"}</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{"Chưa có bài học. Admin bấm 🎴 Tạo."}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Go to quiz */}
              <div style={{ textAlign: "center", padding: "16px", marginTop: 12 }}>
                <button onClick={() => { setSubScreen(null); setScreen("emp_quizzes"); }} style={{ ...btnG, fontSize: 13, padding: "12px 28px", background: `linear-gradient(135deg,${C.teal},${C.tealD})` }}>✏️ Làm bài kiểm tra chính thức →</button>
              </div>
            </div>
          );
        })()}

        {/* ═══ EMPLOYEE: REVIEW / ÔN TẬP ═══ */}
        {role === "employee" && screen === "emp_review" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <h2 style={{ ...hd(22), margin: "0 0 4px" }}>{"🎴 Ôn Tập Kiến Thức"}</h2>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{"Flashcards + Tóm tắt từ tất cả bài học"}</div>
            </div>
            {knowledge.filter(function (k4) { return visibleToDept(k4, (currentUser || {}).dept) && k4.interactive }).map(function (k4) {
              var it = k4.interactive;
              var fc = it.flashcards || [];
              var cs = it.cheatsheet;
              var cIdx = formData["rv_" + k4.id + "_idx"] || 0;
              var cFlip = formData["rv_" + k4.id + "_flip"] || false;
              return (
                <div key={k4.id} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.goldL, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 16 }}>{"📗"}</span>{k4.title}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 400 }}>{fc.length + " cards"}</span>
                  </div>
                  {fc.length > 0 && (
                    <div style={{ textAlign: "center", marginBottom: 10 }}>
                      <div onClick={function () { var o = {}; o["rv_" + k4.id + "_flip"] = !cFlip; setFormData(Object.assign({}, formData, o)) }} style={{ ...card, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 20, background: cFlip ? "rgba(12,123,111,0.1)" : "rgba(197,153,62,0.06)", border: "2px solid " + (cFlip ? C.teal + "44" : C.gold + "33") }}>
                        <div>
                          <div style={{ fontSize: 22, marginBottom: 6 }}>{(fc[cIdx] || {}).icon || "❓"}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: cFlip ? C.teal : C.white, lineHeight: 1.5 }}>{cFlip ? (fc[cIdx] || {}).back : (fc[cIdx] || {}).front}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 6 }}>
                        <button onClick={function () { var o = {}; o["rv_" + k4.id + "_idx"] = Math.max(0, cIdx - 1); o["rv_" + k4.id + "_flip"] = false; setFormData(Object.assign({}, formData, o)) }} disabled={cIdx === 0} style={{ ...btnO, padding: "6px 16px", fontSize: 11, opacity: cIdx === 0 ? 0.3 : 1 }}>{"←"}</button>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", padding: "6px 0" }}>{(cIdx + 1) + "/" + fc.length}</span>
                        <button onClick={function () { var o = {}; o["rv_" + k4.id + "_idx"] = Math.min(fc.length - 1, cIdx + 1); o["rv_" + k4.id + "_flip"] = false; setFormData(Object.assign({}, formData, o)) }} disabled={cIdx >= fc.length - 1} style={{ ...btnG, padding: "6px 16px", fontSize: 11, opacity: cIdx >= fc.length - 1 ? 0.3 : 1 }}>{"→"}</button>
                      </div>
                    </div>
                  )}
                  {cs && cs.rows && cs.rows.length > 0 && (
                    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                      {cs.rows.map(function (r, ri) {
                        return (
                          <div key={ri} style={{ display: "flex", borderBottom: ri < cs.rows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            <div style={{ width: "35%", padding: "8px 10px", background: "rgba(255,255,255,0.02)", fontSize: 11, fontWeight: 600, color: C.goldL }}>{r.label}</div>
                            <div style={{ flex: 1, padding: "8px 10px", fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>{r.value}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {knowledge.filter(function (k4) { return visibleToDept(k4, (currentUser || {}).dept) && k4.interactive }).length === 0 && <Empty msg="Chưa có bài học nào để ôn tập." />}
            <div style={{ textAlign: "center", padding: 16 }}>
              <button onClick={function () { setScreen("emp_quizzes") }} style={{ ...btnG, fontSize: 13, padding: "12px 24px" }}>{"✏️ Sẵn sàng? Làm đề thi →"}</button>
            </div>
          </div>
        )}

        {/* ═══ EMPLOYEE: QUIZ LIST ═══ */}
        {role === "employee" && screen === "emp_quizzes" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={hd(22)}>✏️ Kiểm Tra</h2><button onClick={() => setScreen("emp_home")} style={btnO}>← Dashboard</button></div>
            {quizzes.filter(q => visibleToDept(q, (currentUser || {}).dept)).map(q => {
              const myR = results.filter(r => r.empId === currentUser.id && r.quizId === q.id); const last = myR.length > 0 ? myR[myR.length - 1] : null;
              const canTake = !last || daysSince(last.date) >= settings.quizFreq || !last.passed;
              return (
                <div key={q.id} style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>{q.title}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>{q.questions.length} câu · {q.difficulty === "easy" ? "🟢 Dễ" : q.difficulty === "medium" ? "🟡 TB" : q.difficulty === "hard" ? "🟠 Khó" : q.difficulty === "advanced" ? "🔴 NC" : "🟡 TB"}{q.quizType === "mixed" && <span style={{ marginLeft: 5, fontSize: 10, padding: "1px 5px", borderRadius: 3, background: `${C.purple}22`, color: C.purple }}>📝 Kết hợp</span>}{last && <React.Fragment> · Lần gần nhất: <b style={{ color: last.passed ? C.green : C.red }}>{last.pct}%</b></React.Fragment>}</div>
                    {!canTake && <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>⏳ Làm lại sau {settings.quizFreq - daysSince(last.date)} ngày</div>}
                  </div>
                  <button onClick={() => canTake && startQuiz(q)} disabled={!canTake} style={{ ...btnG, opacity: canTake ? 1 : 0.3, padding: "10px 18px", fontSize: 13 }}>{last ? "Làm lại" : "Bắt đầu"}</button>
                </div>
              );
            })}
            {quizzes.filter(q => visibleToDept(q, (currentUser || {}).dept)).length === 0 && <Empty msg="Chưa có đề cho phòng ban của bạn." />}
          </div>
        )}

        {/* ═══ EMPLOYEE: QUIZ PLAY ═══ */}
        {role === "employee" && screen === "emp_quiz_play" && activeQuiz && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Câu <b style={{ color: C.gold }}>{qIdx + 1}</b>/{activeQuiz.questions.length}{activeQuiz.quizType === "mixed" && <span style={{ marginLeft: 8, fontSize: 10, padding: "1px 5px", borderRadius: 3, background: `${C.purple}22`, color: C.purple }}>Kết hợp</span>}</span>
                <button onClick={() => { if (window.confirm("Thoát bài thi? Tiến trình sẽ không được lưu.")) { setScreen("emp_quizzes"); setActiveQuiz(null); setQActive(false); } }} style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>✕ Thoát</button>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: qTimer < 60 ? C.red : qTimer < 180 ? C.orange : C.gold, fontFamily: "monospace", background: "rgba(0,0,0,0.3)", padding: "5px 12px", borderRadius: 8 }}>⏱ {fmtTime(qTimer)}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginBottom: 16, overflow: "hidden" }}><div style={{ height: "100%", width: `${((qIdx + (qShowExp ? 1 : 0)) / activeQuiz.questions.length) * 100}%`, background: `linear-gradient(90deg,${C.teal},${C.greenD})`, borderRadius: 2, transition: "width .4s" }} /></div>
            {activeQuiz.questions[qIdx] && activeQuiz.questions[qIdx].type === "essay" && (
              <div key={qIdx} style={{ animation: "fadeIn .3s" }}>
                <div style={{ ...card, background: C.purple + "06", border: "1px solid " + C.purple + "33" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, padding: "5px 10px", borderRadius: 5, background: C.purple + "22", color: C.purple, fontWeight: 700 }}>{"✍️ TỰ LUẬN"}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>AI sẽ chấm điểm sau khi nộp bài</span>
                  </div>
                  <h3 style={{ ...hd(17), margin: "0 0 16px", lineHeight: 1.5 }}>{activeQuiz.questions[qIdx].q}</h3>
                  {!(qAnswers[qIdx] && qAnswers[qIdx].selected) ? (
                    <div>
                      <textarea value={essayDraft} onChange={function (e) { setEssayDraft(e.target.value) }} placeholder="Nhập câu trả lời..." style={{ ...inp, minHeight: 140, resize: "vertical", lineHeight: 1.7, fontSize: 14, width: "100%", boxSizing: "border-box" }} />
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>{"💡 Hãy trả lời đầy đủ, rõ ràng."}</div>
                    </div>
                  ) : (
                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid " + C.border, color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.6 }}>{qAnswers[qIdx].selected}</div>
                  )}
                </div>
                {!(qAnswers[qIdx] && qAnswers[qIdx].selected) && (
                  <button onClick={nextQ} disabled={!essayDraft.trim()} style={{ ...btnG, width: "100%", opacity: essayDraft.trim() ? 1 : 0.4 }}>
                    {qIdx < activeQuiz.questions.length - 1 ? "Xác nhận & Câu tiếp →" : "Xác nhận & Nộp bài →"}
                  </button>
                )}
                {!!(qAnswers[qIdx] && qAnswers[qIdx].selected) && (
                  <button onClick={nextQ} style={{ ...btnG, width: "100%" }}>
                    {qIdx < activeQuiz.questions.length - 1 ? "Câu tiếp →" : "Nộp bài & Chấm điểm →"}
                  </button>
                )}
              </div>
            )}
            {activeQuiz.questions[qIdx] && activeQuiz.questions[qIdx].type !== "essay" && (
              <div key={qIdx} style={{ ...card, animation: "fadeIn .3s" }}>
                <span style={{ fontSize: 11, padding: "5px 10px", borderRadius: 5, background: activeQuiz.questions[qIdx].type === "truefalse" ? C.blue + "22" : C.green + "22", color: activeQuiz.questions[qIdx].type === "truefalse" ? C.blue : C.green, fontWeight: 600 }}>{activeQuiz.questions[qIdx].type === "truefalse" ? "ĐÚNG/SAI" : "TRẮC NGHIỆM"}</span>
                <h3 style={{ ...hd(17), margin: "12px 0 16px", lineHeight: 1.5 }}>{activeQuiz.questions[qIdx].q}</h3>
                {activeQuiz.questions[qIdx].type === "truefalse" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
                    {[0, 1].map(function (v) {
                      var isAns = v === Number(activeQuiz.questions[qIdx].ans), isSel = qSel === v; var bg = "rgba(255,255,255,0.04)", brd = C.border, col = "rgba(255,255,255,0.8)";
                      if (qShowExp && isAns) { bg = C.green + "18"; brd = C.green; col = C.green; } else if (qShowExp && isSel && !isAns) { bg = C.red + "18"; brd = C.red; col = C.red; }
                      return <button key={v} onClick={function () { answerQ(v) }} style={{ background: bg, border: "2px solid " + brd, borderRadius: 12, padding: 16, fontSize: 15, fontWeight: 700, color: col }}>{v === 0 ? "✓ ĐÚNG" : "✗ SAI"}</button>;
                    })}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(activeQuiz.questions[qIdx].opts || []).map(function (opt, i) {
                      var isAns = i === Number(activeQuiz.questions[qIdx].ans), isSel = qSel === i; var bg = "rgba(255,255,255,0.04)", brd = C.border, col = "rgba(255,255,255,0.8)";
                      if (qShowExp && isAns) { bg = C.green + "18"; brd = C.green; col = C.green; } else if (qShowExp && isSel && !isAns) { bg = C.red + "18"; brd = C.red; col = C.red; }
                      return <button key={i} onClick={function () { answerQ(i) }} style={{ background: bg, border: "2px solid " + brd, borderRadius: 10, padding: "12px 14px", textAlign: "left", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: col }}>
                        <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: qShowExp && isAns ? C.green : qShowExp && isSel && !isAns ? C.red : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: qShowExp && (isAns || (isSel && !isAns)) ? "#fff" : "rgba(255,255,255,0.4)" }}>{qShowExp && isAns ? "✓" : qShowExp && isSel ? "✗" : String.fromCharCode(65 + i)}</span>{opt}
                      </button>;
                    })}
                  </div>
                )}
              </div>
            )}
            {qShowExp && activeQuiz.questions[qIdx] && activeQuiz.questions[qIdx].type !== "essay" && <React.Fragment>
              <div style={{ ...card, background: (qAnswers[qIdx] && qAnswers[qIdx].correct) ? `${C.green}0a` : `${C.red}0a`, border: `1px solid ${(qAnswers[qIdx] && qAnswers[qIdx].correct) ? C.green + "33" : C.red + "33"}`, animation: "fadeIn .3s" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: (qAnswers[qIdx] && qAnswers[qIdx].correct) ? C.green : C.red, marginBottom: 3 }}>{(qAnswers[qIdx] && qAnswers[qIdx].correct) ? "✓ Chính xác!" : "✗ Sai rồi!"}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, marginBottom: 8 }}>{activeQuiz.questions[qIdx].exp}</div>
              </div>
              <button onClick={nextQ} style={{ ...btnG, width: "100%" }}>{qIdx < activeQuiz.questions.length - 1 ? "Câu tiếp →" : "Xem kết quả →"}</button>
            </React.Fragment>}
          </div>
        )}

        {/* ═══ EMPLOYEE: ESSAY GRADING SCREEN ═══ */}
        {role === "employee" && screen === "emp_essay_grading" && activeQuiz && (
          <div style={{ animation: "fadeIn .4s", textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16, animation: "pulse 1.5s infinite" }}>🤖</div>
            <h2 style={{ ...hd(20), marginBottom: 8 }}>AI đang chấm bài tự luận</h2>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginBottom: 24 }}>Vui lòng chờ trong giây lát...</div>
            {aiStatus && <div style={{ fontSize: 14, color: C.goldL, animation: "pulse 1.5s infinite", marginBottom: 12 }}>{aiStatus}</div>}
            <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
              {activeQuiz.questions.filter(q => q.type === "essay").map((_, i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: essayResults[i] ? C.green : `${C.gold}44`, animation: !essayResults[i] ? "pulse 1.5s infinite" : "" }} />
              ))}
            </div>
          </div>
        )}

        {/* ═══ EMPLOYEE: QUIZ RESULT ═══ */}
        {role === "employee" && screen === "emp_quiz_result" && (() => {
          const last = results.filter(r => r.empId === currentUser.id).slice(-1)[0]; if (!last) return null;
          const rating = getRating(last.pct);
          const isMixed = (activeQuiz && activeQuiz.quizType === "mixed") || last.quizType === "mixed";
          const curEssayResults = essayResults;
          const mcQs = activeQuiz ? activeQuiz.questions.filter(q => q.type !== "essay") : [];
          const mcCorrect = Object.values(qAnswers).filter(a => a.correct === true).length;
          return (
            <div style={{ animation: "fadeIn .4s" }}>
              {/* Score header */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: C.gold, letterSpacing: 4, marginBottom: 12 }}>KẾT QUẢ BÀI THI</div>
                <div style={{ fontSize: 56, fontWeight: 900, fontFamily: "'Be Vietnam Pro',sans-serif", color: rating.color, marginBottom: 4 }}>{last.pct}%</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{last.score}/{last.total} câu tương đương · {fmtTime(last.time)}</div>
                <div style={{ display: "inline-block", padding: "6px 20px", borderRadius: 30, background: `${rating.color}22`, border: `2px solid ${rating.color}`, marginBottom: 16 }}><span style={{ fontSize: 16, fontWeight: 800, color: rating.color }}>{rating.emoji} {rating.label}</span></div>
              </div>

              {/* Mixed quiz breakdown */}
              {isMixed && curEssayResults.length > 0 && (
                <div style={{ ...card, background: "rgba(155,89,182,0.06)", border: `1px solid ${C.purple}22`, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: C.purple, fontWeight: 700, marginBottom: 10 }}>📊 CHI TIẾT BÀI THI KẾT HỢP</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8, marginBottom: 14 }}>
                    <div style={{ padding: "12px", borderRadius: 10, background: `${C.green}08`, border: `1px solid ${C.green}22`, textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: C.green, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{mcCorrect}/{mcQs.length}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>✅ Trắc nghiệm</div>
                    </div>
                    <div style={{ padding: "12px", borderRadius: 10, background: `${C.purple}08`, border: `1px solid ${C.purple}22`, textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: C.purple, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{curEssayResults.reduce((s, r) => s + r.score, 0)}/{curEssayResults.reduce((s, r) => s + r.maxScore, 0)}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>✍️ Tự luận (AI)</div>
                    </div>
                  </div>

                  {/* Per-essay grading details */}
                  {curEssayResults.map((er, ei) => {
                    const scoreColor = er.score >= er.maxScore * 0.8 ? C.green : er.score >= er.maxScore * 0.5 ? C.orange : C.red;
                    return (
                      <div key={ei} style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, marginBottom: 10 }}>
                        {/* Question + score */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: C.purple, fontWeight: 700, marginBottom: 4 }}>✍️ CÂU TỰ LUẬN {ei + 1}</div>
                            <div style={{ color: C.white, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{er.q}</div>
                          </div>
                          <div style={{ textAlign: "center", flexShrink: 0 }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: scoreColor, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{er.score}<span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>/{er.maxScore}</span></div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: scoreColor }}>{er.grade}</div>
                          </div>
                        </div>

                        {/* User answer */}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>📝 BÀI LÀM CỦA BẠN</div>
                          <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{er.userAns || "(Không trả lời)"}</div>
                        </div>

                        {/* AI feedback */}
                        <div style={{ padding: "12px 14px", borderRadius: 10, background: `${scoreColor}08`, border: `1px solid ${scoreColor}22` }}>
                          <div style={{ fontSize: 11, color: scoreColor, fontWeight: 700, marginBottom: 6 }}>🤖 NHẬN XÉT CỦA AI</div>
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.7, marginBottom: 10 }}>{er.feedback}</div>
                          {er.explanation && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>📖 PHÂN TÍCH CHI TIẾT THEO TIÊU CHÍ</div>
                              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{er.explanation}</div>
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {er.strengthPoints && er.strengthPoints.length > 0 && (
                              <div style={{ padding: "8px 10px", borderRadius: 8, background: `${C.green}08`, border: `1px solid ${C.green}22` }}>
                                <div style={{ fontSize: 10, color: C.green, fontWeight: 700, marginBottom: 4 }}>💪 ĐIỂM MẠNH</div>
                                {er.strengthPoints.map((s, si) => <div key={si} style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>• {s}</div>)}
                              </div>
                            )}
                            {er.improvementPoints && er.improvementPoints.length > 0 && (
                              <div style={{ padding: "8px 10px", borderRadius: 8, background: `${C.orange}08`, border: `1px solid ${C.orange}22` }}>
                                <div style={{ fontSize: 10, color: C.orange, fontWeight: 700, marginBottom: 4 }}>🎯 CẦN CẢI THIỆN</div>
                                {er.improvementPoints.map((s, si) => <div key={si} style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>• {s}</div>)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* MC review for mixed or standalone */}
              {activeQuiz && (() => {
                const mcOnly = activeQuiz.questions.filter(q => q.type !== "essay");
                if (mcOnly.length === 0) return null;
                return (
                  <div style={{ ...card, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>📋 PHÂN TÍCH TRẮC NGHIỆM</div>
                    {activeQuiz.questions.map((q, qi) => {
                      if (q.type === "essay") return null;
                      const ans = qAnswers[qi]; const isCorrect = ans && ans.correct;
                      return (
                        <div key={qi} style={{ padding: "12px", borderRadius: 10, background: isCorrect ? `${C.green}06` : `${C.red}06`, border: `1px solid ${isCorrect ? C.green + "22" : C.red + "22"}`, marginBottom: 8 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                            <span style={{ fontSize: 14, flexShrink: 0 }}>{isCorrect ? "✅" : "❌"}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: C.white, fontSize: 13, fontWeight: 600, lineHeight: 1.5, marginBottom: 4 }}>{q.q}</div>
                              {ans && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Bạn chọn: <b style={{ color: isCorrect ? C.green : C.red }}>{q.type === "truefalse" ? (Number(ans.selected) === 0 ? "ĐÚNG" : "SAI") : q.opts && q.opts[Number(ans.selected)] || "-"}</b></div>}
                              {!isCorrect && <div style={{ fontSize: 11, color: C.green, marginTop: 2 }}>Đáp án đúng: <b>{q.type === "truefalse" ? (Number(q.ans) === 0 ? "ĐÚNG" : "SAI") : q.opts && q.opts[Number(q.ans)] || "-"}</b></div>}
                            </div>
                          </div>
                          {q.exp && (
                            <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                              <span style={{ color: C.goldL, fontWeight: 700 }}>💡 Giải thích: </span>{q.exp}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setScreen("emp_home")} style={btnG}>← Dashboard</button>
                <button onClick={() => setScreen("emp_quizzes")} style={btnO}>Làm đề khác</button>
              </div>
            </div>
          );
        })()}

        {/* ═══ EMPLOYEE: RESULTS ═══ */}
        {role === "employee" && screen === "emp_results" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={hd(22)}>📊 Kết Quả</h2><button onClick={() => setScreen("emp_home")} style={btnO}>← Dashboard</button></div>
            {results.filter(r => r.empId === currentUser.id).length === 0 ? <Empty msg="Chưa có kết quả." /> :
              results.filter(r => r.empId === currentUser.id).reverse().map(r => (
                <div key={r.id} style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: `${getRating(r.pct).color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: getRating(r.pct).color, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{r.pct}%</div>
                  <div style={{ flex: 1 }}><div style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>{r.quizTitle}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{r.score}/{r.total} · {fmtTime(r.time)} · {fmtDate(r.date)}</div></div>
                  <span style={{ padding: "5px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: r.passed ? `${C.green}18` : `${C.red}18`, color: r.passed ? C.green : C.red }}>{r.passed ? "ĐẠT" : "CHƯA ĐẠT"}</span>
                </div>
              ))}
          </div>
        )}

        {/* ═══ EMPLOYEE: RANKING ═══ */}
        {role === "employee" && screen === "emp_ranking" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={hd(22)}>🏆 Xếp Hạng</h2><button onClick={() => setScreen("emp_home")} style={btnO}>← Dashboard</button></div>
            <Leaderboard accounts={accounts} results={results} card={card} currentUserId={currentUser && currentUser.id} depts={DEPTS} levels={LEVELS} />
          </div>
        )}

        {/* ═══ EMPLOYEE: BADGES ═══ */}
        {role === "employee" && screen === "emp_badges" && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={hd(22)}>🎖️ Huy Hiệu</h2><button onClick={() => setScreen("emp_home")} style={btnO}>← Dashboard</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
              {BADGES.map(b => {
                const earned = getUserBadges(currentUser).some(x => x.id === b.id); return (
                  <div key={b.id} style={{ ...card, textAlign: "center", opacity: earned ? 1 : 0.35, background: earned ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.01)" }}>
                    <div style={{ fontSize: 36, marginBottom: 6 }}>{b.icon}</div>
                    <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{b.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{b.desc}</div>
                    {earned && <div style={{ marginTop: 6, fontSize: 10, color: C.green, fontWeight: 700 }}>✓ ĐÃ ĐẠT</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ EMPLOYEE: PATHWAY ═══ */}
        {role === "employee" && screen === "emp_pathway" && currentUser && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>📋 Lộ Trình Đào Tạo</h2>
              <button onClick={() => { setScreen("emp_home"); setFormData({ ...formData, viewPathId: null }); }} style={btnO}>← Dashboard</button>
            </div>
            {(() => {
              const myPaths = paths.filter(p => (p.assignedTo || []).includes(currentUser.id));
              if (myPaths.length === 0) return <Empty msg="Chưa có lộ trình nào được gán cho bạn." />;
              const viewId = formData.viewPathId;
              const viewPath = viewId ? myPaths.find(p => p.id === viewId) : null;
              // Progress helper
              const getProgress = () => { return (currentUser.pathProgress || {}); };
              const isModuleComplete = (pathId, mod) => {
                const prog = getProgress()[pathId] || {};
                const checkDone = (mod.checklist || []).length === 0 || (mod.checklist || []).every((_, i) => (prog.checks || {})[mod.id + "_" + i]);
                const quizDone = !mod.quizId || results.some(r => r.empId === currentUser.id && r.quizId === mod.quizId && r.pct >= (mod.minScore || 70));
                return checkDone && quizDone;
              };
              const getPathProgress = (p) => {
                let total = 0, done = 0;
                (p.stages || []).forEach(st => (st.modules || []).forEach(mod => { total++; if (isModuleComplete(p.id, mod)) done++; }));
                return { total, done, pct: total > 0 ? Math.round(done / total * 100) : 0 };
              };

              // PATH LIST
              if (!viewPath) return (
                <div>
                  {myPaths.map(p => {
                    const pg = getPathProgress(p); return (
                      <div key={p.id} onClick={() => setFormData({ ...formData, viewPathId: p.id })} style={{ ...card, cursor: "pointer", border: `1px solid ${pg.pct === 100 ? C.green + "33" : C.gold + "22"}` }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <div style={{ width: 50, height: 50, borderRadius: 14, background: pg.pct === 100 ? `${C.green}22` : `${C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: pg.pct === 100 ? 24 : 20 }}>{pg.pct === 100 ? "✅" : "📋"}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>{p.title}</div>
                            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{(p.stages || []).length} giai đoạn · {pg.done}/{pg.total} module</div>
                            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, marginTop: 6, overflow: "hidden" }}><div style={{ height: "100%", width: `${pg.pct}%`, background: pg.pct === 100 ? C.green : `linear-gradient(90deg,${C.gold},${C.goldL})`, borderRadius: 3, transition: "width .5s" }} /></div>
                          </div>
                          <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: pg.pct === 100 ? C.green : C.gold, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{pg.pct}%</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>hoàn thành</div></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );

              // PATH DETAIL VIEW
              const pg = getPathProgress(viewPath);
              let prevModuleComplete = true;
              return (
                <div>
                  <button onClick={() => setFormData({ ...formData, viewPathId: null })} style={{ ...btnO, marginBottom: 12, fontSize: 12 }}>← Danh sách lộ trình</button>
                  {/* Path header */}
                  <div style={{ background: `linear-gradient(135deg,${C.dark},#1a3a30)`, borderRadius: 16, padding: "22px 20px", marginBottom: 16, border: `1px solid ${C.gold}33` }}>
                    <div style={{ fontSize: 10, color: C.gold, letterSpacing: 3, marginBottom: 4 }}>LỘ TRÌNH</div>
                    <h3 style={{ ...hd(20), marginBottom: 8 }}>{viewPath.title}</h3>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${pg.pct}%`, background: `linear-gradient(90deg,${C.gold},${C.green})`, borderRadius: 3 }} /></div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: C.gold }}>{pg.pct}%</span>
                    </div>
                  </div>

                  {/* Stages & Modules */}
                  {(viewPath.stages || []).map((stage, si) => (
                    <div key={stage.id} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: C.gold }}>{si + 1}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.goldL }}>{stage.title}</div>
                      </div>
                      {(stage.modules || []).map((mod, mi) => {
                        const isComplete = isModuleComplete(viewPath.id, mod);
                        const isLocked = !prevModuleComplete;
                        if (!isLocked) prevModuleComplete = isComplete; else prevModuleComplete = false;
                        const prog = getProgress()[viewPath.id] || {};
                        const linkedQuiz = mod.quizId ? quizzes.find(q => q.id === mod.quizId) : null;
                        const bestResult = mod.quizId ? results.filter(r => r.empId === currentUser.id && r.quizId === mod.quizId).sort((a, b) => b.pct - a.pct)[0] : null;
                        const quizPassed = bestResult && bestResult.pct >= (mod.minScore || 70);
                        return (
                          <div key={mod.id} style={{ ...card, opacity: isLocked ? 0.4 : 1, border: `1px solid ${isComplete ? C.green + "33" : isLocked ? "rgba(255,255,255,0.05)" : C.border}`, marginLeft: 20, position: "relative" }}>
                            {/* Connector line */}
                            {mi > 0 && <div style={{ position: "absolute", top: -12, left: 16, width: 2, height: 12, background: C.border }} />}
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <div style={{ width: 32, height: 32, borderRadius: 10, background: isComplete ? `${C.green}22` : isLocked ? "rgba(255,255,255,0.04)" : `${C.blue}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isComplete ? 16 : 14, flexShrink: 0 }}>{isComplete ? "✅" : isLocked ? "🔒" : "📖"}</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ color: isComplete ? C.green : isLocked ? "rgba(255,255,255,0.3)" : C.white, fontWeight: 700, fontSize: 14 }}>{mod.title || "Module " + (mi + 1)}</div>
                                {isLocked && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>Hoàn thành module trước để mở khóa</div>}
                                {!isLocked && (
                                  <div style={{ marginTop: 8 }}>
                                    {/* Quiz */}
                                    {mod.quizId && (
                                      <div style={{ padding: "8px 12px", borderRadius: 8, background: quizPassed ? `${C.green}08` : "rgba(255,255,255,0.03)", border: `1px solid ${quizPassed ? C.green + "33" : C.border}`, marginBottom: 6 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <div><div style={{ fontSize: 12, fontWeight: 600, color: quizPassed ? C.green : C.white }}>📝 {mod.quizTitle || (linkedQuiz && linkedQuiz.title) || "Bài kiểm tra"}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{"Cần đạt ≥" + (mod.minScore || 70) + "%"}{bestResult ? " · Tốt nhất: " + bestResult.pct + "%" : ""}</div></div>
                                          {quizPassed ? <span style={{ color: C.green, fontSize: 12, fontWeight: 700 }}>✅ Đạt</span> : linkedQuiz ? <button onClick={() => startQuiz(linkedQuiz)} style={{ padding: "6px 14px", borderRadius: 6, background: `${C.gold}22`, color: C.gold, fontSize: 11, fontWeight: 700, border: `1px solid ${C.gold}44` }}>Làm bài →</button> : <span style={{ color: C.red, fontSize: 10 }}>Đề không tìm thấy</span>}
                                        </div>
                                      </div>
                                    )}
                                    {/* Checklist */}
                                    {(mod.checklist || []).length > 0 && (
                                      <div style={{ marginTop: 4 }}>
                                        {mod.checklist.map((cl, ci) => {
                                          const checkKey = mod.id + "_" + ci;
                                          const checked = (prog.checks || {})[checkKey];
                                          return (
                                            <div key={ci} onClick={async () => {
                                              if (isLocked) return;
                                              const newProg = { ...(currentUser.pathProgress || {}), [viewPath.id]: { ...(prog), checks: { ...(prog.checks || {}), [checkKey]: !checked } } };
                                              const u = { ...currentUser, pathProgress: newProg };
                                              setCurrentUser(u);
                                              const na = accountsRef.current.map(a => a.id === u.id ? u : a);
                                              setAccounts(na); accountsRef.current = na; await DB.set("km-accounts", na);
                                            }} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", cursor: "pointer" }}>
                                              <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? C.green : C.border}`, background: checked ? `${C.green}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.green, flexShrink: 0 }}>{checked ? "✓" : ""}</div>
                                              <span style={{ fontSize: 13, color: checked ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)", textDecoration: checked ? "line-through" : "none" }}>{cl}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {pg.pct === 100 && (
                    <div style={{ textAlign: "center", padding: 20, borderRadius: 14, background: `${C.green}08`, border: `1px solid ${C.green}22` }}>
                      <div style={{ fontSize: 32, marginBottom: 6 }}>🎉</div>
                      <div style={{ color: C.green, fontWeight: 700, fontSize: 16 }}>Hoàn thành lộ trình!</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 }}>Bạn đã hoàn thành tất cả module trong lộ trình này.</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ EMPLOYEE: COMPETENCY ═══ */}
        {role === "employee" && screen === "emp_competency" && currentUser && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={hd(22)}>🧠 Đánh Giá Năng Lực</h2><button onClick={() => setScreen("emp_home")} style={btnO}>← Dashboard</button></div>
            {(() => {
              const myR = results.filter(r => r.empId === currentUser.id);
              const myK = knowledge.filter(k => visibleToDept(k, (currentUser || {}).dept));
              const scores = evalCompetency(myR, currentUser.streak || 0, ((currentUser || {}).readLessons || []).length, myK.length);
              const posComps = POS_COMPETENCIES[currentUser.dept] || [];
              const allComps = [...CORE_COMPETENCIES, ...posComps];
              const radarData = CORE_COMPETENCIES.map(c => ({ name: c.name.split(" ")[0], score: scores[c.id] || 0, fullName: c.name }));
              const avgScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Math.max(Object.values(scores).length, 1));
              const improvements = getImprovements(scores, currentUser.dept);
              return (
                <div>
                  {/* Overall score */}
                  <div style={{ ...card, textAlign: "center", padding: 24 }}>
                    <div style={{ fontSize: 48, fontWeight: 900, fontFamily: "'Be Vietnam Pro',sans-serif", color: getCompetencyLevel(avgScore).color }}>{avgScore}%</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: getCompetencyLevel(avgScore).color, marginBottom: 4 }}>{getCompetencyLevel(avgScore).label}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Điểm năng lực trung bình</div>
                  </div>
                  {/* Radar */}
                  <div style={card}>
                    <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>BIỂU ĐỒ NĂNG LỰC CỐT LÕI</div>
                    <ResponsiveContainer width="100%" height={240}>
                      <RadarChart data={radarData}><PolarGrid stroke="rgba(255,255,255,0.1)" /><PolarAngleAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} /><PolarRadiusAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} /><Radar dataKey="score" stroke={C.gold} fill={C.gold} fillOpacity={0.25} /><Tooltip contentStyle={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} /></RadarChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Detail scores */}
                  <div style={card}>
                    <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 10 }}>NĂNG LỰC CỐT LÕI (6 nhóm)</div>
                    {CORE_COMPETENCIES.map(c => {
                      const s = scores[c.id] || 0; const lv = getCompetencyLevel(s); return (
                        <div key={c.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{c.icon} {c.name}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: lv.color || C.gold }}>{s}% · {lv.label}</span>
                          </div>
                          <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${s}%`, background: lv.color || C.gold, borderRadius: 3, transition: "width .5s" }} /></div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Position-specific */}
                  {posComps.length > 0 && <div style={card}>
                    <div style={{ fontSize: 13, color: C.purple, fontWeight: 700, marginBottom: 10 }}>{"NĂNG LỰC THEO VỊ TRÍ (" + currentUser.dept + ")"}</div>
                    {posComps.map(c => {
                      const s = scores[c.id] || Math.round(avgScore * 0.8); const lv = getCompetencyLevel(s); return (
                        <div key={c.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{c.icon} {c.name}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: lv.color || C.gold }}>{s}% · {lv.label}</span>
                          </div>
                          <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${s}%`, background: lv.color || C.gold, borderRadius: 3 }} /></div>
                        </div>
                      );
                    })}
                  </div>}
                  {/* Improvements */}
                  {improvements.length > 0 && <div style={{ ...card, background: `${C.orange}06`, border: `1px solid ${C.orange}22` }}>
                    <div style={{ fontSize: 13, color: C.orange, fontWeight: 700, marginBottom: 10 }}>💡 ĐỀ XUẤT CẢI THIỆN</div>
                    {improvements.map((s, i) => (
                      <div key={i} style={{ padding: "8px 0", borderBottom: i < improvements.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: s.priority === "Cao" ? `${C.red}22` : `${C.orange}22`, color: s.priority === "Cao" ? C.red : C.orange, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{s.priority}</span>
                          <div><div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{s.comp}</div><div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, lineHeight: 1.5 }}>{s.action}</div></div>
                        </div>
                      </div>
                    ))}
                  </div>}
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ EMPLOYEE: CHANGE PASSWORD ═══ */}
        {role === "employee" && screen === "emp_changepw" && currentUser && (
          <div style={{ animation: "fadeIn .4s", maxWidth: 440, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>⚙️ Đổi Mật Khẩu</h2>
              <button onClick={() => { setScreen("emp_home"); setFormData({}); }} style={btnO}>← Dashboard</button>
            </div>
            <div style={card}>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Mật khẩu hiện tại</label>
                <input type="password" value={formData.oldPw || ""} onChange={e => setFormData({ ...formData, oldPw: e.target.value, pwErr: "", pwOk: "" })} placeholder="Nhập mật khẩu hiện tại" style={inp} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Mật khẩu mới</label>
                <input type="password" value={formData.newPw || ""} onChange={e => setFormData({ ...formData, newPw: e.target.value, pwErr: "", pwOk: "" })} placeholder="Tối thiểu 4 ký tự" style={inp} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Xác nhận mật khẩu mới</label>
                <input type="password" value={formData.cfPw || ""} onChange={e => setFormData({ ...formData, cfPw: e.target.value, pwErr: "", pwOk: "" })} placeholder="Nhập lại mật khẩu mới" style={inp} />
              </div>
              {formData.pwErr && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>✗ {formData.pwErr}</div>}
              {formData.pwOk && <div style={{ color: C.green, fontSize: 12, marginBottom: 10 }}>✓ {formData.pwOk}</div>}
              <button onClick={async () => {
                if (!formData.oldPw) return setFormData({ ...formData, pwErr: "Nhập mật khẩu hiện tại" });
                if (!formData.newPw || formData.newPw.length < 4) return setFormData({ ...formData, pwErr: "Mật khẩu mới tối thiểu 4 ký tự" });
                if (formData.newPw !== formData.cfPw) return setFormData({ ...formData, pwErr: "Xác nhận mật khẩu không khớp" });
                setFormData({ ...formData, pwErr: "", pwOk: "", pwLoading: true });
                try {
                  // Verify old password by attempting sign-in
                  const email = (currentUser.empId || "").toLowerCase() + "@kingsmen.internal";
                  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: formData.oldPw });
                  if (verifyErr) return setFormData({ ...formData, pwErr: "Mật khẩu hiện tại không đúng", pwLoading: false });
                  // Update to new password via Supabase Auth
                  const { error: updateErr } = await supabase.auth.updateUser({ password: formData.newPw });
                  if (updateErr) return setFormData({ ...formData, pwErr: "Lỗi: " + updateErr.message, pwLoading: false });
                  setFormData({ pwOk: "Đổi mật khẩu thành công!", pwLoading: false });
                } catch (e) {
                  setFormData({ ...formData, pwErr: "Đã xảy ra lỗi, vui lòng thử lại.", pwLoading: false });
                }
              }} disabled={formData.pwLoading} style={{ ...btnG, width: "100%", opacity: formData.pwLoading ? 0.6 : 1 }}>{formData.pwLoading ? "Đang xử lý..." : "Đổi mật khẩu"}</button>
            </div>
          </div>
        )}

        {/* ═══ MANAGER: MY TEAM ═══ */}
        {role === "employee" && screen === "mgr_team" && currentUser && (currentUser.accRole === "manager" || currentUser.accRole === "director") && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>👥 Team Của Tôi</h2>
              <button onClick={() => setScreen("emp_home")} style={btnO}>← Dashboard</button>
            </div>
            {(() => {
              const isDirector = currentUser.accRole === "director";
              const myTeam = isDirector ? accounts.filter(a => a.id !== currentUser.id) : accounts.filter(a => a.dept === currentUser.dept && a.id !== currentUser.id);
              if (myTeam.length === 0) return <Empty msg={"Chưa có nhân viên nào trong team " + (currentUser.team || currentUser.dept)} />;
              return (
                <div>
                  {/* Team overview */}
                  <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 10, textAlign: "center" }}>
                    <div><div style={{ fontSize: 20, fontWeight: 800, color: C.blue, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{myTeam.length}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Thành viên</div></div>
                    <div><div style={{ fontSize: 20, fontWeight: 800, color: C.green, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{(() => { const rs = results.filter(r => myTeam.some(m => m.id === r.empId)); return rs.length ? Math.round(rs.reduce((s, r) => s + r.pct, 0) / rs.length) : 0 })}%</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Điểm TB team</div></div>
                    <div><div style={{ fontSize: 20, fontWeight: 800, color: C.gold, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{Math.round(myTeam.reduce((s, a) => s + (a.xp || 0), 0) / Math.max(myTeam.length, 1))}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>XP TB</div></div>
                  </div>

                  {/* Set challenge for team */}
                  <div style={{ ...card, background: `${C.gold}06`, border: `1px solid ${C.gold}22` }}>
                    <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 8 }}>🎯 GÁN THỬ THÁCH</div>
                    <input value={formData.mgrCh || ""} onChange={e => setFormData({ ...formData, mgrCh: e.target.value })} placeholder="Tên thử thách..." style={{ ...inp, marginBottom: 6 }} />
                    <div style={{ marginBottom: 6 }}><label style={{ ...lbl, fontSize: 10 }}>Bài kiểm tra *</label><select value={formData.mgrChQuiz || ""} onChange={e => setFormData({ ...formData, mgrChQuiz: e.target.value })} style={inp}><option value="">— Chọn đề —</option>{quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}</select></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6, marginBottom: 6 }}>
                      <select value={formData.mgrChFor || "team"} onChange={e => setFormData({ ...formData, mgrChFor: e.target.value })} style={inp}>
                        <option value="team">Cả team</option>
                        {myTeam.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <input type="number" value={formData.mgrChMin || 70} onChange={e => setFormData({ ...formData, mgrChMin: +e.target.value })} placeholder="% tối thiểu" style={inp} />
                      <input type="date" value={formData.mgrChDl || ""} onChange={e => setFormData({ ...formData, mgrChDl: e.target.value })} style={inp} />
                    </div>
                    {(formData.mgrRewards || []).map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                        <input value={r} onChange={e => { const rw = [...(formData.mgrRewards || [])]; rw[i] = e.target.value; setFormData({ ...formData, mgrRewards: rw }); }} placeholder={"🎁 Phần thưởng " + (i + 1)} style={{ ...inp, flex: 1, padding: "6px 10px", fontSize: 12 }} />
                        <button onClick={() => { const rw = [...(formData.mgrRewards || [])]; rw.splice(i, 1); setFormData({ ...formData, mgrRewards: rw }); }} style={{ padding: "5px 10px", borderRadius: 4, background: `${C.red}22`, color: C.red, fontSize: 12, border: "none" }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6 }}>
                      {(formData.mgrRewards || []).length < 5 && <button onClick={() => setFormData({ ...formData, mgrRewards: [...(formData.mgrRewards || []), ""], })} style={{ ...btnO, fontSize: 10, padding: "6px 12px" }}>+ Thêm thưởng</button>}
                      <button onClick={async () => {
                        if (!(formData.mgrCh || "").trim() || !formData.mgrChQuiz) return;
                        const forPerson = formData.mgrChFor || "team";
                        const targets = forPerson === "team" ? myTeam : [myTeam.find(m => m.id === forPerson)].filter(Boolean);
                        const selQ = quizzes.find(q => q.id === formData.mgrChQuiz);
                        const ch = { id: uid(), title: formData.mgrCh, quizId: formData.mgrChQuiz, quizTitle: (selQ && selQ.title) || "", minScore: formData.mgrChMin || 70, xpReward: 50, deadline: formData.mgrChDl || "", assignTo: forPerson === "team" ? "dept" : forPerson, assignDept: currentUser.dept, rewards: (formData.mgrRewards || []).filter(r => r.trim()), createdAt: new Date().toISOString(), createdByName: currentUser.name, createdBy: currentUser.id, active: true, completedBy: [], wonRewards: {} };
                        // Reload latest before append
                        let existing = challenges;
                        try { const fromDB = await DB.get("km-challenges", []); if (Array.isArray(fromDB) && fromDB.length >= existing.length) existing = fromDB; } catch (e) { }
                        const newCh = [...existing, ch];
                        setChallenges(newCh);
                        const saved = await DB.set("km-challenges", newCh);
                        if (!saved) { setSaveStatus("error"); return; }
                        let curNotifs = notifications;
                        try { const nfDB = await DB.get("km-notifications", []); if (Array.isArray(nfDB) && nfDB.length >= curNotifs.length) curNotifs = nfDB; } catch (e) { }
                        const newNotifs = [...curNotifs];
                        targets.forEach(m => newNotifs.push({ id: uid(), empId: m.id, msg: "🎯 Thử thách từ " + currentUser.name + ": " + formData.mgrCh + " — Đạt ≥" + (formData.mgrChMin || 70) + "% bài " + ch.quizTitle + (ch.rewards.length > 0 ? " · 🎁 " + ch.rewards.length + " phần thưởng" : ""), type: "challenge", date: new Date().toISOString(), read: false }));
                        setNotifications(newNotifs); await DB.set("km-notifications", newNotifs);
                        setSaveStatus("saved"); setFormData({});
                      }} style={{ ...btnG, opacity: (!(formData.mgrCh || "").trim() || !formData.mgrChQuiz) ? 0.4 : 1 }}>🎯 Gán</button>
                    </div>
                  </div>

                  {/* Pathway progress for team */}
                  {paths.filter(p => (p.assignedTo || []).some(id => myTeam.some(m => m.id === id))).length > 0 && (
                    <div style={{ ...card, background: `${C.purple}06`, border: `1px solid ${C.purple}22` }}>
                      <div style={{ fontSize: 12, color: C.purple, fontWeight: 700, marginBottom: 8 }}>📋 TIẾN ĐỘ LỘ TRÌNH TEAM</div>
                      {paths.filter(p => (p.assignedTo || []).some(id => myTeam.some(m => m.id === id))).map(p => {
                        const assignedTeam = myTeam.filter(m => (p.assignedTo || []).includes(m.id));
                        return (
                          <div key={p.id} style={{ marginBottom: 10 }}>
                            <div style={{ color: C.white, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{p.title}</div>
                            {assignedTeam.map(m => {
                              let total = 0, done = 0;
                              (p.stages || []).forEach(st => (st.modules || []).forEach(mod => {
                                total++;
                                const prog = (m.pathProgress || {})[p.id] || {};
                                const checkDone = (mod.checklist || []).length === 0 || (mod.checklist || []).every((_, ci) => (prog.checks || {})[mod.id + "_" + ci]);
                                const quizDone = !mod.quizId || results.some(r => r.empId === m.id && r.quizId === mod.quizId && r.pct >= (mod.minScore || 70));
                                if (checkDone && quizDone) done++;
                              }));
                              const pct = total > 0 ? Math.round(done / total * 100) : 0;
                              return (
                                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                                  <span style={{ fontSize: 12, color: C.white, width: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                                  <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? C.green : `linear-gradient(90deg,${C.gold},${C.goldL})`, borderRadius: 3 }} /></div>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? C.green : C.gold, width: 36, textAlign: "right" }}>{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Team members */}
                  {myTeam.map(member => {
                    const myR = results.filter(r => r.empId === member.id);
                    const lv = gL(member.xp || 0);
                    const avg = myR.length ? Math.round(myR.reduce((s, r) => s + r.pct, 0) / myR.length) : 0;
                    const myK = knowledge.filter(k2 => visibleToDept(k2, member.dept));
                    const scores = evalCompetency(myR, member.streak || 0, (member.readLessons || []).length, myK.length);
                    const badges = getUserBadges(member);
                    const improvements = getImprovements(scores, member.dept);
                    const expanded = formData.mgrExpand === member.id;
                    return (
                      <div key={member.id} style={card}>
                        <div onClick={() => setFormData({ ...formData, mgrExpand: expanded ? null : member.id })} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                          <span style={{ fontSize: 20 }}>{lv.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>{member.name} <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>({member.empId})</span></div>
                            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{lv.name} · {member.xp || 0} XP · 🔥{member.streak || 0} · {myR.length} lượt thi · TB {avg}%</div>
                          </div>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: avg >= 70 ? C.green : avg > 0 ? C.orange : "rgba(255,255,255,0.15)", fontFamily: "'Be Vietnam Pro',sans-serif" }}>{avg || "—"}%</div>
                            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 16 }}>{expanded ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {expanded && (
                          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                            {/* Competency bars */}
                            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 8 }}>🧠 NĂNG LỰC</div>
                            {CORE_COMPETENCIES.map(c2 => {
                              const s2 = scores[c2.id] || 0; const lv2 = getCompetencyLevel(s2); return (
                                <div key={c2.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                                  <span style={{ fontSize: 12, width: 20, textAlign: "center" }}>{c2.icon}</span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}><div style={{ height: "100%", width: `${s2}%`, background: lv2.color, borderRadius: 2 }} /></div>
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: lv2.color, minWidth: 35, textAlign: "right" }}>{s2}%</span>
                                </div>
                              );
                            })}
                            {/* Badges */}
                            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginTop: 10, marginBottom: 6 }}>🎖️ HUY HIỆU ({badges.length}/{BADGES.length})</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {BADGES.map(b => { const has = badges.some(x => x.id === b.id); return <span key={b.id} title={b.name} style={{ fontSize: has ? 20 : 16, opacity: has ? 1 : 0.2 }}>{b.icon}</span>; })}
                            </div>
                            {/* Improvements */}
                            {improvements.length > 0 && (
                              <div style={{ marginTop: 10, padding: "8px 10px", background: `${C.orange}08`, borderRadius: 8 }}>
                                <div style={{ fontSize: 11, color: C.orange, fontWeight: 700, marginBottom: 4 }}>💡 CẦN HỖ TRỢ</div>
                                {improvements.map((imp, idx) => <div key={idx} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", padding: "2px 0" }}><b style={{ color: C.white }}>{imp.comp}:</b> {imp.action}</div>)}
                              </div>
                            )}
                            {/* Recent results */}
                            {myR.length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 4 }}>KẾT QUẢ GẦN NHẤT</div>
                                {myR.slice(-3).reverse().map(r => (
                                  <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 11 }}>
                                    <span style={{ fontWeight: 700, color: getRating(r.pct).color }}>{r.pct}%</span>
                                    <span style={{ color: "rgba(255,255,255,0.4)" }}>{r.quizTitle} · {fmtDate(r.date)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ EMPLOYEE: BULLETINS ═══ */}
        {role === "employee" && screen === "emp_bulletins" && (() => {
          const sorted = [...bulletins].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
          const viewBul = formData.viewBulId ? sorted.find(b => b.id === formData.viewBulId) : null;
          const typeInfo = (t) => t === "policy" ? { icon: "📋", label: "Chính sách", color: C.red, bg: `${C.red}15` } : t === "news" ? { icon: "📰", label: "Tin tức", color: C.blue, bg: `${C.blue}15` } : t === "event" ? { icon: "🎉", label: "Sự kiện", color: C.green, bg: `${C.green}15` } : { icon: "📢", label: "Thông báo", color: C.gold, bg: `${C.gold}15` };

          // DETAIL VIEW
          if (viewBul) {
            const ti = typeInfo(viewBul.type); return (
              <div style={{ animation: "fadeIn .3s" }}>
                <button onClick={() => setFormData({ ...formData, viewBulId: null })} style={{ ...btnO, marginBottom: 14 }}>← Danh sách bảng tin</button>
                <div style={{ borderRadius: 18, overflow: "hidden", border: `1px solid ${ti.color}33` }}>
                  {/* Hero header */}
                  <div style={{ padding: "28px 24px", background: `linear-gradient(160deg,${C.dark},${ti.color}11)`, borderBottom: `1px solid ${ti.color}22`, position: "relative" }}>
                    {viewBul.pinned && <div style={{ position: "absolute", top: 12, right: 16, fontSize: 10, color: C.gold, background: `${C.gold}22`, padding: "2px 8px", borderRadius: 4 }}>📌 Ghim</div>}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: ti.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{ti.icon}</div>
                      <div><div style={{ fontSize: 10, color: ti.color, fontWeight: 700, letterSpacing: 2 }}>{ti.label.toUpperCase()}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{fmtDate(viewBul.createdAt)}</div></div>
                    </div>
                    <h2 style={{ ...hd(22), lineHeight: 1.4 }}>{viewBul.title}</h2>
                  </div>
                  {/* Content body */}
                  <div style={{ padding: "24px" }}>
                    {viewBul.content.split(/\n\s*\n/).filter(Boolean).map((para, i) => {
                      const lines = para.trim().split("\n").filter(Boolean);
                      const first = (lines[0] && lines[0].trim()) || "";
                      const isHeader = first.endsWith(":") || first === first.toUpperCase() && first.length > 3;
                      const isImportant = first.includes("LƯU Ý") || first.includes("QUAN TRỌNG") || first.includes("BẮT BUỘC");
                      return (
                        <div key={i} style={{ marginBottom: 14, padding: isHeader || isImportant ? "14px 16px" : "0", borderRadius: isHeader || isImportant ? 12 : 0, background: isImportant ? `${C.red}06` : isHeader ? `${C.gold}04` : "transparent", border: isImportant ? `1px solid ${C.red}22` : isHeader ? `1px solid ${C.gold}11` : "none", animation: `fadeIn .4s ${i * 0.08}s both` }}>
                          {isHeader && <div style={{ fontSize: 14, fontWeight: 700, color: isImportant ? C.red : C.goldL, marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}>{isImportant ? "⚠️" : "📌"} {first}</div>}
                          {(isHeader ? lines.slice(1) : lines).map((l, j) => {
                            const t = l.trim(); if (!t) return null;
                            const isBul = t.startsWith("-") || t.startsWith("•") || t.startsWith("+") || t.startsWith("✓");
                            const isNum = t.match(/^\d+[\.\)]/);
                            return (
                              <div key={j} style={{ display: "flex", gap: 8, padding: isBul || isNum ? "4px 0 4px 8px" : "4px 0", color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 1.8 }}>
                                {isBul && <span style={{ color: ti.color, flexShrink: 0, fontWeight: 700 }}>•</span>}
                                {isNum && <span style={{ color: ti.color, fontWeight: 700, flexShrink: 0 }}>{t.match(/^\d+/)[0]}.</span>}
                                <span>{isBul ? t.slice(1).trim() : isNum ? t.replace(/^\d+[\.\)]\s*/, "") : t}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          // LIST VIEW
          return (
            <div style={{ animation: "fadeIn .4s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={hd(22)}>📢 Bảng Tin</h2><button onClick={() => setScreen("emp_home")} style={btnO}>← Dashboard</button>
              </div>
              {sorted.length === 0 && <Empty msg="Chưa có bài đăng nào." />}
              {sorted.map((b, i) => {
                const ti = typeInfo(b.type); return (
                  <div key={b.id} onClick={() => setFormData({ ...formData, viewBulId: b.id })} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", marginBottom: 6, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, cursor: "pointer", borderLeft: `4px solid ${ti.color}`, animation: `fadeIn .3s ${i * 0.05}s both` }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: ti.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{ti.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                        {b.pinned && <span style={{ fontSize: 10, color: C.gold }}>📌</span>}
                        <span style={{ color: C.white, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: ti.bg, color: ti.color, fontWeight: 600 }}>{ti.label}</span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{fmtDate(b.createdAt)}</span>
                      </div>
                    </div>
                    <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 16 }}>›</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ═══ EMPLOYEE: CHALLENGES ═══ */}
        {role === "employee" && screen === "emp_challenges" && currentUser && (
          <div style={{ animation: "fadeIn .4s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={hd(22)}>🎯 Thử Thách</h2>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={async () => { try { const ch = await DB.get("km-challenges", []); if (Array.isArray(ch) && ch.length > 0) { setChallenges(ch); } } catch (e) { } }} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontSize: 11, border: `1px solid ${C.border}` }}>🔄 Làm mới</button>
                <button onClick={() => setScreen("emp_home")} style={btnO}>← Dashboard</button>
              </div>
            </div>
            {(() => {
              // Show ALL challenges visible to this user
              const myChallenges = challenges.filter(ch => {
                // No filter on active - show all
                if (ch.assignTo === "dept" && ch.assignDept && ch.assignDept !== currentUser.dept) return false;
                if (ch.assignTo && ch.assignTo !== "all" && ch.assignTo !== "dept" && ch.assignTo !== currentUser.id) return false;
                return true;
              });
              // Check completion from both completedBy AND quiz results
              const isCompleted = (ch) => {
                if ((ch.completedBy || []).includes(currentUser.id)) return true;
                // Also check if user already passed the quiz with required score
                if (ch.quizId) {
                  const best = results.filter(r => r.empId === currentUser.id && r.quizId === ch.quizId).sort((a, b) => b.pct - a.pct)[0];
                  if (best && best.pct >= (ch.minScore || settings.passScore)) return true;
                }
                return false;
              };
              const active = myChallenges.filter(ch => !isCompleted(ch) && (!ch.deadline || daysSince(ch.deadline + "T23:59") <= 0));
              const done = myChallenges.filter(ch => isCompleted(ch));
              const expired = myChallenges.filter(ch => !isCompleted(ch) && ch.deadline && daysSince(ch.deadline + "T23:59") > 0);

              if (myChallenges.length === 0) return (
                <div style={{ textAlign: "center", padding: 32 }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🎯</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 8 }}>Chưa có thử thách nào cho bạn</div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>Tổng thử thách trong hệ thống: {challenges.length} · Phòng ban: {currentUser.dept}</div>
                  <button onClick={async () => { try { const ch = await DB.get("km-challenges", []); if (Array.isArray(ch) && ch.length > 0) { setChallenges(ch); } } catch (e) { } }} style={{ ...btnO, marginTop: 12, fontSize: 12 }}>🔄 Tải lại dữ liệu</button>
                </div>
              );
              return (
                <div>
                  {/* Active challenges */}
                  {active.length > 0 && <div style={{ fontSize: 12, color: C.orange, fontWeight: 700, marginBottom: 8 }}>🟡 ĐANG THỰC HIỆN ({active.length})</div>}
                  {active.map(ch => {
                    const daysLeft = ch.deadline ? -daysSince(ch.deadline + "T23:59") : null;
                    const linkedQuiz = ch.quizId ? quizzes.find(q => q.id === ch.quizId) : null;
                    const myBestResult = ch.quizId ? results.filter(r => r.empId === currentUser.id && r.quizId === ch.quizId).sort((a, b) => b.pct - a.pct)[0] : null;
                    const minScore = ch.minScore || settings.passScore;
                    return (
                      <div key={ch.id} style={{ ...card, border: `1px solid ${C.gold}33` }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <div style={{ width: 48, height: 48, borderRadius: 14, background: `${C.gold}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🎯</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: C.white, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{ch.title}</div>
                            {/* Condition */}
                            {ch.quizId ? (
                              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, marginBottom: 8 }}>
                                <div style={{ fontSize: 12, color: C.goldL, fontWeight: 700, marginBottom: 4 }}>📝 ĐIỀU KIỆN</div>
                                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{"Đạt ≥"}<b style={{ color: C.gold }}>{minScore}%</b>{" bài: "}<b style={{ color: C.white }}>{ch.quizTitle || (linkedQuiz && linkedQuiz.title) || "Bài kiểm tra"}</b></div>
                                {myBestResult && <div style={{ fontSize: 12, color: myBestResult.pct >= minScore ? C.green : C.orange, marginTop: 4 }}>{"Kết quả tốt nhất: "}<b>{myBestResult.pct}%</b>{myBestResult.pct >= minScore ? " ✅" : " — cần thêm " + (minScore - myBestResult.pct) + "%"}</div>}
                              </div>
                            ) : (
                              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, marginBottom: 8 }}>
                                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{ch.title}</div>
                              </div>
                            )}
                            {/* Tags */}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                              {tag("+" + (ch.xpReward || 0) + " XP", C.gold)}
                              {ch.deadline && <span>{tag(daysLeft !== null && daysLeft <= 3 && daysLeft >= 0 ? "⏰ Còn " + daysLeft + " ngày" : "Hạn: " + ch.deadline, daysLeft !== null && daysLeft <= 3 ? C.orange : C.blue)}</span>}
                            </div>
                            {/* Rewards */}
                            {ch.rewards && ch.rewards.length > 0 && (
                              <div style={{ padding: "10px 14px", borderRadius: 10, background: `${C.purple}06`, border: `1px solid ${C.purple}22`, marginBottom: 8 }}>
                                <div style={{ fontSize: 11, color: C.purple, fontWeight: 700, marginBottom: 6 }}>{"🎁 PHẦN THƯỞNG NGẪU NHIÊN (" + ch.rewards.length + " món)"}</div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {ch.rewards.map((r, i) => <span key={i} style={{ fontSize: 13, padding: "5px 12px", borderRadius: 8, background: `${C.purple}15`, color: C.purple, border: `1px solid ${C.purple}33` }}>🎁 {r}</span>)}
                                </div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Hoàn thành thử thách → bốc thăm ngẫu nhiên 1 phần thưởng!</div>
                              </div>
                            )}
                            {/* Action button */}
                            {linkedQuiz ? (
                              <button onClick={() => startQuiz(linkedQuiz)} style={{ width: "100%", padding: "14px", borderRadius: 12, background: `linear-gradient(135deg,${C.gold},${C.goldL})`, color: C.dark, fontSize: 15, fontWeight: 800, border: "none" }}>📝 Làm kiểm tra ngay →</button>
                            ) : ch.quizId ? (
                              <div style={{ padding: 10, borderRadius: 8, background: `${C.orange}08`, color: C.orange, fontSize: 12, textAlign: "center" }}>Đề thi chưa sẵn sàng. Quay lại sau hoặc liên hệ Admin.</div>
                            ) : (
                              <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)", fontSize: 12, textAlign: "center" }}>Thử thách chưa gắn bài kiểm tra</div>
                            )}
                            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 6 }}>Tạo bởi {ch.createdByName || "Admin"}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Completed */}
                  {done.length > 0 && <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>{"✅ ĐÃ HOÀN THÀNH (" + done.length + ")"}</div>}
                  {done.map(ch => (
                    <div key={ch.id} style={{ ...card, opacity: 0.7, border: `1px solid ${C.green}33` }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${C.green}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>✅</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: C.green, fontWeight: 700, fontSize: 14 }}>{ch.title}</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>{tag("✓ Hoàn thành", C.green)}{tag("+" + (ch.xpReward || 0) + " XP", C.gold)}{ch.wonRewards && ch.wonRewards[currentUser.id] && tag("🎁 " + ch.wonRewards[currentUser.id], C.purple)}</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Expired */}
                  {expired.length > 0 && <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>{"⏰ ĐÃ HẾT HẠN (" + expired.length + ")"}</div>}
                  {expired.map(ch => (
                    <div key={ch.id} style={{ ...card, opacity: 0.5, border: `1px solid ${C.red}33` }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span style={{ fontSize: 20 }}>⏰</span>
                        <div style={{ flex: 1 }}><div style={{ color: C.red, fontSize: 13 }}>{ch.title}</div><div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>Hết hạn: {ch.deadline}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}

// ═══ SUB-COMPONENTS ═══
function Empty({ msg }) { return <div style={{ textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>📭 {msg}</div> }

function Leaderboard({ accounts, results, card, currentUserId, depts, levels }) {
  const [df, setDf] = useState("Tất cả");
  const filtered = df === "Tất cả" ? accounts.filter(a => a.status !== "inactive") : accounts.filter(a => a.dept === df && a.status !== "inactive");
  const sorted = [...filtered].sort((a, b) => (b.xp || 0) - (a.xp || 0));
  const medals = ["🥇", "🥈", "🥉"];
  return (<React.Fragment>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
      {["Tất cả", ...(depts || DEFAULT_DEPTS)].map(d => <button key={d} onClick={() => setDf(d)} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 10, fontWeight: df === d ? 700 : 500, background: df === d ? C.gold : "rgba(255,255,255,0.04)", color: df === d ? C.dark : "rgba(255,255,255,0.4)", border: `1px solid ${df === d ? C.gold : C.border}` }}>{d}</button>)}
    </div>
    {sorted.length === 0 ? <Empty msg="Chưa có nhân viên." /> : sorted.map((a, i) => {
      const lv = getLevel(a.xp || 0, levels); const isMe = a.id === currentUserId;
      return (
        <div key={a.id} style={{ ...card, display: "flex", alignItems: "center", gap: 12, background: isMe ? "rgba(197,153,62,0.06)" : card.background }}>
          <div style={{ width: 28, textAlign: "center", fontSize: i < 3 ? 18 : 12, color: i < 3 ? ["#FFD700", "#C0C0C0", "#CD7F32"][i] : "rgba(255,255,255,0.2)", fontWeight: 700 }}>{i < 3 ? medals[i] : i + 1}</div>
          <span style={{ fontSize: 18 }}>{lv.icon}</span>
          <div style={{ flex: 1 }}><div style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>{a.name} {isMe && <span style={{ fontSize: 10, color: C.gold }}>(Bạn)</span>}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{a.dept} · {lv.name} · 🔥{a.streak || 0}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 16, fontWeight: 800, color: lv.color || C.gold, fontFamily: "'Be Vietnam Pro',sans-serif", letterSpacing: -0.5 }}>{a.xp || 0}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>XP</div></div>
        </div>
      );
    })}
  </React.Fragment>);
}
