import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import arenaSound from "./arenaSound.js";

/* ═══════════════════════════════════════════════════════════════
   ĐẤU TRƯỜNG — Live Quiz thi đấu đồng bộ (kiểu Kahoot)
   ═══════════════════════════════════════════════════════════════

   Luồng:
     HOST  : chọn đề → tạo phòng (PIN) → chờ người vào → Bắt đầu
             → [câu hỏi → hiện đáp án → bảng xếp hạng] × N → kết thúc
     PLAYER: nhập PIN → chờ → bấm ô màu → xem đúng/sai → xem hạng

   Nguyên tắc:
     · Đáp án KHÔNG BAO GIỜ được gửi xuống máy người chơi trước khi host
       bấm "Hiện đáp án" (bảng live_rooms không chứa đáp án — xem migration).
     · Điểm và thời gian do SERVER tính (RPC live_submit_answer).
       Client chỉ gửi lựa chọn.
     · Đồng hồ hiển thị được bù lệch giờ máy cá nhân qua RPC km_now().
     · Nhạc nền & hiệu ứng: tổng hợp bằng Web Audio (xem arenaSound.js),
       không dùng file nhạc nào.
   ═══════════════════════════════════════════════════════════════ */

// Bảng màu ô đáp án (đủ 6 để phòng đề có 5–6 lựa chọn)
const OPT = [
  { bg: "#e21b3c", dark: "#a3132c", icon: "▲" },
  { bg: "#1368ce", dark: "#0d4a94", icon: "◆" },
  { bg: "#d89e00", dark: "#9c7200", icon: "●" },
  { bg: "#26890c", dark: "#1a6108", icon: "■" },
  { bg: "#7b2ff7", dark: "#5820b0", icon: "★" },
  { bg: "#0f8b8d", dark: "#0a6365", icon: "✦" },
];

const MEDAL = ["🥇", "🥈", "🥉"];
const CONFETTI_COLORS = ["#e21b3c", "#1368ce", "#d89e00", "#26890c", "#7b2ff7", "#ffffff", "#C9A84C"];
const SS_KEY = "km_live_session";

const playableCount = (q) =>
  (q.questions || []).filter(
    (x) =>
      (x.type || "mc") !== "essay" &&
      ((x.type || "mc") === "truefalse" || (x.opts || []).length >= 2)
  ).length;

const rankPlayers = (list) =>
  [...list].sort(
    (a, b) =>
      b.score - a.score ||
      b.correct_count - a.correct_count ||
      String(a.joined_at).localeCompare(String(b.joined_at))
  );

/* ─────────────────────────────────────────────────────────────
   Hoạt hình dùng chung — tiền tố "ka" để không đụng keyframes
   sẵn có của app (fadeIn / pulse / toastSlideUp / glowPulse).
   ───────────────────────────────────────────────────────────── */
const ARENA_CSS = `
@keyframes kaPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
@keyframes kaPopIn{0%{transform:scale(0) rotate(-12deg);opacity:0}70%{transform:scale(1.15) rotate(4deg)}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes kaFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes kaShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(4px)}}
@keyframes kaHeart{0%,100%{transform:scale(1)}30%{transform:scale(1.14)}60%{transform:scale(.97)}}
@keyframes kaGlow{0%,100%{text-shadow:0 0 18px rgba(201,168,76,.45),0 0 6px rgba(255,255,255,.25)}50%{text-shadow:0 0 42px rgba(201,168,76,.95),0 0 14px rgba(255,255,255,.5)}}
@keyframes kaDrift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes kaRise{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes kaFall{0%{transform:translateY(-14vh) rotate(0);opacity:1}100%{transform:translateY(96vh) rotate(760deg);opacity:.9}}
@keyframes kaSlideUp{from{transform:translateY(22px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes kaSpin{to{transform:rotate(360deg)}}
.ka-tile{transition:transform .12s cubic-bezier(.34,1.6,.64,1),box-shadow .12s,filter .25s}
.ka-tile:hover{transform:translateY(-3px) scale(1.015)}
.ka-tile:active{transform:translateY(3px) scale(.985)}
@media (prefers-reduced-motion:reduce){
  .ka-tile,.ka-anim{animation:none!important;transition:none!important}
}
`;

/* ─────────────────────────────────────────────────────────────
   Hook: theo dõi 1 phòng qua Supabase Realtime
   ───────────────────────────────────────────────────────────── */
function useRoomChannel(supabase, roomId, isHost) {
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gone, setGone] = useState(false); // phòng bị host hủy/xóa

  // Số lượt đã trả lời LUÔN đi kèm q_idx mà nó thuộc về. Nếu chỉ giữ một con số
  // rồi reset bằng useEffect thì effect của component con (HostRoom) chạy TRƯỚC
  // effect reset của hook này → câu mới đọc phải số đếm của câu cũ → tự động
  // hiện đáp án ngay khi vừa sang câu.
  const [ans, setAns] = useState({ qIdx: -1, n: 0 });

  // Nạp lần đầu + mỗi khi đổi phòng
  useEffect(() => {
    if (!roomId) { setRoom(null); setPlayers([]); setAns({ qIdx: -1, n: 0 }); setGone(false); return; }
    let alive = true;
    (async () => {
      const { data: r } = await supabase.from("live_rooms").select("*").eq("id", roomId).maybeSingle();
      if (!alive) return;
      if (!r) { setGone(true); return; }
      setRoom(r);
      const { data: ps } = await supabase.from("live_players").select("*").eq("room_id", roomId);
      if (alive && ps) setPlayers(ps);
    })();
    return () => { alive = false; };
  }, [supabase, roomId]);

  const qIdx = room ? room.q_idx : -1;
  const status = room ? room.status : null;

  // Đếm số người đã trả lời câu hiện tại (chỉ host đọc được live_answers cả phòng)
  useEffect(() => {
    // Bao gồm cả 'reveal': sang màn đáp án vẫn giữ (và nạp lại được) số lượt đã
    // trả lời của câu vừa rồi. Không zero hóa ở đây — số đếm tự về 0 khi q_idx
    // đổi (tính lúc render bên dưới), zero ở đây sẽ xóa số đếm ngay khi reveal.
    if (!isHost || !roomId || qIdx < 0 || (status !== "question" && status !== "reveal")) return;
    let alive = true;
    (async () => {
      const { count } = await supabase
        .from("live_answers")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .eq("q_idx", qIdx);
      if (alive && typeof count === "number") setAns({ qIdx, n: count });
    })();
    return () => { alive = false; };
  }, [supabase, roomId, qIdx, status, isHost]);

  // Realtime
  useEffect(() => {
    if (!roomId) return;
    const ch = supabase
      .channel("live:" + roomId)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_rooms", filter: "id=eq." + roomId },
        (p) => setRoom(p.new))
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "live_rooms", filter: "id=eq." + roomId },
        () => setGone(true))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "live_players", filter: "room_id=eq." + roomId },
        (p) => {
          setPlayers((prev) => {
            if (p.eventType === "DELETE") return prev.filter((x) => x.id !== p.old.id);
            const i = prev.findIndex((x) => x.id === p.new.id);
            if (i === -1) return [...prev, p.new];
            const next = [...prev]; next[i] = p.new; return next;
          });
        })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "live_answers", filter: "room_id=eq." + roomId },
        (p) => {
          const qi = p.new.q_idx;
          setAns((a) => (a.qIdx === qi ? { qIdx: qi, n: a.n + 1 } : { qIdx: qi, n: 1 }));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, roomId]);

  // Tính khi render: câu hiện tại không khớp thì số đếm là 0, không cần effect.
  const answered = ans.qIdx === qIdx ? ans.n : 0;

  return { room, players, answered, gone };
}

