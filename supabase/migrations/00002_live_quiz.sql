-- ═══════════════════════════════════════════════════════════════
-- KINGSMEN TRAINING PLATFORM — ĐẤU TRƯỜNG (Live Quiz kiểu Kahoot)
-- Migration 00002
-- ═══════════════════════════════════════════════════════════════
--
-- Nguyên tắc thiết kế:
--   1. ĐÁP ÁN KHÔNG BAO GIỜ nằm ở bảng mà người chơi đọc được.
--      → live_rooms (ai cũng đọc, KHÔNG có đáp án)
--      → live_room_secrets (KHÔNG có RLS policy nào = không ai đọc qua API,
--        chỉ các hàm SECURITY DEFINER bên dưới đọc được)
--   2. ĐỒNG HỒ VÀ ĐIỂM do SERVER tính, không tin client.
--      → live_submit_answer chỉ nhận p_choice, tự đo ms từ q_started_at.
--   3. Chống trả lời 2 lần bằng UNIQUE(room_id, emp_id, q_idx).
--
-- Chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run
-- Chạy lại nhiều lần được (idempotent).
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 1. BẢNG
-- ───────────────────────────────────────────────────────────────

-- Phòng thi đấu. Mọi người đã đăng nhập đều đọc được → KHÔNG chứa đáp án.
create table if not exists public.live_rooms (
  id           text primary key default (gen_random_uuid())::text,
  pin          text not null,
  quiz_id      text references public.quizzes(id) on delete set null,
  quiz_title   text not null default '',
  host_id      uuid not null references public.profiles(id),
  host_name    text not null default '',
  status       text not null default 'lobby'
               check (status in ('lobby','question','reveal','scoreboard','ended')),
  q_idx        int  not null default -1,
  q_count      int  not null default 0,
  q_seconds    int  not null default 20,
  q_started_at timestamptz,
  q_public     jsonb,      -- {q, opts, type} — KHÔNG có ans/exp
  q_reveal     jsonb,      -- {ans, exp, counts} — chỉ set khi host bấm "Hiện đáp án"
  projector    boolean not null default true,
  xp_awarded   boolean not null default false,
  created_at   timestamptz default now(),
  ended_at     timestamptz
);

-- Chỉ cho phép 1 phòng đang mở trên mỗi mã PIN (phòng đã kết thúc thì PIN tái sử dụng được)
create unique index if not exists live_rooms_pin_active_idx
  on public.live_rooms (pin) where status <> 'ended';
create index if not exists live_rooms_host_idx on public.live_rooms (host_id, created_at desc);

