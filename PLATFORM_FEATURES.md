# Kingsmen Training Platform — Feature Reference

> **Version:** v3.5  
> **Last Updated:** 2026-04-25  
> **Source File:** `kingsmen-platform-v3_3.jsx` (5,974 lines)  
> **Schema:** `supabase/migrations/00001_initial_schema.sql`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication & User Management](#2-authentication--user-management)
3. [Daily Check-In & Streak System](#3-daily-check-in--streak-system)
4. [XP & Leveling System](#4-xp--leveling-system)
5. [Knowledge Base & Interactive Learning](#5-knowledge-base--interactive-learning)
6. [Quiz Engine](#6-quiz-engine)
7. [Competency Framework](#7-competency-framework)
8. [Challenges & Rewards](#8-challenges--rewards)
9. [Learning Pathways](#9-learning-pathways)
10. [Gamification: Badges & Leaderboard](#10-gamification-badges--leaderboard)
11. [Bulletins & Policies](#11-bulletins--policies)
12. [Notifications](#12-notifications)
13. [Recognitions & Awards](#13-recognitions--awards)
14. [Admin Dashboard & Analytics](#14-admin-dashboard--analytics)
15. [Manager/Director Features](#15-managerdirector-features)
16. [Backup & Restore](#16-backup--restore)
17. [Settings & Configuration](#17-settings--configuration)
18. [AI Integration](#18-ai-integration)
19. [Data Architecture](#19-data-architecture)
20. [Database Schema](#20-database-schema)
21. [Key Utility Functions](#21-key-utility-functions)
22. [Deployment](#22-deployment)

---

## 1. Architecture Overview

### Tech Stack

| Layer       | Technology                                  |
|-------------|---------------------------------------------|
| Frontend    | React (Vite), single-file SPA               |
| Charts      | Recharts (Radar, Bar charts)                |
| Backend     | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| AI          | Claude Sonnet 4 (via `claude-proxy` edge function) |
| Styling     | Inline CSS, dark theme (`#0f2d3a` base)     |
| Font        | Be Vietnam Pro (Google Fonts)               |
| Deployment  | Docker + Nginx                              |

### State Management

- **React `useState` / `useEffect`** — All global state managed in the `App` component
- **`localStorage` cache** — Performance layer (`cacheSet`/`cacheGet`) with timestamp-based expiry
- **`sessionStorage`** — Session persistence for current user, role, screen, active quiz state
- **`accountsRef`** — `useRef` for concurrent-safe account updates across async operations

### Data Flow

```
User Action → React State → Supabase DB (via DB.set/DB.get)
                          → localStorage cache (cacheSet)
                          → sessionStorage (session persistence)
```

### Environment Variables

| Variable               | Purpose                    |
|------------------------|----------------------------|
| `VITE_SUPABASE_URL`    | Supabase project URL       |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous API key |

---

## 2. Authentication & User Management

### Login Flow

- **Email format:** `{emp_id}@kingsmen.internal` (e.g., `admin@kingsmen.internal`)
- **Supabase Auth** (`signInWithPassword`) for authentication
- Profile loaded from `profiles` table after auth
- Admin detected by checking `emp_id === 'admin'` or `acc_role === 'director'`
- Session auto-restored from `sessionStorage` on page reload
- Automatic JWT refresh via `supabase.auth.getSession()`

### User Roles

| Role       | `acc_role`  | Access Level                                      |
|------------|-------------|---------------------------------------------------|
| Employee   | `employee`  | Learn, take quizzes, view results, challenges     |
| Manager    | `manager`   | Employee features + team management, assign challenges |
| Director   | `director`  | Manager features + bulletin creation, full HR view |
| Admin      | (login role)| Full platform control, user CRUD, settings, backup |

### Admin User Management

- **Create users** — Admin creates auth users via `create-user` edge function, then inserts profiles
- **Edit users** — Modify name, department, team, role, employee ID
- **Deactivate/Reactivate** — Soft delete via `status` field (`active`/`inactive`)
- **Reset password** — Admin can reset via Supabase Auth `updateUser`
- **Avatar upload** — Employees can upload profile photos to Supabase Storage (`avatars` bucket)

### Profile Data Model (`profiles`)

| Field              | Type      | Description                        |
|--------------------|-----------|------------------------------------|
| `id`               | uuid      | Auth user ID (FK to `auth.users`)  |
| `name`             | text      | Display name                       |
| `emp_id`           | text      | Employee code (e.g., "NV001")      |
| `dept`             | text      | Department                         |
| `team`             | text      | Team within department             |
| `acc_role`         | text      | `employee`/`manager`/`director`    |
| `xp`               | integer   | Experience points                  |
| `streak`           | integer   | Consecutive login days             |
| `check_ins`        | jsonb     | Array of check-in date strings     |
| `read_lessons`     | text[]    | Array of knowledge IDs read        |
| `path_progress`    | jsonb     | Per-path checklist/quiz progress   |
| `avatar`           | text      | Avatar image URL                   |
| `last_check_in`    | date      | Date of last daily check-in        |
| `last_xp_gain_date`| date      | Date XP was last earned            |
| `status`           | text      | `active` or `inactive`             |
| `deactivated_at`   | timestamptz | When account was deactivated     |

---

## 3. Daily Check-In & Streak System

### `doCheckIn()` Logic

1. **Guard:** Skips if already checked in today
2. **Streak calculation:**
   - If last check-in was yesterday → `streak + 1`
   - If last check-in was today → no change
   - Otherwise → streak resets to `1`
3. **XP awarded:** `settings.streakXP` (default: 10 XP per daily check-in)
4. **XP Decay (absence penalty):**
   - If `daysSince(lastCheckIn) > settings.decayDays` (default: 3)
   - Deducts: `(absentDays - decayDays) × decayXP` (default: 10 XP/day)
   - XP cannot go below 0
5. **Idle Decay (no learning penalty):**
   - If `daysSince(lastXpGainDate) > settings.idleDays` (default: 7)
   - Deducts: `settings.idleXP` (default: 15 XP) once per login
6. **Updates:** Profile updated with new streak, check-in array, XP via RPC `increment_xp`
7. **Motivational quote:** Displays a random culture quote after check-in

### Culture Quotes System

- ~50 inspirational quotes from business leaders (Steve Jobs, Elon Musk, Jack Ma, etc.)
- Categorized by values: *Linh hoạt thích ứng, Tự chủ nâng tầm, Quyết tâm thực thi, Chính trực nhất quán*
- Displayed with color-coded value badges after daily check-in

---

## 4. XP & Leveling System

### XP Earning Events

| Event                     | Default XP | Setting Key      |
|---------------------------|------------|------------------|
| Each correct answer       | 10         | `xpCorrect`      |
| Pass quiz (≥ pass score)  | 30         | `xpPass`         |
| Score ≥ 90%               | 20         | `xpBonus90`      |
| Perfect score (100%)      | 50         | `xpPerfect`      |
| Daily check-in streak     | 10         | `streakXP`       |
| Challenge completion      | 50         | Per-challenge    |

### XP Decay Events

| Event                              | Default XP  | Setting Key   |
|------------------------------------|-------------|---------------|
| Absent > N days (per extra day)    | -10/day     | `decayXP`     |
| No learning activity > N days      | -15 (once)  | `idleXP`      |

### Level Tiers (Default)

| Level     | Min XP | Icon | Color     |
|-----------|--------|------|-----------|
| Tập sự    | 0      | 🌱   | `#95a5a6` |
| Nhân viên | 100    | ⭐   | Blue      |
| Chuyên viên| 300   | 💎   | Purple    |
| Chuyên gia| 600    | 🏅   | Gold      |
| Master    | 1000   | 🏆   | Red       |

> Levels are **admin-configurable** — XP thresholds can be adjusted in Settings.

### Atomic XP Operations

XP updates use the `increment_xp` RPC function to avoid race conditions:
```sql
UPDATE profiles SET xp = GREATEST(0, xp + p_amount) WHERE id = p_user_id;
```

---

## 5. Knowledge Base & Interactive Learning

### Knowledge Article Structure

| Field        | Type    | Description                                    |
|--------------|---------|------------------------------------------------|
| `title`      | text    | Article title                                  |
| `content`    | text    | Raw text content (supports PDF extraction)     |
| `depts`      | text[]  | Department visibility (`["Tất cả"]` for all)   |
| `doc_url`    | text    | External document link                         |
| `has_pdf`    | boolean | Whether a PDF is uploaded                      |
| `pdf_name`   | text    | Original PDF filename                          |
| `video_url`  | text    | YouTube or direct video URL                    |
| `audio_url`  | text    | Audio file/YouTube URL                         |
| `images`     | jsonb   | Array of image URLs (Google Drive supported)   |
| `interactive`| jsonb   | AI-generated interactive content (see below)   |

### Interactive Content (`interactive` field)

Generated by AI from article content, stored as JSON:

```json
{
  "slides": [
    { "title": "...", "icon": "📌", "points": ["..."], "highlight": "..." }
  ],
  "flashcards": [
    { "front": "Question", "back": "Answer", "icon": "❓" }
  ],
  "cheatsheet": {
    "title": "...",
    "rows": [{ "label": "Key", "value": "Value" }]
  },
  "miniQuiz": [
    { "q": "...", "opts": ["A", "B", "C", "D"], "ans": 0 }
  ]
}
```

### Learning Modes (Fullscreen)

| Tab      | Icon | Description                                 |
|----------|------|---------------------------------------------|
| Tài liệu | 📄  | PDF download/view, external links, raw text |
| Slides   | 📊  | Presentation-style slides with navigation   |
| Nghe     | 🔊  | Audio playback (direct/YouTube)             |
| Video    | 🎬  | Video playback (YouTube embed/direct)       |
| Cards    | 🎴  | Flashcards with flip animation              |
| Sheet    | 📋  | Cheat sheet table format                    |
| Quiz     | ✏️  | Mini-quiz with instant feedback             |
| Ảnh      | 🖼️  | Image gallery (infographics)                |
| Sơ đồ    | 🧠  | Mind map visualization from slide data      |

### Admin Knowledge Management

- **Create/Edit** articles with rich metadata
- **PDF Upload** to Supabase Storage (`pdfs` bucket) with AI text extraction
- **AI Content Generation** — Generate interactive content from article text via Claude
- **Department-scoping** — Multiple departments per article
- **Media links** — Video, audio, document URLs
- **Image management** — Add/remove image URLs with Google Drive support

---

## 6. Quiz Engine

### Quiz Types

| Type       | `quiz_type` | Description                                    |
|------------|-------------|------------------------------------------------|
| MC         | `mc`        | Multiple-choice questions only                 |
| True/False | `mc`        | True/false questions (subset of MC)            |
| Mixed      | `mixed`     | Combination of MC + Essay questions            |

### Difficulty Levels

| Level    | `difficulty` | Icon |
|----------|-------------|------|
| Easy     | `easy`      | 🟢   |
| Medium   | `medium`    | 🟡   |
| Hard     | `hard`      | 🟠   |
| Advanced | `advanced`  | 🔴   |

### Question Data Model

**Multiple Choice / True-False:**
```json
{
  "q": "Question text",
  "type": "mc" | "truefalse",
  "opts": ["Option A", "Option B", "Option C", "Option D"],
  "ans": 2,          // 0-based index of correct answer
  "exp": "Explanation text"
}
```

**Essay:**
```json
{
  "q": "Essay question",
  "type": "essay",
  "rubric": "Grading criteria",
  "modelAnswer": "Reference answer (≤400 chars used in AI prompt)"
}
```

### Quiz Flow

1. **Start:** `startQuiz(quiz)` — shuffles questions, resets timer
2. **Timer:** Countdown from `quiz.timeLimit` (default: 2400s = 40min)
3. **MC/TF Questions:** Select answer → show correct/incorrect + explanation → auto-advance
4. **Essay Questions:** Text input → submit → stored for AI grading after quiz
5. **Finish:** `finishQuiz()` calculates score, XP, challenge progress
6. **Essay Grading:** AI grades essays sequentially via `gradeEssaysWithAI()`
7. **Result Screen:** Shows score, pass/fail, XP earned, detailed breakdown

### `finishQuiz()` Business Logic

1. Calculate MC correct count
2. For mixed quizzes: weight MC and essay scores proportionally
3. Award XP: `correctXP × correct + passBonus + highBonus + perfectBonus`
4. Use `increment_xp` RPC for atomic XP update
5. Check active challenges — auto-complete if quiz score meets threshold
6. Update path progress if quiz taken in pathway context
7. Save result to `results` table

### AI Essay Grading (`gradeEssaysWithAI`)

- Sends each essay to Claude via `claude-proxy` edge function
- Prompt includes question, rubric, model answer, and student answer
- Returns structured JSON:
  ```json
  {
    "score": 8, "maxScore": 10, "grade": "Tốt",
    "feedback": "...", "explanation": "...",
    "strengthPoints": ["..."], "improvementPoints": ["..."]
  }
  ```
- Failed grading attempts can be retried from the result screen
- Failed essays score 0 by default

### Admin Quiz Management

- **Manual creation** — Build questions through form UI
- **AI generation** — Claude generates MC, TF, or mixed quizzes from knowledge content
- **CSV Import/Export** — Bulk import questions from CSV; export quiz data
- **Department scoping** — Quizzes visible to specific departments
- **Quiz hiding** — `hidden` flag to temporarily hide quizzes from employees
- **Quiz frequency** — Configurable cooldown between retakes (`settings.quizFreq`)

---

## 7. Competency Framework

### Core Competencies (6 domains)

| ID             | Name                                    | Icon | Calculation Factors                    |
|----------------|-----------------------------------------|------|----------------------------------------|
| `thinking`     | Tư duy & Xử lý thông tin               | 🧠   | Avg score, perfect count, trend        |
| `knowledge`    | Hiểu công việc & Áp dụng kiến thức     | 📖   | Read %, avg score, pass rate           |
| `problem`      | Giải quyết vấn đề & Ra quyết định      | 🎯   | Avg score, pass rate, recent performance |
| `communication`| Giao tiếp & Phối hợp                   | 🤝   | Pass rate, streak, quiz count          |
| `discipline`   | Trách nhiệm, Kỷ luật & Tuân thủ        | 📋   | Streak, pass rate, consistency         |
| `learning`     | Học hỏi, Thích nghi & Cải tiến         | 🚀   | Read %, improvement trend, streak      |

### Position-Specific Competencies

Per-department additional competencies (e.g., Sales has "Kỹ năng bán hàng" and "CSKH").

### `evalCompetency()` Algorithm

Each competency score (0–100) is computed from weighted factors:
- Quiz average score
- Pass rate
- Perfect score count
- Recent vs. overall performance trend
- Knowledge read percentage
- Login streak length

### Competency Levels

| Score Range | Label         | Color  |
|-------------|---------------|--------|
| ≥ 85%       | Xuất sắc      | Green  |
| 70–84%      | Tốt           | Blue   |
| 50–69%      | Đạt           | Orange |
| < 50%       | Cần cải thiện | Red    |

### AI Improvement Suggestions (`getImprovements`)

- Identifies the 3 lowest-scoring competencies below 70%
- Generates specific, actionable improvement suggestions
- Tagged with priority: "Cao" (< 50%) or "Trung bình" (50–69%)

### Visualization

- **Radar Chart** — Core competencies plotted on radar chart (Recharts)
- **Progress bars** — Individual competency scores with colored indicators
- **Department comparison** — Admin view shows radar overlay by department

---

## 8. Challenges & Rewards

### Challenge Structure

| Field             | Type   | Description                                 |
|-------------------|--------|---------------------------------------------|
| `title`           | text   | Challenge name                              |
| `quizId`          | text   | Linked quiz (must pass to complete)         |
| `knowledgeId`     | text   | Linked knowledge article (study first)      |
| `minScore`        | int    | Minimum % to pass (default: 70)             |
| `xpReward`        | int    | Bonus XP on completion                      |
| `deadline`        | date   | Expiry date                                 |
| `assignTo`        | text   | `"all"`, `"dept"`, user ID, or JSON array   |
| `assignDept`      | text   | Department (if `assignTo === "dept"`)        |
| `rewards`         | jsonb  | Array of physical reward strings            |
| `completedBy`     | jsonb  | Array of user IDs who completed             |
| `wonRewards`      | jsonb  | Map of `{userId: rewardName}`               |
| `delivered`       | jsonb  | Map of `{userId: boolean}` delivery status  |

### Challenge Completion Flow

1. Employee takes the linked quiz → scores ≥ `minScore`
2. `finishQuiz()` detects matching challenge → calls RPC `complete_challenge`
3. If rewards exist → random reward assigned (`wonRewards[userId]`)
4. XP bonus awarded via `increment_xp`
5. Notification sent to employee
6. Admin can mark rewards as "delivered" in the admin panel

### Assignment Modes

| Mode          | `assignTo` Value          |
|---------------|---------------------------|
| All employees | `"all"`                   |
| Department    | `"dept"` + `assignDept`   |
| Individual    | Single user UUID          |
| Multiple      | JSON array of user UUIDs  |

### Employee Challenge View

- **Active** — Ongoing challenges with quiz link and progress
- **Completed** — Shows earned XP and won rewards
- **Expired** — Past deadline, not completed

---

## 9. Learning Pathways

### Pathway Structure

```
Pathway
├── title, depts[], assignedTo[]
├── Stage 1
│   ├── Module 1 (knowledge link, quiz link, checklist, minScore)
│   ├── Module 2
│   └── ...
├── Stage 2
│   └── ...
└── ...
```

### Module Completion Criteria

A module is complete when:
1. **All checklist items** are checked off
2. **Linked quiz** passed with `pct ≥ minScore` (checked from both `results` table and `pathProgress`)

### Sequential Unlocking

- Modules must be completed in order
- Next module is **locked** until previous module is complete
- Visual lock icon (`🔒`) shown for locked modules

### Path Progress Tracking

- Stored in `profiles.path_progress` as:
  ```json
  {
    "pathId": {
      "checks": { "moduleId_0": true, "moduleId_1": false },
      "quizResults": { "quizId": { "passed": true, "pct": 85 } }
    }
  }
  ```
- Uses RPC `merge_path_progress` for atomic concurrent-safe updates
- Checklist items are toggleable by the employee

### Admin Pathway Management

- Create/Edit pathways with stages and modules
- Assign to departments and/or specific employees
- Link knowledge articles (read before quiz)
- Link quizzes with minimum score requirements
- AI-generated checklists for modules
- Progress tracking per assigned employee

---

## 10. Gamification: Badges & Leaderboard

### Badge System

| Badge ID          | Name       | Icon | Condition                              |
|-------------------|------------|------|----------------------------------------|
| `first_quiz`      | Bước Đầu   | 🎯   | Complete 1 quiz                        |
| `perfect`         | Hoàn Hảo   | 💯   | Score 100% on any quiz                 |
| `streak7`         | 7 Ngày Lửa | 🔥   | 7-day login streak                     |
| `streak30`        | Bền Bỉ     | 💪   | 30-day login streak                    |
| `pass5`           | Chiến Binh  | ⚔️   | Pass 5 quizzes                         |
| `pass10`          | Vô Địch    | 👑   | Pass 10 quizzes                        |
| `expert`          | Chuyên Gia  | 🎓   | Reach Chuyên gia level                 |
| `master`          | Master     | 🏆   | Reach Master level                     |
| `all_knowledge`   | Bách Khoa  | 📚   | Read all knowledge articles            |
| `trio_excellent`  | Hat-trick  | 🎩   | 3 consecutive scores ≥ 90%            |

### Leaderboard (`Leaderboard` component)

- **Filterable by department** or "All"
- **Sorted by XP** (descending)
- Shows: rank medal (🥇🥈🥉), level icon, name, department, streak, XP
- Highlights current user with gold accent
- Excludes inactive accounts

---

## 11. Bulletins & Policies

### Bulletin Types

| Type     | `type`    | Icon | Color  |
|----------|-----------|------|--------|
| Notice   | `notice`  | 📢   | Gold   |
| Policy   | `policy`  | 📋   | Red    |
| News     | `news`    | 📰   | Blue   |
| Event    | `event`   | 🎉   | Green  |

### Features

- **Pinning** — Admin can pin bulletins to top
- **Rich rendering** — Content parsed for headers, bullet points, numbered lists
- **Important section detection** — Auto-highlights sections containing "LƯU Ý", "QUAN TRỌNG", "BẮT BUỘC"
- **Employee view** — List view → detail view with formatted content
- **Director creation** — Directors can create bulletins without admin access
- **AI drafting** — Admin can generate bulletin drafts via Claude prompt

---

## 12. Notifications

### Notification Types

| Type          | Trigger                              |
|---------------|--------------------------------------|
| `challenge`   | New challenge assigned               |
| `recognition` | Employee recognized/awarded          |
| `pathway`     | Assigned to learning pathway         |
| `info`        | General notifications                |
| `reward`      | Reward delivered for challenge       |

### Features

- **Unread counter** on employee dashboard
- **Mark as read** — Individual or bulk
- **Deep linking** — Challenge notifications navigate to challenge screen
- **Admin cleanup** — Bulk delete old notifications (before a cutoff date)
- **Real-time delivery** — Created during challenge/path assignment and saved to DB

---

## 13. Recognitions & Awards

### Recognition Types

| Type         | Icon | Label      |
|--------------|------|------------|
| `excellent`  | 🏆   | Xuất sắc   |
| `improved`   | 📈   | Tiến bộ    |
| `star`       | ⭐   | Ngôi sao   |

### Features

- Admin creates recognition with employee selection, type, and message
- Notification sent to recognized employee
- History displayed on admin ranking page and employee dashboard
- Recent recognitions shown on employee home screen

---

## 14. Admin Dashboard & Analytics

### Admin Home Screens

| Screen              | Route Key          | Features                                    |
|---------------------|--------------------|---------------------------------------------|
| Dashboard           | `admin_home`       | Stats cards, quick actions                  |
| User Management     | `admin_accounts`   | CRUD users, roles, departments              |
| Quiz Management     | `admin_quizzes`    | Create/edit/import quizzes, AI generation   |
| Knowledge Mgmt      | `admin_lessons`    | Create/edit articles, PDF upload, AI content|
| Analytics           | `admin_analytics`  | Department/individual performance analysis  |
| Ranking             | `admin_ranking`    | Leaderboard, recognition management         |
| Challenges          | `admin_challenges` | Challenge/pathway CRUD                      |
| Activity            | `admin_activity`   | 30-day activity chart, inactive employees   |
| Bulletins           | `admin_bulletins`  | Bulletin management                         |
| Settings            | `admin_settings`   | XP, levels, departments, decay settings     |
| Backup              | `admin_backup`     | Export/import data, version info            |
| Changelog           | `admin_changelog`  | Version history with timeline UI            |

### Analytics Features (`admin_analytics`)

- **Department/Team/Employee** filter hierarchy
- **Individual employee detail:**
  - Profile card with level, XP, streak, check-in count
  - Radar chart — competency by quiz topic
  - Competency assessment with improvement suggestions
  - Result history (last 10 attempts)
- **Department overview:**
  - Radar chart comparing departments (avg score vs. pass rate)
  - Employee list with clickable drill-down
  - Knowledge gaps report (quizzes with pass rate < 70%)
  - AI analysis prompt generation per employee

### Activity Tracking (`admin_activity`)

- **30-day bar chart** — Daily logins and quiz attempts
- **Inactive employee list** — Employees with no check-in > 7 days
- **Notification cleanup** — Bulk delete old notifications

---

## 15. Manager/Director Features

### Manager Team View (`mgr_team`)

- **Team overview stats** — Member count, team avg score, team avg XP
- **Per-member expandable cards:**
  - Level, XP, streak, quiz count, average score
  - Competency bars (6 core competencies)
  - Badge collection
  - Improvement suggestions
  - Recent quiz results
- **Challenge assignment** — Managers can create challenges for their team
- **Pathway progress** — View team members' progress on assigned pathways

### Director Privileges

- All manager features
- **Full HR view** — See all employees across departments (not just own dept)
- **Bulletin creation** — Create and publish bulletins/policies
- **Admin-level RLS** — `is_admin()` grants access via `emp_id = 'admin' OR acc_role = 'director'`

---

## 16. Backup & Restore

### Export

- **Full JSON backup** — All data tables exported as single JSON file
- **Includes:** accounts, knowledge, quizzes, results, recognitions, challenges, notifications, paths, bulletins, settings
- **Output formats:** `.txt` file download + clipboard copy
- **Fresh data reload** — Re-fetches all data from DB before export (avoids stale state)

### Import

- **File upload** — Accepts `.json` or `.txt` files
- **Validation** — Checks for valid JSON, required fields
- **Upsert logic** — Merges imported data with existing records
- **Status feedback** — Detailed success/error messages with record counts

### CSV Quiz Export/Import

- **Export** — Downloads quiz questions as CSV with columns: question, type, options, answer, explanation
- **Import** — Bulk import questions from CSV format
- **Mixed quiz support** — Separate sections for MC and essay questions

---

## 17. Settings & Configuration

### Configurable Values

| Category        | Settings                                            |
|-----------------|-----------------------------------------------------|
| **XP Scoring**  | `xpCorrect`, `xpPass`, `xpBonus90`, `xpPerfect`, `streakXP` |
| **Pass Score**   | `passScore` (default: 70%)                          |
| **XP Decay**     | `decayDays`, `decayXP` (absence penalty)            |
| **Idle Decay**   | `idleDays`, `idleXP` (no-learning penalty)          |
| **Levels**       | Custom level names, icons, minimum XP thresholds    |
| **Departments**  | Add/remove/rename departments                       |
| **Admin Password** | Change via Supabase Auth `updateUser`             |

### Settings Storage

- Stored in `settings` table as single JSONB row (id=1)
- Loaded on app init, cached in React state
- Saved via `DB.set("km-settings", settings)`

---

## 18. AI Integration

### Claude Proxy Edge Function

- **Endpoint:** Supabase Edge Function `claude-proxy`
- **Model:** `claude-sonnet-4-6`
- **Max tokens:** 4000–6000 depending on operation

### AI Operations

| Operation               | Prompt Builder Key    | Description                              |
|-------------------------|-----------------------|------------------------------------------|
| Quiz Generation (MC)    | `generate_quiz`       | Generate MC/TF questions from content    |
| Quiz Generation (Mixed) | `generate_mixed_quiz` | Generate MC + essay questions            |
| Interactive Content     | `interactive_lesson`  | Generate slides, flashcards, cheatsheet, mini-quiz |
| Essay Grading           | (inline prompt)       | Grade student essays with rubric/model answer |
| Performance Analysis    | `analyze_results`     | Analyze employee quiz performance        |
| Improvement Suggestions | `improvement_plan`    | Suggest learning improvements            |
| Challenge Ideas         | `create_challenge`    | Suggest challenges based on quiz library |
| Bulletin Draft          | `bulletin_draft`      | Draft bulletin content                   |
| Checklist Generation    | (inline prompt)       | Generate module checklists for pathways  |

### `buildPrompt()` Function

Central prompt builder that constructs structured prompts for each AI operation type, including:
- Relevant context data (quizzes, results, knowledge content)
- Output format instructions (always requesting JSON)
- Vietnamese language for all outputs

### AI Retry Logic (`callAIWithRetry`)

- Retries failed AI calls with configurable attempts
- Handles JSON parsing with `cleanJSON()` helper (strips markdown fences, trailing commas)

---

## 19. Data Architecture

### Data Access Layer (`DB` object)

The `DB` object provides a unified interface for Supabase CRUD operations:

| Method          | Description                                           |
|-----------------|-------------------------------------------------------|
| `DB.get(key)`   | Read data from Supabase table (with snake_case mapping) |
| `DB.set(key, data)` | Write data to Supabase table (with camelCase→snake_case mapping) |

### Table Key Mapping

| Frontend Key       | Supabase Table     |
|--------------------|--------------------|
| `km-accounts`      | `profiles`         |
| `km-quizzes`       | `quizzes`          |
| `km-knowledge`     | `knowledge`        |
| `km-results`       | `results`          |
| `km-challenges`    | `challenges`       |
| `km-notifications` | `notifications`    |
| `km-recognitions`  | `recognitions`     |
| `km-paths`         | `paths`            |
| `km-bulletins`     | `bulletins`        |
| `km-settings`      | `settings`         |

### Case Conversion

The app uses a mapping layer between frontend camelCase and database snake_case:

| Frontend (camelCase) | Database (snake_case)  |
|----------------------|------------------------|
| `empId`              | `emp_id`               |
| `accRole`            | `acc_role`             |
| `checkIns`           | `check_ins`            |
| `readLessons`        | `read_lessons`         |
| `pathProgress`       | `path_progress`        |
| `lastCheckIn`        | `last_check_in`        |
| `lastXpGainDate`     | `last_xp_gain_date`    |
| `quizType`           | `quiz_type`            |
| `timeLimit`          | `time_limit`           |
| `aiGenerated`        | `ai_generated`         |
| `createdAt`          | `created_at`           |

### Caching Strategy

- **`localStorage`** — Cached with `cacheSet(key, data)` / `cacheGet(key)`
- **TTL:** Cache invalidated by comparing with server data on fetch
- **Benefits:** Reduces Supabase reads on subsequent page loads
- **Invalidation:** Cache updated on every write operation

---

## 20. Database Schema

### Tables

| Table                    | Purpose                               | RLS  |
|--------------------------|---------------------------------------|------|
| `profiles`               | User accounts and progress            | ✅   |
| `quizzes`                | Quiz definitions and questions        | ✅   |
| `knowledge`              | Learning articles and media           | ✅   |
| `results`                | Quiz attempt results                  | ✅   |
| `challenges`             | Challenge definitions and completions | ✅   |
| `challenge_completions`  | Per-user challenge completion records | ✅   |
| `notifications`          | User notifications                    | ✅   |
| `recognitions`           | Employee recognitions/awards          | ✅   |
| `paths`                  | Learning pathway definitions          | ✅   |
| `bulletins`              | Company bulletins and policies        | ✅   |
| `settings`               | Platform configuration (single row)   | ✅   |
| `kingsmen_data`          | Generic key-value store               | ✅   |

### RPC Functions

| Function              | Purpose                                         |
|-----------------------|-------------------------------------------------|
| `increment_xp`       | Atomically increment/decrement user XP          |
| `complete_challenge`  | Atomically add user to challenge completedBy    |
| `merge_path_progress` | Atomically merge path progress (checklist/quiz) |
| `is_admin()`          | Check if current user is admin or director      |

### Row Level Security (RLS) Policies

| Table           | SELECT        | INSERT         | UPDATE         | DELETE      |
|-----------------|---------------|----------------|----------------|-------------|
| `profiles`      | All auth      | Admin or self  | Admin or self  | —           |
| `quizzes`       | All auth      | Admin only     | Admin only     | Admin only  |
| `knowledge`     | All auth      | Admin only     | Admin only     | Admin only  |
| `results`       | Own or admin  | Own or admin   | Own or admin   | —           |
| `challenges`    | All auth      | Admin only     | All auth       | Admin only  |
| `notifications` | Own or admin  | All auth       | Own or admin   | Own or admin|
| `recognitions`  | All auth      | All auth       | Admin only     | —           |
| `paths`         | All auth      | Admin only     | Admin only     | Admin only  |
| `bulletins`     | All auth      | Admin only     | Admin only     | Admin only  |
| `settings`      | All auth      | Admin only     | Admin only     | Admin only  |

### Supabase Storage Buckets

| Bucket    | Purpose                  |
|-----------|--------------------------|
| `pdfs`    | Knowledge article PDFs   |
| `avatars` | User profile photos      |

---

## 21. Key Utility Functions

| Function                  | Purpose                                          |
|---------------------------|--------------------------------------------------|
| `getLevel(xp, lvls)`     | Get current level object from XP                 |
| `getNextLevel(xp, lvls)` | Get next level object                            |
| `xpProgress(xp, lvls)`   | Progress ratio to next level (0–1)               |
| `visibleToDept(item, dept)` | Check if item is visible to a department       |
| `challengeVisibleTo(ch, user)` | Check if challenge is assigned to user       |
| `evalCompetency(...)`     | Calculate 6 competency scores from quiz data     |
| `getCompetencyLevel(score)` | Map score to label/color                       |
| `getImprovements(scores, dept)` | Generate improvement suggestions            |
| `getUserBadges(user)`     | Get list of earned badges                        |
| `getRating(pct)`          | Get rating label/color/emoji for a quiz score    |
| `getDeptAnalytics()`      | Aggregate analytics by department                |
| `getKnowledgeGaps()`      | Find quizzes with low pass rates                 |
| `getActivityData()`       | Generate 30-day activity chart data              |
| `buildPrompt(config)`     | Construct AI prompts for various operations      |
| `parseContentLP(content)` | Parse raw text into structured sections          |
| `toDriveImageUrl(url)`    | Convert Google Drive share link to direct image  |
| `cleanJSON(text)`         | Strip markdown fences from AI JSON responses     |
| `profileToCamel(row)`     | Convert DB snake_case profile to frontend camelCase |
| `fmtDate(d)`, `fmtTime(s)` | Format dates (vi-VN locale) and time durations |
| `daysSince(d)`            | Days elapsed since a date                        |

---

## 22. Deployment

### Docker Configuration

- **Multi-stage build:** Node.js build → Nginx serve
- **Nginx** serves the built React SPA
- **Docker Compose** manages environments

### Required Infrastructure

1. **Supabase Project** — Database, Auth, Storage, Edge Functions
2. **Edge Function:** `claude-proxy` — Proxies requests to Claude API
3. **Edge Function:** `create-user` — Creates auth users programmatically
4. **Storage Buckets:** `pdfs`, `avatars` with appropriate policies

### Database Setup

1. Run `supabase/migrations/00001_initial_schema.sql` in SQL Editor
2. Create admin auth user in Supabase Dashboard
3. Insert admin profile:
   ```sql
   INSERT INTO profiles (id, name, emp_id, dept, acc_role, status)
   VALUES ('<auth-user-uuid>', 'Admin', 'admin', 'Quản lý', 'director', 'active');
   ```

---

## Appendix: Screen Navigation Map

```
Login
├── Admin Role
│   ├── admin_home (Dashboard)
│   ├── admin_accounts (User Management)
│   ├── admin_quizzes (Quiz Management)
│   │   └── Quiz Editor / AI Generator / CSV Import
│   ├── admin_lessons (Knowledge Management)
│   │   └── Article Editor / PDF Upload / AI Interactive Generation
│   ├── admin_analytics (Performance Analytics)
│   │   └── Department/Team/Employee drill-down
│   ├── admin_ranking (Leaderboard & Recognitions)
│   ├── admin_challenges (Challenges & Pathways)
│   │   ├── Challenge CRUD
│   │   └── Pathway CRUD (Stages → Modules → Checklists)
│   ├── admin_activity (30-Day Activity & Cleanup)
│   ├── admin_bulletins (Bulletin Management)
│   ├── admin_settings (XP, Levels, Departments, Decay)
│   ├── admin_backup (Export/Import Data)
│   └── admin_changelog (Version History)
│
└── Employee Role
    ├── emp_home (Dashboard + Profile + Notifications + Quick Actions)
    ├── emp_knowledge (Knowledge List → Knowledge Detail → Fullscreen Learning)
    ├── emp_quizzes (Quiz List → Quiz Play → Essay Grading → Quiz Result)
    ├── emp_results (Result History)
    ├── emp_ranking (Company Leaderboard)
    ├── emp_badges (Badge Collection)
    ├── emp_challenges (Active/Completed/Expired Challenges)
    ├── emp_pathway (Learning Pathways → Path Detail → Module Checklists)
    ├── emp_bulletins (Bulletin List → Bulletin Detail)
    ├── emp_competency (Competency Radar + Scores + Improvements)
    ├── emp_changepw (Change Password)
    ├── emp_review (Review Mode — Flashcards + Cheat Sheets across all articles)
    ├── mgr_team (Manager: Team Overview + Member Details + Challenge Assignment)
    └── dir_bulletins (Director: Create Bulletins)
```