/* ─────────────────────────────────────────────────────────────
   Hook: đồng hồ đếm ngược bám giờ SERVER (bù lệch giờ máy)
   ───────────────────────────────────────────────────────────── */
function useCountdown(room, offsetMs) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!room || room.status !== "question" || !room.q_started_at) { setLeft(0); return; }
    const startedAt = new Date(room.q_started_at).getTime();
    const limit = (room.q_seconds || 20) * 1000;
    const tick = () => {
      const now = Date.now() + offsetMs;
      setLeft(Math.max(0, Math.ceil((startedAt + limit - now) / 1000)));
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [room && room.id, room && room.q_idx, room && room.status, room && room.q_started_at, room && room.q_seconds, offsetMs]);
  return left;
}

/* ─────────────────────────────────────────────────────────────
   Hook: nhạc nền theo trạng thái phòng + tiếng tích tắc 5s cuối
   ───────────────────────────────────────────────────────────── */
function useArenaMusic(room, left, muteVersion) {
  const status = room ? room.status : null;
  const qIdx = room ? room.q_idx : -1;

  useEffect(() => {
    if (status === "lobby") arenaSound.loop("lobby");
    else if (status === "question") arenaSound.loop("question");
    else if (status === "scoreboard" || status === "reveal") arenaSound.loop("scoreboard");
    else arenaSound.loop(null);
  }, [status, muteVersion]);

  // Câu mới → chuông báo
  useEffect(() => {
    if (status === "question" && qIdx >= 0) arenaSound.play("newq");
  }, [qIdx, status === "question"]);

  // 5 giây cuối: nhạc gấp gáp + tích tắc mỗi giây
  useEffect(() => {
    const hurry = status === "question" && left > 0 && left <= 5;
    arenaSound.setHurry(hurry);
    if (hurry) arenaSound.play("tick");
  }, [left, status]);

  // Rời màn hình thì tắt nhạc
  useEffect(() => () => arenaSound.stopAll(), []);
}

/* ─────────────────────────────────────────────────────────────
   Mảnh trang trí
   ───────────────────────────────────────────────────────────── */

// Nền chuyển màu động cho các màn thi đấu
function Backdrop({ tint }) {
  return (
    <div className="ka-anim" style={{
      position: "absolute", inset: 0, borderRadius: 18, zIndex: 0, pointerEvents: "none",
      background: `linear-gradient(120deg, ${tint[0]}, ${tint[1]}, ${tint[2]}, ${tint[0]})`,
      backgroundSize: "300% 300%", animation: "kaDrift 14s ease infinite", opacity: 0.5,
    }} />
  );
}

function Confetti({ burst, count = 46 }) {
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: (i * 37) % 100,
      delay: ((i * 53) % 70) / 100,
      dur: 1.7 + ((i * 29) % 130) / 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 6 + ((i * 17) % 7),
      h: 9 + ((i * 11) % 9),
      round: i % 3 === 0,
    })),
    [burst, count]
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, pointerEvents: "none", overflow: "hidden" }}>
      {pieces.map((p, i) => (
        <span key={i} className="ka-anim" style={{
          position: "absolute", top: 0, left: p.left + "%", width: p.w, height: p.h,
          background: p.color, borderRadius: p.round ? "50%" : 2,
          animation: `kaFall ${p.dur}s linear ${p.delay}s forwards`,
        }} />
      ))}
    </div>
  );
}

// Đồng hồ vòng tròn
function TimerRing({ left, total, C, size = 78 }) {
  const R = (size - 12) / 2;
  const CIRC = 2 * Math.PI * R;
  const pct = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const danger = left <= 5;
  const col = danger ? "#e21b3c" : left <= 10 ? C.orange : C.gold;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.10)" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)}
          style={{ transition: "stroke-dashoffset .25s linear, stroke .3s" }} />
      </svg>
      <div className="ka-anim" style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36, fontWeight: 900, fontFamily: "'Be Vietnam Pro',sans-serif", color: col,
        animation: danger ? "kaHeart .55s ease-in-out infinite" : "none",
      }}>{left}</div>
    </div>
  );
}