-- Đề thi ĐÃ xáo trộn của trận + đáp án. Không có RLS policy = API không đọc được.
create table if not exists public.live_room_secrets (
  room_id   text primary key references public.live_rooms(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb
);

-- Người chơi trong phòng
create table if not exists public.live_players (
  id             text primary key default (gen_random_uuid())::text,
  room_id        text not null references public.live_rooms(id) on delete cascade,
  emp_id         uuid not null references public.profiles(id),
  name           text not null default '',
  dept           text not null default '',
  score          int  not null default 0,
  streak         int  not null default 0,
  correct_count  int  not null default 0,
  answered_count int  not null default 0,
  xp_gained      int  not null default 0,
  joined_at      timestamptz default now(),
  unique (room_id, emp_id)
);
create index if not exists live_players_room_idx on public.live_players (room_id, score desc);

-- Từng câu trả lời. UNIQUE chặn double-submit ở tầng DB.
create table if not exists public.live_answers (
  id         text primary key default (gen_random_uuid())::text,
  room_id    text not null references public.live_rooms(id) on delete cascade,
  emp_id     uuid not null references public.profiles(id),
  q_idx      int  not null,
  choice     int  not null default -1,   -- -1 = không trả lời kịp
  correct    boolean not null default false,
  ms         int  not null default 0,
  points     int  not null default 0,
  created_at timestamptz default now(),
  unique (room_id, emp_id, q_idx)
);
create index if not exists live_answers_room_q_idx on public.live_answers (room_id, q_idx);

-- Realtime UPDATE cần full row để filter hoạt động ổn định
alter table public.live_rooms   replica identity full;
alter table public.live_players replica identity full;


-- ───────────────────────────────────────────────────────────────
-- 2. RLS
-- ───────────────────────────────────────────────────────────────

alter table public.live_rooms        enable row level security;
alter table public.live_room_secrets enable row level security;
alter table public.live_players      enable row level security;
alter table public.live_answers      enable row level security;

-- Phòng: ai đăng nhập cũng đọc được (để tìm PIN + theo dõi trạng thái).
drop policy if exists live_rooms_select on public.live_rooms;
create policy live_rooms_select on public.live_rooms
  for select to authenticated using (true);

-- live_room_secrets: CỐ TÌNH không có policy nào → mọi truy cập qua API bị chặn.
-- Chỉ các hàm SECURITY DEFINER bên dưới đọc được.

-- Người chơi: ai cũng đọc được (bảng xếp hạng hiển thị cho tất cả).
drop policy if exists live_players_select on public.live_players;
create policy live_players_select on public.live_players
  for select to authenticated using (true);

-- Câu trả lời: CHỈ đọc được câu trả lời của chính mình, hoặc host đọc cả phòng.
-- (Nếu cho đọc hết, người chơi có thể suy ra đáp án từ cột `correct` của người khác.)
drop policy if exists live_answers_select on public.live_answers;
create policy live_answers_select on public.live_answers
  for select to authenticated using (
    emp_id = auth.uid()
    or exists (select 1 from public.live_rooms r where r.id = room_id and r.host_id = auth.uid())
  );

-- KHÔNG có policy INSERT/UPDATE/DELETE trên cả 4 bảng:
-- mọi thay đổi chỉ đi qua RPC bên dưới.


-- ───────────────────────────────────────────────────────────────
-- 3. REALTIME
-- ───────────────────────────────────────────────────────────────

-- Bọc từng lệnh: chạy lại migration lần 2 sẽ báo "already member of publication",
-- không được để lỗi đó làm hỏng cả migration.
do $$
begin
  begin alter publication supabase_realtime add table public.live_rooms;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.live_players; exception when others then null; end;
  begin alter publication supabase_realtime add table public.live_answers; exception when others then null; end;
end $$;


-- ───────────────────────────────────────────────────────────────
-- 4. HÀM PHỤ TRỢ
-- ───────────────────────────────────────────────────────────────

-- Giờ server — client dùng để bù lệch đồng hồ máy cá nhân khi đếm ngược.
create or replace function public.km_now()
returns timestamptz
language sql stable
as $$ select now() $$;

-- Ai được mở phòng: tài khoản admin, QL cấp cao (director), QL cấp trung (manager).
create or replace function public.km_can_host(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid
      and coalesce(p.status,'active') = 'active'
      and (p.emp_id = 'admin' or p.acc_role in ('director','manager'))
  );
$$;

-- Dựng phần công khai của một câu hỏi (bỏ ans/exp).
create or replace function public.km_live_q_public(p_q jsonb)
returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'q',    coalesce(p_q->>'q',''),
    'type', coalesce(p_q->>'type','mc'),
    'opts', case
              when coalesce(p_q->>'type','mc') = 'truefalse' then '["ĐÚNG","SAI"]'::jsonb
              else coalesce(p_q->'opts','[]'::jsonb)
            end
  );
$$;

-- Chuyển phòng sang câu hỏi thứ p_idx (dùng chung cho start & next).
create or replace function public.km_live_set_question(p_room_id text, p_idx int)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_q jsonb;
begin
  select s.questions -> p_idx into v_q
  from public.live_room_secrets s where s.room_id = p_room_id;

  if v_q is null then
    raise exception 'Không tìm thấy câu hỏi số %', p_idx;
  end if;

  update public.live_rooms
     set status       = 'question',
         q_idx        = p_idx,
         q_public     = public.km_live_q_public(v_q),
         q_reveal     = null,
         q_started_at = now()
   where id = p_room_id;
