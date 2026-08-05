/* ═══════════════════════════════════════════════════════════════
   ĐẤU TRƯỜNG — Bộ tổng hợp âm thanh
   ═══════════════════════════════════════════════════════════════

   Toàn bộ nhạc và hiệu ứng ở đây được TỔNG HỢP TRỰC TIẾP bằng Web Audio API,
   không dùng file mp3/wav nào. Lý do:
     · Nhạc Kahoot có bản quyền — không được sao chép. Giai điệu dưới đây là
       nguyên bản, viết riêng cho Kingsmen.
     · Không thêm 1 byte nào vào bundle, không phụ thuộc CDN, chạy được offline.
     · Nhạc nền phòng chờ / câu hỏi là vòng lặp vô hạn nên tổng hợp còn gọn hơn
       file: chỉ vài trăm dòng thay vì vài MB.

   Trình duyệt chặn phát nhạc trước khi người dùng tương tác → phải gọi unlock()
   bên trong một sự kiện click thật (nút "Mở Phòng", "Vào Phòng"...).
   ═══════════════════════════════════════════════════════════════ */

const MUTE_KEY = "km_arena_muted";
const LOOKAHEAD_MS = 40;    // chu kỳ chạy bộ lập lịch
const SCHED_AHEAD = 0.18;   // đặt lịch trước bao nhiêu giây

// MIDI → Hz (69 = A4 = 440Hz)
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

let ctx = null;
let master = null;
let musicBus = null;   // nhạc nền — hạ nhỏ để không át hiệu ứng
let sfxBus = null;
let noiseBuf = null;

let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; } })();

let timer = null;
let nextTime = 0;
let step = 0;
let track = null;      // vòng lặp đang chạy
let hurry = false;     // sắp hết giờ → nhạc gấp gáp hơn

/* ── Hạ tầng ───────────────────────────────────────────────── */

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);

  musicBus = ctx.createGain(); musicBus.gain.value = 0.34; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1.0; sfxBus.connect(master);

  // đệm nhiễu trắng dùng cho trống/hi-hat
  const len = Math.floor(ctx.sampleRate * 0.4);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function tone(bus, { note, freq, at, dur, type = "square", gain = 0.2, glide = 0, detune = 0 }) {
  const f = freq !== undefined ? freq : hz(note);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f, at);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * glide), at + dur);
  const atk = Math.min(0.012, dur * 0.25);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(bus);
  o.start(at); o.stop(at + dur + 0.03);
}

function noise(bus, { at, dur = 0.05, gain = 0.15, hpf = 4000 }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hpf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(at); s.stop(at + dur + 0.02);
}

function thump(bus, { at, gain = 0.5, from = 130, to = 45, dur = 0.16 }) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(bus);
  o.start(at); o.stop(at + dur + 0.02);
}

/* ── Vòng lặp nhạc nền ─────────────────────────────────────────
   Mỗi track là hàm nhận (i = bước thứ 0..15, t = mốc thời gian).
   Nhịp 16 bước = 1 ô nhịp.                                       */

// Phòng chờ: tươi, nảy, chờ đợi — La trưởng ngũ cung
const LOBBY_BASS = [45, null, null, 45, null, 50, null, null, 52, null, null, 52, null, 50, null, 45];
const LOBBY_ARP = [69, 76, 81, 76, 72, 79, 84, 79, 74, 81, 86, 81, 72, 79, 84, 88];

const TRACKS = {
  lobby: {
    bpm: 96,
    play(i, t) {
      const b = LOBBY_BASS[i];
      if (b !== null) tone(musicBus, { note: b, at: t, dur: 0.26, type: "triangle", gain: 0.30 });
      if (i % 2 === 0) tone(musicBus, { note: LOBBY_ARP[i], at: t, dur: 0.13, type: "square", gain: 0.085 });
      if (i % 4 === 2) noise(musicBus, { at: t, dur: 0.035, gain: 0.05, hpf: 7000 });
      if (i === 0 || i === 8) thump(musicBus, { at: t, gain: 0.34 });
    },
  },
  // Đang trả lời: dồn dập, tăng nhịp khi sắp hết giờ
  question: {
    bpm: 132,
    play(i, t) {
      const root = hurry ? 40 : 38;
      if (i % 4 === 0) {
        thump(musicBus, { at: t, gain: 0.42 });
        tone(musicBus, { note: root, at: t, dur: 0.20, type: "sawtooth", gain: 0.20 });
      }
      if (i % 2 === 0) noise(musicBus, { at: t, dur: 0.03, gain: 0.045, hpf: 8000 });
      if (hurry && i % 2 === 1) noise(musicBus, { at: t, dur: 0.025, gain: 0.05, hpf: 9500 });
      // mô-típ căng thẳng: quãng năm đi lên
      const mel = hurry ? [64, 67, 71, 74] : [59, 62, 66, 69];
      if (i % 4 === 2) tone(musicBus, { note: mel[(i >> 2) % 4], at: t, dur: 0.14, type: "square", gain: 0.075 });
      if (i === 14) tone(musicBus, { note: root + 12, at: t, dur: 0.10, type: "triangle", gain: 0.10 });
    },
  },
  // Bảng xếp hạng: nhẹ, vui
  scoreboard: {
    bpm: 112,
    play(i, t) {
      const arp = [57, 64, 69, 64, 59, 66, 71, 66, 61, 68, 73, 68, 59, 66, 71, 74];
      if (i % 2 === 0) tone(musicBus, { note: arp[i], at: t, dur: 0.16, type: "triangle", gain: 0.13 });
      if (i % 8 === 0) thump(musicBus, { at: t, gain: 0.30 });
      if (i % 4 === 2) noise(musicBus, { at: t, dur: 0.03, gain: 0.04, hpf: 7000 });
    },
  },
};