function SoundButton({ muted, onToggle }) {
  return (
    <button onClick={onToggle} title={muted ? "Bật âm thanh" : "Tắt âm thanh"} style={{
      width: 38, height: 38, borderRadius: 12, flexShrink: 0, cursor: "pointer", fontSize: 16,
      background: muted ? "rgba(255,255,255,0.05)" : "rgba(201,168,76,0.16)",
      border: "1px solid " + (muted ? "rgba(255,255,255,0.12)" : "rgba(201,168,76,0.45)"),
      color: muted ? "rgba(255,255,255,0.35)" : "#C9A84C",
    }}>{muted ? "🔇" : "🔊"}</button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT CHÍNH
   ═══════════════════════════════════════════════════════════════ */
export default function LiveArena({ supabase, user, quizzes, canHost, onExit, C, ui }) {
  const { card, btnG, btnO, inp, hd } = ui;

  const [mode, setMode] = useState(null);      // null | 'host' | 'play'
  const [roomId, setRoomId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [offset, setOffset] = useState(0);     // giờ server − giờ máy (ms)
  const [restoring, setRestoring] = useState(true);
  const [muted, setMutedState] = useState(() => arenaSound.isMuted());

  const isHost = mode === "host";
  const { room, players, answered, gone } = useRoomChannel(supabase, roomId, isHost);

  const toggleSound = useCallback(() => {
    arenaSound.unlock();
    setMutedState(arenaSound.toggle());
  }, []);

  // ── Bù lệch đồng hồ ──
  useEffect(() => {
    let alive = true;
    (async () => {
      const t0 = Date.now();
      const { data, error } = await supabase.rpc("km_now");
      if (!alive || error || !data) return;
      const rtt = Date.now() - t0;
      setOffset(new Date(data).getTime() - (t0 + rtt / 2));
    })();
    return () => { alive = false; };
  }, [supabase]);

  // ── Khôi phục sau F5: quay lại đúng phòng đang chơi ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = sessionStorage.getItem(SS_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s && s.roomId && s.mode) {
            const { data } = await supabase.from("live_rooms").select("id,status").eq("id", s.roomId).maybeSingle();
            if (alive && data && data.status !== "ended") { setMode(s.mode); setRoomId(s.roomId); }
            else sessionStorage.removeItem(SS_KEY);
          }
        }
      } catch (e) { /* sessionStorage bị chặn → bỏ qua, chỉ mất khả năng khôi phục */ }
      if (alive) setRestoring(false);
    })();
    return () => { alive = false; };
  }, [supabase]);

  useEffect(() => {
    try {
      if (roomId && mode) sessionStorage.setItem(SS_KEY, JSON.stringify({ roomId, mode }));
      else sessionStorage.removeItem(SS_KEY);
    } catch (e) { }
  }, [roomId, mode]);

  // Phòng bị hủy khi đang ở trong → đá về menu
  useEffect(() => {
    if (gone) { setRoomId(null); setMode(null); setErr("Phòng đã bị đóng."); }
  }, [gone]);

  const leave = useCallback(() => { arenaSound.stopAll(); setRoomId(null); setMode(null); setErr(""); }, []);

  const rpc = useCallback(async (fn, args) => {
    setErr("");
    const { data, error } = await supabase.rpc(fn, args || {});
    if (error) { setErr(error.message || "Có lỗi xảy ra"); return null; }
    return data;
  }, [supabase]);

  const shell = (children) => (
    <div style={{ animation: "fadeIn .4s" }}>
      <style>{ARENA_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
        <h2 style={{ ...hd(23), display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ka-anim" style={{ animation: "kaFloat 3s ease-in-out infinite", display: "inline-block" }}>🎮</span>
          {"Đấu Trường"}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SoundButton muted={muted} onToggle={toggleSound} />
          {!roomId && <button onClick={onExit} style={btnO}>{"← Dashboard"}</button>}
        </div>
      </div>
      {err && (
        <div className="ka-anim" style={{ ...card, background: C.red + "12", border: "1px solid " + C.red + "55", padding: 12, display: "flex", justifyContent: "space-between", gap: 10, animation: "kaShake .45s" }}>
          <span style={{ color: C.red, fontSize: 13 }}>{"⚠️ " + err}</span>
          <button onClick={() => setErr("")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>{"✕"}</button>
        </div>
      )}
      {children}
    </div>
  );

  if (restoring) return shell(<div style={{ ...card, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>{"Đang tải…"}</div>);

  // ── MENU ──
  if (!mode) {
    const enter = (m) => { arenaSound.unlock(); arenaSound.play("submit"); setMode(m); };
    return shell(
      <div>
        <div style={{ ...card, position: "relative", overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
          <Backdrop tint={["rgba(226,27,60,.20)", "rgba(123,47,247,.20)", "rgba(19,104,206,.20)"]} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ ...hd(17), marginBottom: 6 }}>{"Thi đấu trực tiếp — cả phòng cùng lúc"}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", lineHeight: 1.75 }}>
              {"Host chiếu câu hỏi lên màn hình lớn, mọi người bấm đáp án trên điện thoại. Trả lời đúng và nhanh được nhiều điểm hơn — trả lời đúng liên tiếp còn được cộng thêm."}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          <button className="ka-tile" onClick={() => enter("play")} style={{
            borderRadius: 18, padding: "26px 20px", textAlign: "left", width: "100%", cursor: "pointer", color: "#fff",
            background: "linear-gradient(145deg,#1368ce,#0d4a94)", border: "none",
            boxShadow: "0 6px 0 #0a3a75, 0 12px 26px rgba(0,0,0,.35)",
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{"📱"}</div>
            <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 3, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{"Tham Gia"}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{"Nhập mã PIN 6 số từ host"}</div>
          </button>
          {canHost && (
            <button className="ka-tile" onClick={() => enter("host")} style={{
              borderRadius: 18, padding: "26px 20px", textAlign: "left", width: "100%", cursor: "pointer", color: "#fff",
              background: "linear-gradient(145deg,#7b2ff7,#5820b0)", border: "none",
              boxShadow: "0 6px 0 #3f1580, 0 12px 26px rgba(0,0,0,.35)",
            }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>{"🎬"}</div>
              <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 3, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{"Tổ Chức Trận"}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{"Mở phòng & điều khiển"}</div>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── HOST ──
  if (isHost) {
    if (!roomId) return shell(<HostSetup {...{ quizzes, C, ui, busy, setBusy, rpc, onCreated: setRoomId, onBack: leave }} />);
    if (!room) return shell(<div style={{ ...card, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>{"Đang mở phòng…"}</div>);
    return shell(<HostRoom {...{ room, players, answered, offset, C, ui, rpc, onLeave: leave, muted }} />);
  }

  // ── PLAYER ──
  if (!roomId) return shell(<PlayerJoin {...{ C, ui, busy, setBusy, rpc, onJoined: setRoomId, onBack: leave }} />);
  if (!room) return shell(<div style={{ ...card, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>{"Đang vào phòng…"}</div>);
  return shell(<PlayerRoom {...{ supabase, user, room, players, offset, C, ui, rpc, onLeave: leave, muted }} />);
}

/* ═══════════════════════════════════════════════════════════════
   HOST — Thiết lập & tạo phòng
   ═══════════════════════════════════════════════════════════════ */
function HostSetup({ quizzes, C, ui, busy, setBusy, rpc, onCreated, onBack }) {
  const { card, btnG, btnO, inp, hd } = ui;
  const usable = (quizzes || []).filter((q) => !q.hidden && playableCount(q) > 0);
  const [quizId, setQuizId] = useState(usable.length ? usable[0].id : "");
  const [secs, setSecs] = useState(20);
  const [projector, setProjector] = useState(true);

  const picked = usable.find((q) => q.id === quizId);

  const create = async () => {
    if (!quizId || busy) return;
    arenaSound.unlock();
    setBusy(true);
    const r = await rpc("live_create_room", { p_quiz_id: quizId, p_seconds: secs, p_projector: projector });
    setBusy(false);
    if (r && r.id) { arenaSound.play("start"); onCreated(r.id); }
  };

  if (usable.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>{"📭"}</div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.7 }}>
          {"Chưa có đề nào chơi live được. Đấu Trường chỉ dùng câu trắc nghiệm và đúng/sai — câu tự luận cần AI chấm nên không hợp thi đấu tốc độ."}
        </div>
        <button onClick={onBack} style={{ ...btnO, marginTop: 16 }}>{"← Quay lại"}</button>
      </div>
    );
  }

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, letterSpacing: 1 }}>{"ĐỀ THI ĐẤU"}</div>
        <select value={quizId} onChange={(e) => setQuizId(e.target.value)} style={{ ...inp, marginBottom: 4 }}>
          {usable.map((q) => (
            <option key={q.id} value={q.id} style={{ background: C.bg2 }}>
              {q.title + " — " + playableCount(q) + " câu"}
            </option>
          ))}
        </select>
        {picked && playableCount(picked) < (picked.questions || []).length && (
          <div style={{ fontSize: 11, color: C.orange, marginTop: 6 }}>
            {"ℹ️ Bỏ qua " + ((picked.questions || []).length - playableCount(picked)) + " câu tự luận — không chơi live được."}
          </div>
        )}
        {picked && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
            {"⏱ Ước tính " + Math.ceil(playableCount(picked) * (secs + 12) / 60) + " phút cho cả trận"}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 1 }}>{"THỜI GIAN MỖI CÂU"}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[10, 20, 30, 60].map((s) => (
            <button key={s} className="ka-tile" onClick={() => { arenaSound.unlock(); setSecs(s); }} style={{
              padding: "11px 20px", borderRadius: 12, cursor: "pointer", fontWeight: 800, fontSize: 14,
              background: secs === s ? "linear-gradient(145deg,#0C7B6F,#0A6359)" : "rgba(255,255,255,0.05)",
              color: secs === s ? "#fff" : "rgba(255,255,255,0.5)",
              border: "none",
              boxShadow: secs === s ? "0 4px 0 #074840" : "0 2px 0 rgba(255,255,255,0.06)",
            }}>{s + "s"}</button>
          ))}
        </div>
      </div>

      <div style={card}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={projector} onChange={(e) => setProjector(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: C.teal }} />
          <span>
            <span style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>{"Chế độ máy chiếu"}</span>
            <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, lineHeight: 1.6 }}>
              {projector
                ? "BẬT: câu hỏi chỉ hiện trên màn hình host (chiếu lên máy chiếu). Điện thoại người chơi chỉ có 4 ô màu để bấm — giống Kahoot."
                : "TẮT: người chơi đọc đầy đủ câu hỏi trên máy mình. Dùng khi đào tạo online, không có máy chiếu."}
            </span>
          </span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack} style={btnO}>{"← Quay lại"}</button>
        <button className="ka-tile" onClick={create} disabled={busy} style={{
          flex: 1, borderRadius: 14, padding: "16px 24px", border: "none", cursor: "pointer",
          background: "linear-gradient(145deg,#7b2ff7,#5820b0)", color: "#fff", fontSize: 17, fontWeight: 900,
          boxShadow: "0 5px 0 #3f1580", opacity: busy ? 0.5 : 1, fontFamily: "'Be Vietnam Pro',sans-serif",
        }}>
          {busy ? "Đang tạo phòng…" : "🎬 MỞ PHÒNG"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HOST — Phòng thi đấu
   ═══════════════════════════════════════════════════════════════ */
function HostRoom({ room, players, answered, offset, C, ui, rpc, onLeave, muted }) {
  const { card, btnO, hd } = ui;
  const left = useCountdown(room, offset);
  const ranked = rankPlayers(players);
  const autoRef = useRef(null);   // chặn gọi live_reveal nhiều lần cho cùng 1 câu
  const seenRef = useRef(0);      // số người đã thấy, để kêu tiếng khi có người mới

  useArenaMusic(room, left, muted);

  // Có người mới vào phòng → tiếng "blip"
  useEffect(() => {
    if (players.length > seenRef.current && room.status === "lobby") arenaSound.play("join");
    seenRef.current = players.length;
  }, [players.length, room.status]);

  // Hiện đáp án → tiếng báo
  useEffect(() => {
    if (room.status === "reveal") arenaSound.play("reveal");
    if (room.status === "ended") { arenaSound.loop(null); arenaSound.play("podium"); }
  }, [room.status]);

  // Tự hiện đáp án khi HẾT GIỜ.
  // Hạn được tính thẳng từ q_started_at (mốc server), KHÔNG dùng biến đếm ngược
  // hiển thị — biến đó ở lần render đầu của mỗi câu vẫn còn là 0, dùng nó sẽ
  // khiến trận nhảy sang màn đáp án ngay khi vừa bắt đầu.
  useEffect(() => {
    if (room.status !== "question" || !room.q_started_at) return;
    const key = room.id + ":" + room.q_idx;
    const fire = () => {
      if (autoRef.current === key) return;
      autoRef.current = key;
      rpc("live_reveal", { p_room_id: room.id });
    };
    const deadline = new Date(room.q_started_at).getTime() + (room.q_seconds || 20) * 1000;
    const delay = deadline - (Date.now() + offset);
    if (delay <= 0) { fire(); return; }
    const t = setTimeout(fire, delay);
    return () => clearTimeout(t);
  }, [room.status, room.q_idx, room.id, room.q_started_at, room.q_seconds, offset, rpc]);

  // Tự hiện đáp án khi MỌI NGƯỜI đã trả lời xong (không phải chờ hết giờ).
  useEffect(() => {
    if (room.status !== "question") return;
    const key = room.id + ":" + room.q_idx;
    if (autoRef.current === key) return;
    if (players.length > 0 && answered >= players.length) {
      autoRef.current = key;
      rpc("live_reveal", { p_room_id: room.id });
    }
  }, [room.status, room.q_idx, room.id, answered, players.length, rpc]);

  const endRoom = async () => {
    if (!window.confirm("Kết thúc trận đấu và cộng XP cho người chơi?")) return;
    await rpc("live_end", { p_room_id: room.id });
  };
  const cancelRoom = async () => {
    if (!window.confirm("Hủy phòng này?")) return;
    await rpc("live_cancel_room", { p_room_id: room.id });
    onLeave();
  };

  const bigBtn = (label, color, shadow, onClick, extra) => (
    <button className="ka-tile" onClick={onClick} style={{
      borderRadius: 14, padding: "16px 22px", border: "none", cursor: "pointer", color: "#fff",
      background: color, fontSize: 16, fontWeight: 900, boxShadow: "0 5px 0 " + shadow,
      fontFamily: "'Be Vietnam Pro',sans-serif", ...extra,
    }}>{label}</button>
  );

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)" }}>
        {room.quiz_title}
        {room.q_idx >= 0 && <b style={{ color: C.gold }}>{" · Câu " + (room.q_idx + 1) + "/" + room.q_count}</b>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)", fontWeight: 700, letterSpacing: 1 }}>
          {"PIN " + room.pin}
        </span>
        <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, background: C.teal + "2a", color: "#4fd6c4", fontWeight: 800 }}>
          {"👥 " + players.length}
        </span>
      </div>
    </div>
  );

  /* ── LOBBY ── */
  if (room.status === "lobby") {
    return (
      <div>
        {header}
        <div style={{ ...card, position: "relative", overflow: "hidden", textAlign: "center", padding: "34px 20px", border: "1px solid rgba(255,255,255,0.14)" }}>
          <Backdrop tint={["rgba(123,47,247,.28)", "rgba(19,104,206,.22)", "rgba(12,123,111,.28)"]} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", letterSpacing: 4, marginBottom: 10 }}>{"MÃ VÀO PHÒNG"}</div>
            <div className="ka-anim" style={{
              fontSize: 68, fontWeight: 900, letterSpacing: 14, color: "#fff", lineHeight: 1.05,
              fontFamily: "'Be Vietnam Pro',monospace", animation: "kaGlow 2.4s ease-in-out infinite",
            }}>{room.pin}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", marginTop: 14, lineHeight: 1.75 }}>
              {"Nhân sự mở app → 🎮 Đấu Trường → Tham Gia → nhập mã trên"}
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12, letterSpacing: 1 }}>
            {"ĐÃ VÀO PHÒNG (" + players.length + ")"}
          </div>
          {players.length === 0 ? (
            <div style={{ textAlign: "center", padding: 26, color: "rgba(255,255,255,0.28)", fontSize: 13 }}>
              <div className="ka-anim" style={{ fontSize: 30, marginBottom: 8, animation: "kaFloat 2.2s ease-in-out infinite" }}>{"👀"}</div>
              {"Đang chờ người chơi…"}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {players.map((p, i) => (
                <span key={p.id} className="ka-anim" style={{
                  padding: "10px 16px", borderRadius: 22, color: "#fff", fontSize: 13.5, fontWeight: 700,
                  background: `linear-gradient(145deg, ${OPT[i % OPT.length].bg}, ${OPT[i % OPT.length].dark})`,
                  boxShadow: "0 3px 0 rgba(0,0,0,.28)", animation: "kaPopIn .38s cubic-bezier(.34,1.56,.64,1)",
                }}>
                  {p.name}<span style={{ opacity: 0.6, fontWeight: 500 }}>{" · " + p.dept}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={cancelRoom} style={btnO}>{"✕ Hủy phòng"}</button>
          <button className="ka-tile" onClick={() => { arenaSound.unlock(); arenaSound.play("start"); rpc("live_start", { p_room_id: room.id }); }}
            disabled={players.length === 0} style={{
              flex: 1, borderRadius: 14, padding: "16px 22px", border: "none", cursor: "pointer", color: "#fff",
              background: players.length === 0 ? "rgba(255,255,255,.08)" : "linear-gradient(145deg,#26890c,#1a6108)",
              fontSize: 17, fontWeight: 900, boxShadow: players.length === 0 ? "none" : "0 5px 0 #124505",
              opacity: players.length === 0 ? 0.45 : 1, fontFamily: "'Be Vietnam Pro',sans-serif",
            }}>
            {"▶ BẮT ĐẦU (" + room.q_count + " câu)"}
          </button>
        </div>
      </div>
    );
  }

  /* ── ĐANG HỎI / HIỆN ĐÁP ÁN ── */
  if (room.status === "question" || room.status === "reveal") {
    const q = room.q_public || { q: "", opts: [], type: "mc" };
    const rev = room.q_reveal;
    const opts = q.opts || [];
    const counts = (rev && rev.counts) || [];
    const maxCount = Math.max(1, ...counts.map((n) => Number(n) || 0));
    const total = room.q_seconds || 20;
    const pctAnswered = players.length ? Math.round((answered / players.length) * 100) : 0;

    return (
      <div>
        {header}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          {rev
            ? <div style={{ width: 78, height: 78, borderRadius: "50%", background: "rgba(255,255,255,.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 }}>{"✅"}</div>
            : <TimerRing left={left} total={total} C={C} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 6, fontWeight: 600 }}>
              {rev ? "Đã chốt " + answered + " lượt trả lời" : "✋ " + answered + "/" + players.length + " đã trả lời"}
            </div>
            <div style={{ height: 10, background: "rgba(0,0,0,.32)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: (rev ? 100 : pctAnswered) + "%", borderRadius: 6,
                background: "linear-gradient(90deg,#26890c,#7bd651)", transition: "width .4s cubic-bezier(.34,1.4,.64,1)",
              }} />
            </div>
          </div>
        </div>

        <div style={{ ...card, position: "relative", overflow: "hidden", padding: "30px 22px", textAlign: "center", border: "1px solid rgba(255,255,255,0.14)" }}>
          <Backdrop tint={["rgba(19,104,206,.22)", "rgba(123,47,247,.20)", "rgba(226,27,60,.18)"]} />
          <h3 key={room.q_idx} className="ka-anim" style={{ ...hd(25), lineHeight: 1.45, margin: 0, position: "relative", zIndex: 1, animation: "kaPop .4s cubic-bezier(.34,1.56,.64,1)" }}>{q.q}</h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: opts.length <= 2 ? "repeat(auto-fit,minmax(240px,1fr))" : "repeat(auto-fit,minmax(250px,1fr))", gap: 12, marginBottom: 14 }}>
          {opts.map((o, i) => {
            const s = OPT[i % OPT.length];
            const isAns = rev && Number(rev.ans) === i;
            const dim = rev && !isAns;
            return (
              <div key={i} className="ka-anim" style={{
                background: `linear-gradient(145deg, ${s.bg}, ${s.dark})`, borderRadius: 16, padding: "18px 20px",
                position: "relative", overflow: "hidden", color: "#fff",
                opacity: dim ? 0.28 : 1, transform: isAns ? "scale(1.03)" : "none",
                boxShadow: isAns ? "0 0 0 4px #fff, 0 10px 30px rgba(0,0,0,.4)" : "0 5px 0 rgba(0,0,0,.28)",
                transition: "all .4s cubic-bezier(.34,1.4,.64,1)",
                animation: isAns ? "kaHeart .6s ease-in-out 2" : "none",
              }}>
                <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
                  <span style={{ fontSize: 26, flexShrink: 0, opacity: 0.9 }}>{s.icon}</span>
                  <span style={{ fontSize: 17, fontWeight: 800, textAlign: "left", flex: 1, lineHeight: 1.4 }}>{o}</span>
                  {isAns && <span style={{ fontSize: 26 }}>{"✅"}</span>}
                </div>
                {rev && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ height: 8, background: "rgba(0,0,0,0.32)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: (((Number(counts[i]) || 0) / maxCount) * 100) + "%", background: "#fff", borderRadius: 4, transition: "width .7s cubic-bezier(.34,1.3,.64,1)" }} />
                    </div>
                    <div style={{ fontSize: 12, marginTop: 5, fontWeight: 800, opacity: 0.92 }}>
                      {(Number(counts[i]) || 0) + " người"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {rev && (
          <div>
            {rev.exp ? (
              <div className="ka-anim" style={{ ...card, background: C.green + "0e", border: "1px solid " + C.green + "44", animation: "kaSlideUp .4s" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#5fdb7d", marginBottom: 5, letterSpacing: 1 }}>{"💡 GIẢI THÍCH"}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.78)", lineHeight: 1.75 }}>{rev.exp}</div>
              </div>
            ) : null}
            {Number(rev.noAnswer) > 0 && (
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.32)", marginBottom: 10 }}>
                {Number(rev.noAnswer) + " người không trả lời kịp"}
              </div>
            )}
            {bigBtn("🏆 XEM BẢNG XẾP HẠNG", "linear-gradient(145deg,#C9A84C,#a3812f)", "#7a5f1f",
              () => rpc("live_scoreboard", { p_room_id: room.id }), { width: "100%", color: "#1A3A4A" })}
          </div>
        )}
        {!rev && (
          <button onClick={() => rpc("live_reveal", { p_room_id: room.id })} style={{ ...btnO, width: "100%" }}>
            {"⏭ Hiện đáp án ngay"}
          </button>
        )}
      </div>
    );
  }

  /* ── BẢNG XẾP HẠNG GIỮA TRẬN ── */
  if (room.status === "scoreboard") {
    const isLast = room.q_idx + 1 >= room.q_count;
    return (
      <div>
        {header}
        <ScoreTable ranked={ranked} C={C} ui={ui} limit={8} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={endRoom} style={btnO}>{"🏁 Kết thúc"}</button>
          {bigBtn(isLast ? "🏁 CHỐT KẾT QUẢ CUỐI" : "▶ CÂU " + (room.q_idx + 2) + "/" + room.q_count,
            "linear-gradient(145deg,#26890c,#1a6108)", "#124505",
            () => rpc("live_next", { p_room_id: room.id }), { flex: 1 })}
        </div>
      </div>
    );
  }

  /* ── KẾT THÚC ── */
  return (
    <div>
      <Confetti burst="host-end" />
      {header}
      <Podium ranked={ranked} C={C} ui={ui} />
      <ScoreTable ranked={ranked} C={C} ui={ui} limit={100} showXp />
      {bigBtn("✓ XONG", "linear-gradient(145deg,#0C7B6F,#0A6359)", "#074840", onLeave, { width: "100%" })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PLAYER — Nhập PIN
   ═══════════════════════════════════════════════════════════════ */
function PlayerJoin({ C, ui, busy, setBusy, rpc, onJoined, onBack }) {
  const { card, btnO, hd, inp } = ui;
  const [pin, setPin] = useState("");

  const join = async () => {
    if (pin.length !== 6 || busy) return;
    arenaSound.unlock();
    setBusy(true);
    const r = await rpc("live_join", { p_pin: pin });
    setBusy(false);
    if (r && r.id) { arenaSound.play("join"); onJoined(r.id); }
  };

  return (
    <div>
      <div style={{ ...card, position: "relative", overflow: "hidden", textAlign: "center", padding: "32px 20px", border: "1px solid rgba(255,255,255,0.14)" }}>
        <Backdrop tint={["rgba(19,104,206,.24)", "rgba(12,123,111,.22)", "rgba(123,47,247,.22)"]} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="ka-anim" style={{ fontSize: 46, marginBottom: 14, animation: "kaFloat 2.6s ease-in-out infinite" }}>{"🎯"}</div>
          <div style={{ ...hd(20), marginBottom: 6 }}>{"Nhập mã PIN"}</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{"Mã 6 số hiển thị trên màn hình của host"}</div>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter") join(); }}
            onFocus={() => arenaSound.unlock()}
            inputMode="numeric" placeholder="000000" autoFocus
            style={{ ...inp, textAlign: "center", fontSize: 38, fontWeight: 900, letterSpacing: 14, padding: "18px 10px", fontFamily: "monospace", borderRadius: 14 }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack} style={btnO}>{"← Quay lại"}</button>
        <button className="ka-tile" onClick={join} disabled={pin.length !== 6 || busy} style={{
          flex: 1, borderRadius: 14, padding: "16px 22px", border: "none", cursor: "pointer", color: "#fff",
          background: pin.length === 6 ? "linear-gradient(145deg,#1368ce,#0d4a94)" : "rgba(255,255,255,.08)",
          fontSize: 17, fontWeight: 900, boxShadow: pin.length === 6 ? "0 5px 0 #0a3a75" : "none",
          opacity: pin.length === 6 && !busy ? 1 : 0.45, fontFamily: "'Be Vietnam Pro',sans-serif",
        }}>
          {busy ? "Đang vào…" : "VÀO PHÒNG →"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PLAYER — Trong phòng
   ═══════════════════════════════════════════════════════════════ */
function PlayerRoom({ supabase, user, room, players, offset, C, ui, rpc, onLeave, muted }) {
  const { card, btnO, hd } = ui;
  const left = useCountdown(room, offset);
  const [choice, setChoice] = useState(null);   // lựa chọn của câu hiện tại
  const [sending, setSending] = useState(false);
  const [myAns, setMyAns] = useState(null);     // kết quả server trả về khi reveal
  const ranked = rankPlayers(players);
  const myRank = ranked.findIndex((p) => p.emp_id === user.id);
  const me = myRank >= 0 ? ranked[myRank] : null;

  useArenaMusic(room, left, muted);

  // Câu mới → xóa lựa chọn cũ
  useEffect(() => { setChoice(null); setMyAns(null); }, [room.q_idx]);

  // Khi host hiện đáp án → lấy dòng trả lời của CHÍNH MÌNH để biết đúng/sai + điểm.
  // (RLS chỉ cho đọc dòng của mình → không dò được của người khác.)
  useEffect(() => {
    if (room.status !== "reveal" || room.q_idx < 0) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from("live_answers").select("choice,correct,points,ms")
        .eq("room_id", room.id).eq("emp_id", user.id).eq("q_idx", room.q_idx).maybeSingle();
      if (alive) setMyAns(data || null);
    })();
    return () => { alive = false; };
  }, [supabase, room.status, room.q_idx, room.id, user.id]);

  // Có kết quả câu → phát tiếng tương ứng
  const sfxRef = useRef(null);
  useEffect(() => {
    if (room.status !== "reveal" || !myAns) return;
    const key = room.id + ":" + room.q_idx;
    if (sfxRef.current === key) return;
    sfxRef.current = key;
    arenaSound.play(myAns.correct ? "correct" : myAns.choice < 0 ? "timeup" : "wrong");
  }, [room.status, room.q_idx, room.id, myAns]);

  useEffect(() => {
    if (room.status === "ended") { arenaSound.loop(null); arenaSound.play("podium"); }
  }, [room.status]);

  const submit = async (i) => {
    if (choice !== null || sending || room.status !== "question") return;
    arenaSound.unlock();
    arenaSound.play("submit");
    setChoice(i); setSending(true);
    const res = await rpc("live_submit_answer", { p_room_id: room.id, p_choice: i });
    setSending(false);
    // Server từ chối (hết giờ / đã trả lời) → mở lại nút để người chơi không bị kẹt
    if (res && res.ok === false && res.reason === "closed") setChoice(null);
  };

  const scoreBar = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
      <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>{user.name}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {me && me.streak >= 2 && (
          <span className="ka-anim" style={{ fontSize: 12, padding: "5px 11px", borderRadius: 20, background: "linear-gradient(145deg,#e67e22,#c0392b)", color: "#fff", fontWeight: 800, animation: "kaHeart 1s ease-in-out infinite" }}>
            {"🔥 " + me.streak}
          </span>
        )}
        {me && <span style={{ fontSize: 12.5, padding: "5px 12px", borderRadius: 20, background: C.gold + "2a", color: C.goldL, fontWeight: 800 }}>{me.score + " điểm"}</span>}
        {myRank >= 0 && <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>{"Hạng " + (myRank + 1) + "/" + players.length}</span>}
      </div>
    </div>
  );

  /* ── CHỜ BẮT ĐẦU ── */
  if (room.status === "lobby") {
    return (
      <div>
        {scoreBar}
        <div style={{ ...card, position: "relative", overflow: "hidden", textAlign: "center", padding: "44px 20px", border: "1px solid rgba(255,255,255,0.14)" }}>
          <Backdrop tint={["rgba(12,123,111,.26)", "rgba(19,104,206,.22)", "rgba(123,47,247,.24)"]} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="ka-anim" style={{ fontSize: 52, marginBottom: 16, animation: "kaFloat 2s ease-in-out infinite" }}>{"⏳"}</div>
            <div style={{ ...hd(21), marginBottom: 8 }}>{"Đã vào phòng!"}</div>
            <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.75 }}>
              {"Đang chờ host bắt đầu · " + players.length + " người trong phòng"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginTop: 16 }}>{room.quiz_title + " · " + room.q_count + " câu"}</div>
          </div>
        </div>
        <button onClick={onLeave} style={{ ...btnO, width: "100%" }}>{"← Rời phòng"}</button>
      </div>
    );
  }

  /* ── ĐANG TRẢ LỜI ── */
  if (room.status === "question") {
    const q = room.q_public || { q: "", opts: [], type: "mc" };
    const opts = q.opts || [];
    const total = room.q_seconds || 20;
    return (
      <div>
        {scoreBar}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <TimerRing left={left} total={total} C={C} size={64} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{"Câu " + (room.q_idx + 1) + "/" + room.q_count}</div>
            <div style={{ height: 7, background: "rgba(0,0,0,.3)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: (((room.q_idx + 1) / room.q_count) * 100) + "%", background: "linear-gradient(90deg,#0C7B6F,#4fd6c4)", borderRadius: 4, transition: "width .4s" }} />
            </div>
          </div>
        </div>

        {/* Chế độ máy chiếu: KHÔNG hiện nội dung câu hỏi trên máy người chơi */}
        {!room.projector && (
          <div style={{ ...card, position: "relative", overflow: "hidden", padding: "20px 18px" }}>
            <Backdrop tint={["rgba(19,104,206,.20)", "rgba(123,47,247,.18)", "rgba(226,27,60,.16)"]} />
            <h3 key={room.q_idx} className="ka-anim" style={{ ...hd(18), lineHeight: 1.5, margin: 0, position: "relative", zIndex: 1, animation: "kaPop .35s cubic-bezier(.34,1.56,.64,1)" }}>{q.q}</h3>
          </div>
        )}
        {room.projector && choice === null && (
          <div style={{ ...card, textAlign: "center", padding: "14px 16px" }}>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.4)" }}>{"👀 Nhìn màn hình lớn — chọn đáp án bên dưới"}</div>
          </div>
        )}

        {choice !== null ? (
          <div className="ka-anim" style={{
            ...card, textAlign: "center", padding: "44px 20px", border: "none",
            background: `linear-gradient(145deg, ${OPT[choice % OPT.length].bg}, ${OPT[choice % OPT.length].dark})`,
            boxShadow: "0 6px 0 rgba(0,0,0,.3)", animation: "kaPop .4s cubic-bezier(.34,1.56,.64,1)",
          }}>
            <div className="ka-anim" style={{ fontSize: 52, marginBottom: 12, animation: "kaFloat 1.8s ease-in-out infinite" }}>{OPT[choice % OPT.length].icon}</div>
            <div style={{ fontSize: 21, fontWeight: 900, color: "#fff", marginBottom: 6, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{"Đã gửi!"}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.75)" }}>{"Chờ mọi người trả lời xong…"}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: opts.length <= 2 ? "1fr 1fr" : "1fr 1fr", gap: 12 }}>
            {opts.map((o, i) => {
              const s = OPT[i % OPT.length];
              return (
                <button key={i} className="ka-tile" onClick={() => submit(i)} disabled={sending} style={{
                  background: `linear-gradient(145deg, ${s.bg}, ${s.dark})`, border: "none", borderRadius: 18,
                  padding: room.projector ? "38px 16px" : "22px 16px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  color: "#fff", fontWeight: 900, minHeight: room.projector ? 112 : 74,
                  boxShadow: "0 6px 0 rgba(0,0,0,.30), 0 10px 22px rgba(0,0,0,.25)",
                }}>
                  <span style={{ fontSize: room.projector ? 40 : 28 }}>{s.icon}</span>
                  {!room.projector && <span style={{ textAlign: "left", flex: 1, fontSize: 14.5, lineHeight: 1.35 }}>{o}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ── XEM ĐÚNG/SAI ── */
  if (room.status === "reveal") {
    const rev = room.q_reveal || {};
    const q = room.q_public || { opts: [] };
    // Chưa lấy được dòng trả lời của mình → hiện trạng thái chờ, KHÔNG đoán
    // là "sai" (đoán bừa sẽ báo sai cho người trả lời đúng).
    if (myAns === null && choice !== null) {
      return (
        <div>
          {scoreBar}
          <div style={{ ...card, textAlign: "center", padding: "40px 20px" }}>
            <div className="ka-anim" style={{ fontSize: 42, marginBottom: 12, animation: "kaSpin 1.1s linear infinite", display: "inline-block" }}>{"⏳"}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{"Đang lấy kết quả…"}</div>
          </div>
        </div>
      );
    }
    const answeredIt = myAns && myAns.choice >= 0;
    const ok = myAns && myAns.correct;
    const correctLabel = (q.opts || [])[Number(rev.ans)] || "";
    return (
      <div>
        {ok && <Confetti burst={room.q_idx} count={38} />}
        {scoreBar}
        <div className="ka-anim" style={{
          ...card, textAlign: "center", padding: "40px 20px", border: "none",
          background: ok
            ? "linear-gradient(145deg,#26890c,#1a6108)"
            : answeredIt ? "linear-gradient(145deg,#e21b3c,#a3132c)" : "linear-gradient(145deg,#6b6b6b,#454545)",
          boxShadow: "0 6px 0 rgba(0,0,0,.3)",
          animation: ok ? "kaPop .45s cubic-bezier(.34,1.56,.64,1)" : "kaShake .5s",
        }}>
          <div className="ka-anim" style={{ fontSize: 60, marginBottom: 12, animation: ok ? "kaHeart .7s ease-in-out 3" : "none" }}>
            {ok ? "🎉" : answeredIt ? "😕" : "⏰"}
          </div>
          <div style={{ fontSize: 27, fontWeight: 900, color: "#fff", marginBottom: 8, fontFamily: "'Be Vietnam Pro',sans-serif" }}>
            {ok ? "Chính xác!" : answeredIt ? "Chưa đúng" : "Hết giờ mất rồi"}
          </div>
          {ok && myAns ? (
            <div>
              <div style={{ fontSize: 22, color: "#fff", fontWeight: 900 }}>{"+" + myAns.points + " điểm"}</div>
              {me && me.streak >= 2 && <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", marginTop: 6 }}>{"🔥 Chuỗi " + me.streak + " câu đúng liên tiếp"}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{"Đáp án đúng: " + correctLabel}</div>
          )}
        </div>
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)" }}>{"Đang chờ host chuyển màn…"}</div>
        </div>
      </div>
    );
  }

  /* ── BẢNG XẾP HẠNG GIỮA TRẬN ── */
  if (room.status === "scoreboard") {
    return (
      <div>
        {scoreBar}
        <ScoreTable ranked={ranked} C={C} ui={ui} limit={8} highlightId={user.id} />
        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)" }}>{"Đang chờ host sang câu tiếp…"}</div>
        </div>
      </div>
    );
  }

  /* ── KẾT THÚC ── */
  return (
    <div>
      <Confetti burst="player-end" />
      <Podium ranked={ranked} C={C} ui={ui} />
      {me && (
        <div className="ka-anim" style={{
          ...card, textAlign: "center", border: "none", padding: "22px 18px",
          background: myRank === 0 ? "linear-gradient(145deg,#C9A84C,#a3812f)" : "linear-gradient(145deg,#0C7B6F,#0A6359)",
          boxShadow: "0 6px 0 rgba(0,0,0,.3)", animation: "kaSlideUp .5s",
        }}>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", marginBottom: 6, letterSpacing: 1 }}>{"KẾT QUẢ CỦA BẠN"}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "'Be Vietnam Pro',sans-serif" }}>
            {"Hạng " + (myRank + 1) + "/" + players.length}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", opacity: 0.92, marginTop: 2 }}>{me.score + " điểm"}</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.75)", marginTop: 8 }}>
            {me.correct_count + "/" + room.q_count + " câu đúng"}
            {me.xp_gained > 0 ? " · +" + me.xp_gained + " XP" : ""}
          </div>
        </div>
      )}
      <ScoreTable ranked={ranked} C={C} ui={ui} limit={100} highlightId={user.id} showXp />
      <button className="ka-tile" onClick={onLeave} style={{
        width: "100%", borderRadius: 14, padding: "16px 22px", border: "none", cursor: "pointer", color: "#fff",
        background: "linear-gradient(145deg,#0C7B6F,#0A6359)", fontSize: 17, fontWeight: 900,
        boxShadow: "0 5px 0 #074840", fontFamily: "'Be Vietnam Pro',sans-serif",
      }}>{"✓ XONG"}</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DÙNG CHUNG
   ═══════════════════════════════════════════════════════════════ */
function ScoreTable({ ranked, C, ui, limit, highlightId, showXp }) {
  const { card } = ui;
  if (ranked.length === 0) {
    return <div style={{ ...card, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>{"Chưa có người chơi"}</div>;
  }
  const top = ranked[0] ? ranked[0].score : 0;
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12, letterSpacing: 1 }}>{"🏆 BẢNG XẾP HẠNG"}</div>
      {ranked.slice(0, limit).map((p, i) => {
        const mine = highlightId && p.emp_id === highlightId;
        const w = top > 0 ? Math.max(6, (p.score / top) * 100) : 6;
        return (
          <div key={p.id} className="ka-anim" style={{
            position: "relative", overflow: "hidden",
            display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 12, marginBottom: 6,
            background: mine ? "rgba(201,168,76,.16)" : "rgba(255,255,255,0.035)",
            border: mine ? "1px solid rgba(201,168,76,.55)" : "1px solid transparent",
            animation: "kaSlideUp .35s both", animationDelay: (i * 0.045) + "s",
          }}>
            {/* thanh điểm chạy nền */}
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: w + "%", borderRadius: 12,
              background: i === 0 ? "linear-gradient(90deg,rgba(201,168,76,.30),rgba(201,168,76,.04))"
                : "linear-gradient(90deg,rgba(12,123,111,.26),rgba(12,123,111,.02))",
              transition: "width .8s cubic-bezier(.34,1.3,.64,1)", pointerEvents: "none",
            }} />
            <span style={{ position: "relative", width: 28, textAlign: "center", fontSize: i < 3 ? 19 : 13, fontWeight: 800, color: "rgba(255,255,255,0.45)" }}>
              {i < 3 ? MEDAL[i] : i + 1}
            </span>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.name}{mine ? " (bạn)" : ""}
              </div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.32)" }}>
                {p.dept + " · " + p.correct_count + " câu đúng"}
                {p.streak >= 2 ? " · 🔥" + p.streak : ""}
                {showXp && p.xp_gained > 0 ? " · +" + p.xp_gained + " XP" : ""}
              </div>
            </div>
            <span style={{ position: "relative", fontSize: 17, fontWeight: 900, color: i === 0 ? C.goldL : C.gold, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{p.score}</span>
          </div>
        );
      })}
      {ranked.length > limit && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 6 }}>
          {"… và " + (ranked.length - limit) + " người khác"}
        </div>
      )}
    </div>
  );
}

function Podium({ ranked, C, ui }) {
  const { card, hd } = ui;
  const top = ranked.slice(0, 3);
  const order = [1, 0, 2];      // thứ tự chỗ đứng trên bục: nhì – NHẤT – ba
  const heights = [122, 86, 62]; // tra theo HẠNG (0=nhất) chứ không theo chỗ đứng
  const grads = [
    "linear-gradient(180deg,#DEC06B,#C9A84C)",
    "linear-gradient(180deg,#cfd8dc,#90a4ae)",
    "linear-gradient(180deg,#d9a06a,#b0703c)",
  ];
  return (
    <div style={{ ...card, position: "relative", overflow: "hidden", padding: "26px 16px", border: "1px solid rgba(255,255,255,0.14)" }}>
      <Backdrop tint={["rgba(201,168,76,.30)", "rgba(123,47,247,.20)", "rgba(12,123,111,.24)"]} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="ka-anim" style={{ textAlign: "center", ...hd(22), marginBottom: 22, animation: "kaPop .5s cubic-bezier(.34,1.56,.64,1)" }}>
          {"🏁 Kết Thúc Trận Đấu"}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 12 }}>
          {order.map((idx, slot) => {
            const p = top[idx];
            if (!p) return null;
            return (
              <div key={p.id} className="ka-anim" style={{ flex: 1, maxWidth: 140, textAlign: "center", animation: "kaSlideUp .5s both", animationDelay: (slot * 0.18) + "s" }}>
                <div style={{ fontSize: idx === 0 ? 36 : 27, marginBottom: 4 }}>{MEDAL[idx]}</div>
                <div style={{ color: C.white, fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ color: C.goldL, fontSize: 16, fontWeight: 900, marginBottom: 8, fontFamily: "'Be Vietnam Pro',sans-serif" }}>{p.score}</div>
                <div className="ka-anim" style={{
                  height: heights[idx], borderRadius: "12px 12px 0 0", background: grads[idx],
                  boxShadow: "inset 0 -4px 12px rgba(0,0,0,.22)", transformOrigin: "bottom",
                  animation: "kaRise .6s cubic-bezier(.34,1.4,.64,1) both", animationDelay: (0.2 + slot * 0.18) + "s",
                }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