end $$;


-- ───────────────────────────────────────────────────────────────
-- 5. RPC — HOST
-- ───────────────────────────────────────────────────────────────

-- Tạo phòng. Xáo trộn câu hỏi NGAY LÚC TẠO và chốt cứng vào live_room_secrets
-- → sửa đề sau đó không ảnh hưởng trận đang chạy, và mọi người thấy cùng thứ tự.
create or replace function public.live_create_room(
  p_quiz_id   text,
  p_seconds   int     default 20,
  p_projector boolean default true
)
returns public.live_rooms
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_prof   public.profiles;
  v_quiz   public.quizzes;
  v_qs     jsonb;
  v_pin    text;
  v_room   public.live_rooms;
  v_try    int := 0;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  if not public.km_can_host(v_uid) then
    raise exception 'Bạn không có quyền mở phòng thi đấu';
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  select * into v_quiz from public.quizzes  where id = p_quiz_id;
  if v_quiz.id is null then raise exception 'Không tìm thấy đề thi'; end if;

  -- Chỉ lấy câu trắc nghiệm / đúng-sai. Câu tự luận không chơi live được
  -- (cần AI chấm, mất 5–10 giây/câu → phá nhịp trận đấu).
  select coalesce(jsonb_agg(q order by random()), '[]'::jsonb) into v_qs
  from jsonb_array_elements(coalesce(v_quiz.questions,'[]'::jsonb)) q
  where coalesce(q->>'type','mc') <> 'essay'
    and (coalesce(q->>'type','mc') = 'truefalse' or jsonb_array_length(coalesce(q->'opts','[]'::jsonb)) >= 2);

  if jsonb_array_length(v_qs) = 0 then
    raise exception 'Đề này không có câu trắc nghiệm/đúng-sai nào để chơi live';
  end if;

  -- Đóng các phòng cũ còn treo của chính host này → không để phòng mồ côi chiếm PIN.
  update public.live_rooms
     set status = 'ended', ended_at = now()
   where host_id = v_uid and status <> 'ended';

  -- Sinh PIN 6 số chưa dùng bởi phòng nào đang mở
  loop
    v_try := v_try + 1;
    v_pin := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (select 1 from public.live_rooms where pin = v_pin and status <> 'ended');
    if v_try > 50 then raise exception 'Không sinh được mã PIN, thử lại'; end if;
  end loop;

  insert into public.live_rooms (pin, quiz_id, quiz_title, host_id, host_name,
                                 q_count, q_seconds, projector)
  values (v_pin, v_quiz.id, v_quiz.title, v_uid, coalesce(v_prof.name,''),
          jsonb_array_length(v_qs), greatest(5, least(120, coalesce(p_seconds,20))), coalesce(p_projector,true))
  returning * into v_room;

  insert into public.live_room_secrets (room_id, questions) values (v_room.id, v_qs);

  return v_room;
end $$;