function scheduler() {
  if (!ctx || !track) return;
  const T = TRACKS[track];
  const stepDur = 60 / T.bpm / 4;   // nốt móc kép
  while (nextTime < ctx.currentTime + SCHED_AHEAD) {
    if (nextTime > ctx.currentTime - 0.05) {
      try { T.play(step % 16, nextTime); } catch (e) { /* bỏ qua 1 bước lỗi, không dừng nhạc */ }
    }
    step++;
    nextTime += stepDur;
  }
}

/* ── Hiệu ứng một lần ──────────────────────────────────────── */

const STINGS = {
  // vào phòng
  join(t) {
    [72, 79].forEach((n, k) => tone(sfxBus, { note: n, at: t + k * 0.06, dur: 0.11, type: "square", gain: 0.16 }));
  },
  // host bấm bắt đầu
  start(t) {
    [60, 64, 67, 72].forEach((n, k) => tone(sfxBus, { note: n, at: t + k * 0.075, dur: 0.16, type: "square", gain: 0.18 }));
    thump(sfxBus, { at: t + 0.3, gain: 0.5 });
  },
  // câu hỏi mới hiện lên
  newq(t) {
    tone(sfxBus, { note: 67, at: t, dur: 0.10, type: "triangle", gain: 0.16 });
    tone(sfxBus, { note: 74, at: t + 0.08, dur: 0.14, type: "triangle", gain: 0.16 });
  },
  // đã gửi câu trả lời
  submit(t) {
    tone(sfxBus, { note: 76, at: t, dur: 0.07, type: "square", gain: 0.15 });
    tone(sfxBus, { note: 83, at: t + 0.05, dur: 0.09, type: "square", gain: 0.13 });
  },
  // trả lời đúng — hợp âm trưởng đi lên
  correct(t) {
    [72, 76, 79, 84].forEach((n, k) => {
      tone(sfxBus, { note: n, at: t + k * 0.065, dur: 0.30, type: "square", gain: 0.19 });
      tone(sfxBus, { note: n + 12, at: t + k * 0.065, dur: 0.22, type: "triangle", gain: 0.09 });
    });
  },
  // trả lời sai — hai nốt đi xuống, hơi lệch tông
  wrong(t) {
    tone(sfxBus, { note: 53, at: t, dur: 0.20, type: "sawtooth", gain: 0.17, detune: -18 });
    tone(sfxBus, { note: 49, at: t + 0.17, dur: 0.34, type: "sawtooth", gain: 0.17, detune: -30 });
  },
  // hết giờ chưa trả lời
  timeup(t) {
    tone(sfxBus, { freq: 220, at: t, dur: 0.42, type: "square", gain: 0.16, glide: 0.45 });
    noise(sfxBus, { at: t, dur: 0.2, gain: 0.05, hpf: 1200 });
  },
  // đồng hồ đếm 5 giây cuối
  tick(t) {
    tone(sfxBus, { freq: 1600, at: t, dur: 0.035, type: "square", gain: 0.13 });
  },
  // hiện đáp án
  reveal(t) {
    tone(sfxBus, { note: 64, at: t, dur: 0.09, type: "triangle", gain: 0.14 });
    tone(sfxBus, { note: 71, at: t + 0.07, dur: 0.12, type: "triangle", gain: 0.14 });
  },
  // podium cuối trận — kèn khải hoàn
  podium(t) {
    const mel = [72, 76, 79, 84, 79, 84, 88];
    mel.forEach((n, k) => {
      tone(sfxBus, { note: n, at: t + k * 0.13, dur: 0.26, type: "square", gain: 0.20 });
      tone(sfxBus, { note: n - 12, at: t + k * 0.13, dur: 0.26, type: "triangle", gain: 0.12 });
    });
    const end = t + mel.length * 0.13;
    [72, 76, 79, 84].forEach((n) => tone(sfxBus, { note: n, at: end, dur: 1.1, type: "square", gain: 0.15 }));
    thump(sfxBus, { at: end, gain: 0.55, dur: 0.4 });
  },
};

/* ── API công khai ─────────────────────────────────────────── */

export const arenaSound = {
  isMuted() { return muted; },

  setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) { }
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    }
  },

  toggle() { this.setMuted(!muted); return muted; },

  // Gọi trong một sự kiện click thật để mở khóa âm thanh (chính sách trình duyệt)
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
  },

  play(name) {
    if (muted || !ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    const f = STINGS[name];
    if (f) { try { f(ctx.currentTime + 0.02); } catch (e) { } }
  },

  // name = 'lobby' | 'question' | 'scoreboard' | null (tắt nhạc nền)
  loop(name) {
    if (!name) {
      track = null;
      if (timer) { clearInterval(timer); timer = null; }
      return;
    }
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    if (track === name && timer) return;   // đang chạy rồi, không khởi động lại
    track = name;
    step = 0;
    nextTime = ctx.currentTime + 0.06;
    if (!timer) timer = setInterval(scheduler, LOOKAHEAD_MS);
  },

  setHurry(v) { hurry = !!v; },

  stopAll() {
    this.loop(null);
    hurry = false;
  },
};

export default arenaSound;