-- Bắt đầu trận
create or replace function public.live_start(p_room_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.live_rooms;
begin
  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then raise exception 'Phòng không tồn tại'; end if;
  -- Kiểm tra host PHẢI dùng "is distinct from", KHÔNG được dùng "<>".
  -- Khi chưa đăng nhập, auth.uid() là NULL và "host_id <> NULL" cho ra NULL chứ
  -- không phải TRUE → câu chặn không kích hoạt, người lạ chỉ cần khóa anon
  -- (vốn công khai trong bundle trình duyệt) là điều khiển được phòng người khác.
  -- Lỗi này đã từng lọt; giữ nguyên cách viết này ở CẢ 6 hàm điều khiển phòng.
  if v_room.host_id is distinct from auth.uid() then raise exception 'Chỉ host được điều khiển phòng'; end if;
  if v_room.status <> 'lobby' then raise exception 'Trận đã bắt đầu rồi'; end if;
  if not exists (select 1 from public.live_players where room_id = p_room_id) then
    raise exception 'Chưa có người chơi nào vào phòng';
  end if;
  perform public.km_live_set_question(p_room_id, 0);
end $$;

-- Hiện đáp án. Đồng thời "chốt sổ" câu hiện tại:
-- ai không trả lời kịp → ghi 1 dòng choice=-1 (0 điểm) và reset streak.
-- Nhờ vậy không có bản ghi thiếu, thống kê sau trận luôn đủ số lượt.
create or replace function public.live_reveal(p_room_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_room   public.live_rooms;
  v_q      jsonb;
  v_counts jsonb;
  v_len    int;
begin
  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then raise exception 'Phòng không tồn tại'; end if;
  if v_room.host_id is distinct from auth.uid() then raise exception 'Chỉ host được điều khiển phòng'; end if;
  if v_room.status <> 'question' then return; end if;   -- đã reveal rồi → bỏ qua, không lỗi

  select s.questions -> v_room.q_idx into v_q
  from public.live_room_secrets s where s.room_id = p_room_id;

  -- Chốt những người không trả lời
  insert into public.live_answers (room_id, emp_id, q_idx, choice, correct, ms, points)
  select p_room_id, p.emp_id, v_room.q_idx, -1, false, v_room.q_seconds * 1000, 0
  from public.live_players p
  where p.room_id = p_room_id
    and not exists (select 1 from public.live_answers a
                    where a.room_id = p_room_id and a.emp_id = p.emp_id and a.q_idx = v_room.q_idx)
  on conflict (room_id, emp_id, q_idx) do nothing;

  update public.live_players p
     set streak = 0
   where p.room_id = p_room_id
     and exists (select 1 from public.live_answers a
                 where a.room_id = p_room_id and a.emp_id = p.emp_id
                   and a.q_idx = v_room.q_idx and a.choice = -1);

  -- Đếm số người chọn từng đáp án (cho biểu đồ cột trên màn chiếu)
  v_len := coalesce(jsonb_array_length(v_room.q_public->'opts'), 0);
  select coalesce(jsonb_agg(t.c order by t.i), '[]'::jsonb) into v_counts
  from (
    select i, (select count(*) from public.live_answers a
               where a.room_id = p_room_id and a.q_idx = v_room.q_idx and a.choice = i) as c
    from generate_series(0, greatest(v_len - 1, 0)) i
  ) t;

  update public.live_rooms
     set status   = 'reveal',
         q_reveal = jsonb_build_object(
           'ans',    coalesce((v_q->>'ans')::int, 0),
           'exp',    coalesce(v_q->>'exp',''),
           'counts', v_counts,
           'noAnswer', (select count(*) from public.live_answers a
                        where a.room_id = p_room_id and a.q_idx = v_room.q_idx and a.choice = -1)
         )
   where id = p_room_id;
end $$;

-- Chuyển sang màn bảng xếp hạng giữa trận
create or replace function public.live_scoreboard(p_room_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.live_rooms;
begin
  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then raise exception 'Phòng không tồn tại'; end if;
  if v_room.host_id is distinct from auth.uid() then raise exception 'Chỉ host được điều khiển phòng'; end if;
  update public.live_rooms set status = 'scoreboard' where id = p_room_id;
end $$;

-- Câu tiếp theo (hết câu thì tự kết thúc trận)
create or replace function public.live_next(p_room_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.live_rooms;
begin
  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then raise exception 'Phòng không tồn tại'; end if;
  if v_room.host_id is distinct from auth.uid() then raise exception 'Chỉ host được điều khiển phòng'; end if;
  if v_room.status = 'ended' then return; end if;

  if v_room.q_idx + 1 >= v_room.q_count then
    perform public.live_end(p_room_id);
  else
    perform public.km_live_set_question(p_room_id, v_room.q_idx + 1);
  end if;
end $$;

-- Kết thúc trận + cộng XP MỘT LẦN DUY NHẤT (cờ xp_awarded chặn cộng trùng
-- nếu host bấm 2 lần hoặc mạng chập chờn gọi lại).
--
-- Công thức XP:  số câu đúng × 5  +  thưởng thứ hạng (1st 100 / 2nd 60 / 3rd 40 / còn lại 10)
create or replace function public.live_end(p_room_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_room public.live_rooms;
  r      record;
  v_xp   int;
begin
  select * into v_room from public.live_rooms where id = p_room_id for update;
  if v_room.id is null then raise exception 'Phòng không tồn tại'; end if;
  if v_room.host_id is distinct from auth.uid() then raise exception 'Chỉ host được điều khiển phòng'; end if;

  if not v_room.xp_awarded then
    for r in
      select p.*, rank() over (order by p.score desc, p.correct_count desc, p.joined_at) as rnk
      from public.live_players p where p.room_id = p_room_id
    loop
      v_xp := r.correct_count * 5
            + case r.rnk when 1 then 100 when 2 then 60 when 3 then 40 else 10 end;

      update public.profiles
         set xp = coalesce(xp,0) + v_xp,
             last_xp_gain_date = current_date
       where id = r.emp_id;

      update public.live_players set xp_gained = v_xp where id = r.id;

      insert into public.notifications (emp_id, msg, type)
      values (r.emp_id,
              '🎮 Đấu trường "' || v_room.quiz_title || '": hạng ' || r.rnk
              || '/' || (select count(*) from public.live_players where room_id = p_room_id)
              || ' · ' || r.score || ' điểm · +' || v_xp || ' XP',
              'live');
    end loop;
  end if;

  update public.live_rooms
     set status = 'ended', ended_at = now(), xp_awarded = true, q_public = null, q_reveal = null
   where id = p_room_id;
end $$;

-- Host thoát/hủy phòng khi chưa ai chơi
create or replace function public.live_cancel_room(p_room_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_room public.live_rooms;
begin
  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then return; end if;
  if v_room.host_id is distinct from auth.uid() then raise exception 'Chỉ host được hủy phòng'; end if;
  if v_room.status = 'ended' then return; end if;
  -- Đã chơi rồi thì kết thúc đàng hoàng (cộng XP), chưa chơi thì xóa sạch.
  if v_room.q_idx >= 0 then
    perform public.live_end(p_room_id);
  else
    delete from public.live_rooms where id = p_room_id;  -- cascade sang players/answers/secrets
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────
-- 6. RPC — NGƯỜI CHƠI
-- ───────────────────────────────────────────────────────────────

-- Vào phòng bằng mã PIN. Vào lại (F5, mất mạng) không tạo bản ghi trùng
-- và KHÔNG reset điểm — nhờ UNIQUE(room_id, emp_id) + do update.
create or replace function public.live_join(p_pin text)
returns public.live_rooms
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_prof public.profiles;
  v_room public.live_rooms;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  select * into v_prof from public.profiles where id = v_uid;
  if v_prof.id is null then raise exception 'Không tìm thấy hồ sơ nhân sự'; end if;
  if coalesce(v_prof.status,'active') <> 'active' then raise exception 'Tài khoản đã bị khóa'; end if;

  select * into v_room from public.live_rooms
   where pin = trim(p_pin) and status <> 'ended' limit 1;
  if v_room.id is null then raise exception 'Mã PIN không đúng hoặc phòng đã đóng'; end if;

  -- Vào giữa trận thì được, nhưng chỉ khi trận chưa kết thúc.
  insert into public.live_players (room_id, emp_id, name, dept)
  values (v_room.id, v_uid, coalesce(v_prof.name,''), coalesce(v_prof.dept,''))
  on conflict (room_id, emp_id) do update set name = excluded.name, dept = excluded.dept;

  return v_room;
end $$;

-- Gửi câu trả lời.
-- Client CHỈ gửi lựa chọn. Server tự đo thời gian và tự chấm — client
-- không biết đáp án (không nằm trong bảng nó đọc được) và không tự khai điểm.
-- Trả về {ok, ms} — CỐ TÌNH không trả về đúng/sai để người chơi không biết
-- trước khi host bấm "Hiện đáp án".
create or replace function public.live_submit_answer(p_room_id text, p_choice int)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_room    public.live_rooms;
  v_player  public.live_players;
  v_q       jsonb;
  v_ans     int;
  v_ms      int;
  v_limit   int;
  v_correct boolean;
  v_points  int;
  v_bonus   int;
  v_ins     int;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;

  select * into v_room from public.live_rooms where id = p_room_id;
  if v_room.id is null then raise exception 'Phòng không tồn tại'; end if;
  if v_room.status <> 'question' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  select * into v_player from public.live_players
   where room_id = p_room_id and emp_id = v_uid;
  if v_player.id is null then raise exception 'Bạn chưa vào phòng này'; end if;

  v_limit := v_room.q_seconds * 1000;
  v_ms := greatest(0, (extract(epoch from (now() - v_room.q_started_at)) * 1000)::int);
  -- 1.5s ân hạn cho độ trễ mạng; quá hạn vẫn ghi nhận nhưng 0 điểm.
  if v_ms > v_limit + 1500 then v_ms := v_limit; end if;

  select s.questions -> v_room.q_idx into v_q
  from public.live_room_secrets s where s.room_id = p_room_id;
  v_ans := coalesce((v_q->>'ans')::int, -99);

  v_correct := (p_choice = v_ans);

  if v_correct and v_ms <= v_limit then
    -- Giống Kahoot: trả lời tức thì ≈1000đ, đúng nhưng sát giờ ≈500đ.
    v_points := greatest(0, round(1000 * (1 - (v_ms::numeric / v_limit) / 2))::int);
    -- Thưởng chuỗi đúng liên tiếp, tối đa +250
    v_bonus  := least(coalesce(v_player.streak,0), 5) * 50;
    v_points := v_points + v_bonus;
  else
    v_points := 0;
  end if;

  -- Chốt double-submit ở tầng DB: bấm 2 lần thì lần sau không ghi được.
  insert into public.live_answers (room_id, emp_id, q_idx, choice, correct, ms, points)
  values (p_room_id, v_uid, v_room.q_idx, p_choice, v_correct, v_ms, v_points)
  on conflict (room_id, emp_id, q_idx) do nothing;

  get diagnostics v_ins = row_count;
  if v_ins = 0 then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;

  update public.live_players
     set score          = score + v_points,
         correct_count  = correct_count + case when v_correct then 1 else 0 end,
         answered_count = answered_count + 1,
         streak         = case when v_correct then streak + 1 else 0 end
   where id = v_player.id;

  return jsonb_build_object('ok', true, 'ms', v_ms);
end $$;


-- ───────────────────────────────────────────────────────────────
-- 7. QUYỀN GỌI HÀM
-- ───────────────────────────────────────────────────────────────

grant execute on function public.km_now()                                 to authenticated;
grant execute on function public.km_can_host(uuid)                        to authenticated;
grant execute on function public.live_create_room(text, int, boolean)     to authenticated;
grant execute on function public.live_start(text)                         to authenticated;
grant execute on function public.live_reveal(text)                        to authenticated;
grant execute on function public.live_scoreboard(text)                    to authenticated;
grant execute on function public.live_next(text)                          to authenticated;
grant execute on function public.live_end(text)                           to authenticated;
grant execute on function public.live_cancel_room(text)                   to authenticated;
grant execute on function public.live_join(text)                          to authenticated;
grant execute on function public.live_submit_answer(text, int)            to authenticated;

-- Hàm nội bộ: không cho gọi trực tiếp từ client
revoke execute on function public.km_live_set_question(text, int) from public, anon, authenticated;
revoke execute on function public.km_live_q_public(jsonb)         from public, anon, authenticated;
