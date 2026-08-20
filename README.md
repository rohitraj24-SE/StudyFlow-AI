# ⚡ StudyFlow AI

**Plan → Study → Track → Test → Analyze → Improve.**

StudyFlow AI is a full-stack MERN learning companion built around one repeating loop, not a pile of disconnected features. Everything in the product exists to move a student through that loop: a visual study planner with smart rescheduling, a server-truth study timer, a practice/test engine with an automatic mistake tracker, spaced-repetition flashcards, an AI study coach that can explain any topic on demand, real analytics, and a secondary Career Readiness view — all in one dashboard called **My Learning Space**, plus onboarding that adapts to who the student actually is (school, PU/junior college, undergrad, postgrad, or a competitive/government-exam aspirant).

Every AI feature is **optional and additive**: the app ships fully functional with zero external API keys, and upgrades itself automatically the moment you add `OPENAI_API_KEY`.

---

## Table of contents

- [Product philosophy: the loop](#product-philosophy-the-loop)
- [Features](#features)
- [Onboarding & Profile](#onboarding--profile)
- [My Learning Space (Dashboard)](#my-learning-space-dashboard)
- [Smart Study Timer architecture](#smart-study-timer-architecture)
- [Smart planning: remaining plan & rescheduling](#smart-planning-remaining-plan--rescheduling)
- [Practice, Tests & Mistake Tracker](#practice-tests--mistake-tracker)
- [Revision & Flashcards](#revision--flashcards)
- [Quick Study Mode & Focus Mode](#quick-study-mode--focus-mode)
- [AI architecture](#ai-architecture)
- [Career Readiness](#career-readiness)
- [Push notification architecture](#push-notification-architecture)
- [Analytics: PDF + CSV export](#analytics-pdf--csv-export)
- [Mobile navigation](#mobile-navigation)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Gamification rules](#gamification-rules)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [MongoDB setup](#mongodb-setup)
- [OpenAI setup](#openai-setup)
- [Push notification (VAPID) setup](#push-notification-vapid-setup)
- [Local development](#local-development)
- [Vercel deployment](#vercel-deployment)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Future improvements](#future-improvements)

---

## Product philosophy: the loop

```
      ┌─────────┐
      │  PLAN   │  Set a target: subject, topic, duration
      └────┬────┘
           ▼
      ┌─────────┐
      │  STUDY  │  Open the Study Timer, focus on one task
      └────┬────┘
           ▼
      ┌─────────┐
      │  TRACK  │  Server-truth elapsed time, never a browser guess
      └────┬────┘
           ▼
      ┌─────────┐
      │  TEST   │  Quiz yourself on what you just studied
      └────┬────┘
           ▼
      ┌─────────┐
      │ ANALYZE │  Real accuracy, weak topics, planned vs. actual
      └────┬────┘
           ▼
      ┌─────────┐
      │ IMPROVE │  AI recommends the next concrete move
      └────┬────┘
           └──────────► back to PLAN
```

This loop is the app's organizing idea, not just landing-page copy — it's why the Timer, Practice, Analytics, and AI Coach are wired directly into each other (finishing a session offers a quick test; a weak topic from that test opens Practice pre-filled; the Dashboard's "Next Best Move" is generated from the same facts Analytics shows you). Career/placement prep is a **secondary** feature (its own "Career" tab), not the homepage.

---

## Features

**Onboarding & Profile**
- Adaptive onboarding wizard — only asks fields relevant to the student's actual education level (school class, PU stream, UG year/branch, competitive/government exam target, etc.).
- Full Profile tab: education, goals, subjects, strengths/weak areas, study statistics, skills, career interests, achievements, and an AI-written student summary.

**My Learning Space (Dashboard)**
- "Your Next Best Move" — one concrete recommendation with a real reason, not a KPI wall.
- Circular "Today's Learning" progress ring (target vs. actual vs. remaining).
- "Continue Where You Left Off" — resumes a genuinely unfinished session, never a fabricated percentage.
- "AI noticed something…" insight card, Topics to Strengthen / Your Strengths, and thumb-friendly Quick Actions.

**Smart Study Timer**
- A real, server-truth active study session tracker (Start/Pause/Resume/Finish), backed by timestamps rather than a browser countdown.
- Interruption detection, multi-device conflict handling, a minimized floating "● STUDYING" widget, and a distraction-free **Focus Mode** overlay.
- **AI Remaining Plan** — breaks whatever time is left today across your actual incomplete planner tasks, with breaks between blocks.

**Smart Study Planner**
- Visual "Learning Timeline" (connecting rail + status dots) instead of a flat task list.
- **Smart rescheduling** — a missed task doesn't just sit as "failed"; the app suggests a real, non-overlapping later slot with one-click Accept.

**Practice, Tests & Mistake Tracker**
- Subject/topic quizzes (AI-generated when configured, with an offline fallback bank so it always works), adaptive difficulty from your real recent scores, and automatic **My Mistakes** tracking with inline retry.

**Revision & Flashcards**
- Manual, AI-generated, and mistake-derived flashcards with real spaced repetition (a 5-step interval ladder), plus a flip-card review session for cards that are actually due.

**Quick Study Mode & Focus Mode**
- "I have 5/10/15 minutes" → routes into flashcards, a quick quiz, or a real tracked focus session on your weakest subject — never a fabricated fourth activity type.

**AI Study Coach**
- Rule-based recommendation cards (always available, no API key needed), an LLM-narrated insight card, free-form conversational coaching, and **"Learn Anything"** — explain any topic/question with an example and key points, then quiz yourself on it or ask a follow-up.

**Career Readiness (secondary)**
- Real per-subject test accuracy and interview-prep completion, with a Kanban job-application tracker underneath.

**Analytics & Notifications**
- Completion rate, subject breakdown, 30-day trend, hourly performance, focus heatmap, PDF/CSV export.
- Tab-open reminders tied to remaining study time, plus optional background Web Push.

**Platform**
- Real mobile bottom navigation (Home / Study / Practice / Insights / Profile + More), not a shrunk desktop layout.
- Gamification (XP, streaks, 15 badges spanning study *and* testing), JWT + bcrypt auth, MongoDB persistence, one-click Vercel deployment.

---

## Onboarding & Profile

A new account is routed straight into an adaptive wizard (`public/onboarding.js`) instead of an empty dashboard. The student picks an education level first — **School, PU/Junior College, Undergraduate, Postgraduate, Competitive Exam, Government Exam, or Other** — and every later step only shows fields relevant to that choice (e.g. Class 6–12 for School; Year/Branch/Semester for Undergraduate; Target Exam/Date for Competitive/Government). Nothing irrelevant is forced.

The wizard writes to `profile`, a proper Mongoose sub-schema on `User` (not a loosely-typed blob), via `PUT /api/profile`. "Skip for now" is always available on step one and still marks `onboardingCompleted`, so a student is never stuck.

The **Profile tab** (`public/profile.js`) reads that same data back plus real gamification/analytics facts, and adds two inline-editable list fields the wizard doesn't collect (Skills, Career Interests). An **AI Student Summary** card narrates the profile in plain language when an LLM is configured.

---

## My Learning Space (Dashboard)

The dashboard answers one question first — *"what should I do now?"* — rather than opening on a wall of statistics:

1. **Your Next Best Move** — the highest-priority unfinished task for today, enriched with a real "why" pulled from the matching rule-based recommendation.
2. **Today's Learning** — a circular progress ring computed from `GET /api/study-sessions/remaining` (target / actual / remaining seconds — all server-truth).
3. **Continue Where You Left Off** — only rendered when `GET /api/study-sessions/continue` finds something genuinely unfinished (a paused/interrupted run, or a completed run linked to an incomplete planner slot with a real percent-complete summed from every timer run against it). Hidden entirely otherwise — never a fabricated card.
4. **AI noticed something…** — the same `coach-insight` endpoint the AI Coach tab uses, surfaced a second place.
5. **Topics to Strengthen / Your Strengths** — from `GET /api/ai/facts`, the same deterministic engine behind recommendations, exposed without requiring an LLM key.
6. **Quick Actions** — Study Session, Take a Test, Quick Study, Ask AI, Planner.

---

## Smart Study Timer architecture

**Why a separate model from the planner.** `server/models/StudySession.js` (the weekly planner) answers *"what's on the timetable?"* `server/models/StudySessionTimer.js` answers *"did the student actually study, and for how long?"* — a timestamp-driven, server-authoritative record. One planner slot can be linked to zero, one, or several timer runs.

**The backend is the only source of truth for elapsed time.** The frontend never invents active seconds with its own `setInterval` counter — every second credited to `totalActiveSeconds` is computed server-side in `server/services/timerService.js`.

```
[ START STUDY ]
     │
     ▼
POST /api/study-sessions/start  →  StudySessionTimer created, sessionStartedAt = now
     │
     ▼  (every ~30s while running)
POST /api/study-sessions/:id/heartbeat
     │   • credits min(now - lastActiveAt, 90s) to totalActiveSeconds
     │   • a real gap beyond 90s (tab closed / device slept / network
     │     dropped) flips the session to "interrupted" instead of
     │     silently trusting the gap as study time
     ▼
[ PAUSE ] → totalPausedSeconds accumulates, no active time added
[ RESUME ] → active accounting continues; an interrupted gap is never backfilled
[ FINISH ] → status → completed; XP/streak/badges awarded from ACTUAL
             minutes studied (never planned minutes); a linked planner
             slot is marked completed if the target was met
```

**Multi-device safety:** `POST /start` checks for another live session first. If one exists it responds `409` with a snapshot; the frontend shows **Continue There / Take Over Here / End That Session**. "Take Over Here" finalizes the old session as `interrupted` before starting the new one — time is never double-counted.

**Focus Mode** is a distraction-free full-screen view of the *same* live session — `updateTimerDisplay()` syncs the overlay's elements alongside the normal Timer tab view and the minimized widget, so there's exactly one poll loop regardless of which view is showing.

**Endpoints** (all under `/api/study-sessions`, JWT-protected):

| Method | Route | Description |
|---|---|---|
| POST | `/start` | Starts a session. `409` on an existing live session unless `force: true`. |
| GET | `/active` | Current live session, live-computed; reconciles a stale session server-side. |
| POST | `/:id/heartbeat` | Called every ~30s while running. |
| POST | `/:id/pause` / `/:id/resume` | Pause banks time; resume excludes any interrupted gap. |
| POST | `/:id/finish` | Finalizes; awards real XP; can complete a linked planner slot. |
| GET | `/today` | Today's target/actual/remaining plus each individual run. |
| GET | `/remaining` | Lightweight target/actual/remaining/percent (powers the Dashboard's ring). |
| GET | `/continue` | "Continue Where You Left Off" — see [My Learning Space](#my-learning-space-dashboard). |
| GET | `/remaining-plan` | AI Remaining Plan — see below. |

---

## Smart planning: remaining plan & rescheduling

**AI Remaining Plan** (`timerService.buildRemainingPlan`) takes today's real `remainingSeconds` and today's real incomplete planner tasks (priority-sorted), and either keeps each task's own planned duration (if they all fit) or scales every block down proportionally (if they don't) — then schedules them back-to-back with 10-minute breaks starting from "now." It never invents a task that isn't already on the plan.

**Smart rescheduling** (`public/app.js`) flags a planner task as *missed* once its planned end time has passed while still incomplete, and — instead of a dead "FAILED" state — computes a real, non-overlapping later slot (starting from now + 10 min, walking forward past any of today's *other* pending sessions) and offers one-click Accept.

---

## Practice, Tests & Mistake Tracker

The **Practice** tab (`public/practice.js`, backend `server/routes/testRoutes.js` + `mistakeRoutes.js`) lets a student generate a quiz (subject, topic, difficulty, question count), take it, and get graded **server-side against a stored answer key** — the client never sees `correctIndex` until after submission, and a client-sent "correct" flag is never trusted.

- **AI-generated when configured, offline fallback otherwise** (`server/services/quizService.js`) — Practice works with or without an API key.
- **Adaptive difficulty** — after enough recent attempts on a subject, the app suggests stepping difficulty up or down based on real average accuracy.
- **My Mistakes** — every wrong answer is saved automatically (`Mistake` model) and shown for inline retry; a correct retry marks it resolved.
- **Real XP** — a small base + accuracy bonus, and two new badges (*First Test Completed*, *Sharp Shooter*), deliberately kept separate from the study-streak system so testing complements studying rather than gaming it.

---

## Revision & Flashcards

The **Revision** tab (`public/revision.js`, backend `server/services/flashcardService.js` + `server/routes/flashcardRoutes.js`) runs a real spaced-repetition system on the `Flashcard` model:

- **Three sources:** manual creation, AI-generated on a topic, or built directly from a Mistake with one click ("📇 Make Flashcard" on any mistake card).
- **Spaced repetition:** a 5-step interval ladder (1 / 3 / 7 / 14 / 30 days) — a correct review promotes the card, a wrong one resets it to day one. Status (New / Learning / Mastered) is derived from the same ladder, so it can't drift out of sync.
- **Review session:** tap to flip, then "Still Learning" or "Got It" — only cards that are actually due are shown.

---

## Quick Study Mode & Focus Mode

**Quick Study Mode** ("I have 5/10/15 minutes," `public/quickstudy.js`) is a router, not a fourth activity system:

| Time | Routes to | On |
|---|---|---|
| 5 min | Revision tab | Due flashcards |
| 10 min | Practice tab | A 5-question quiz on your real weakest subject (or last-studied, or "General Review" for a new account) |
| 15 min | Timer tab | A genuinely tracked 15-minute focus session on that same subject |

**Focus Mode** — see [Smart Study Timer architecture](#smart-study-timer-architecture) above.

---

## AI architecture

```
Frontend (chat UI / recommendation cards / Learn Anything)
        │
        ▼
AI API routes  (server/routes/aiRoutes.js)
        │
        ▼
Centralized LLM service (server/services/llmService.js)
        │
        ▼
      OpenAI API
        │
        ▼
   Backend → Frontend
```

**Why deterministic facts + LLM, not LLM alone:** `server/utils/studyFacts.js` is the single source of truth for numeric analysis (completion rate, streak, weak/strong subjects, best study time, weekly gaps) — the same calculation used by the rule-based `/api/ai/recommendations` engine and exposed directly at `GET /api/ai/facts` for anything (like the Dashboard) that needs it without an LLM key. Those facts are handed to the LLM as ground truth; the model's job is to **narrate and coach**, never to invent numbers.

**Everything degrades gracefully without `OPENAI_API_KEY`:**

| Feature | With `OPENAI_API_KEY` | Without it |
|---|---|---|
| `POST /api/ai/doubt-clear` | Real LLM answer | Rule-based keyword matcher |
| `GET /api/ai/coach-insight` | LLM-narrated paragraph from real stats | Card is hidden (not an error) |
| `POST /api/ai/coach` (chat) | Full conversational coaching, grounded in your stats | Friendly "not configured" message |
| `POST /api/ai/learn` ("Learn Anything") | Explanation + example + key points | `{ configured:false }` — frontend still offers "Quiz me on this" via the offline quiz bank |
| `POST /api/tests/generate` | AI-generated questions | Offline fallback question bank |
| `GET /api/ai/recommendations` / `GET /api/ai/facts` | Unchanged — always rule-based | Unchanged — always rule-based |

**Cost control:** conversation history capped to the last 8 turns, response tokens capped per feature (500 chat / 220 insight / 500 explanation / 350 curriculum), no full database dumps.

---

## Career Readiness

The **Career** tab leads with a real readiness snapshot (`GET /api/jobs/career-readiness`) — per-subject test accuracy from your own `TestAttempt`s, interview-prep completion from synced planner sessions, and a recommendation only when a subject's accuracy is genuinely below threshold — before the existing Kanban job-application tracker below it. Placement prep supports the main loop; it isn't the app's front door.

---

## Push notification architecture

```
Browser tab → Service Worker (public/sw.js) → PushManager subscribe (VAPID)
     │
     ▼
PushSubscription saved to MongoDB
     │
     ▼
Backend (server/utils/pushSender.js, `web-push`) → Push Service → Service Worker `push` event → OS notification
```

Layered **on top of**, not instead of, tab-open reminders (`public/notifications.js`) — both run side by side; background push is entirely optional. `GET /api/cron/daily-digest`, wired via `vercel.json`, sends a once-daily summary (Vercel Hobby plan cron limitation — see [Known limitations](#known-limitations)).

---

## Analytics: PDF + CSV export

**[Download PDF Report]** (jsPDF, client-side) and **[Download CSV]** (`GET /api/analytics/export/csv`, RFC 4180-escaped, one row per real `StudySession`) sit side by side on the Analytics tab.

---

## Mobile navigation

At ≤680px, the sidebar is replaced — not shrunk — by a fixed bottom nav with exactly the five destinations that matter most on a phone: **Home, Study, Practice, Insights, Profile**, plus a **More** sheet (slides up from the bottom) for everything else: Planner, Revision, AI Coach, Resources, Career, Achievements, Reminders, Settings, Logout. The minimized live-timer widget repositions itself above the bottom nav so it's never hidden or overlapped, and all touch targets are ≥44px with `env(safe-area-inset-bottom)` padding for notched devices. The tablet range (681–860px) keeps the existing horizontal icon-row sidebar.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (no build step), [Chart.js](https://www.chartjs.org/) for charts, [jsPDF](https://github.com/parallax/jsPDF) for PDF export |
| Backend | Node.js, Express.js |
| Database | MongoDB with Mongoose |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` password hashing |
| AI | [`openai`](https://www.npmjs.com/package/openai) SDK — real LLM coaching + explanations + quiz generation, optional |
| Push notifications | Service Worker + Push API + [`web-push`](https://www.npmjs.com/package/web-push) (VAPID) — optional |
| Security | [`helmet`](https://www.npmjs.com/package/helmet) (protective headers), [`express-rate-limit`](https://www.npmjs.com/package/express-rate-limit) (auth brute-force protection) |
| Deployment | Vercel serverless functions (`@vercel/node`) + static hosting (`@vercel/static`) + Vercel Cron |

Minimum Node version: `>=18.x` (see `package.json` → `engines`).

---

## Project structure

```
smart-study-planner/
├── api/
│   └── index.js                     # Vercel serverless entrypoint (exports the Express app)
├── server/
│   ├── app.js                       # Shared Express app — used by BOTH server.js and api/index.js
│   ├── config/
│   │   └── db.js                    # Cached MongoDB connection (serverless-safe)
│   ├── models/
│   │   ├── User.js                  # Auth + gamification fields + `profile` sub-schema (Phase 1/21)
│   │   ├── StudySession.js          # day, subject, timeSlot, priority, tag, completed (the planner)
│   │   ├── StudySessionTimer.js     # server-truth active study session run
│   │   ├── Test.js / TestAttempt.js # generated quizzes + graded attempts
│   │   ├── Mistake.js               # auto-filed wrong answers, retryable
│   │   ├── Flashcard.js             # spaced-repetition flashcards (manual/AI/mistake-derived)
│   │   ├── JobApplication.js        # status, interviewDate, prepPlan[], prepConfig{}
│   │   └── PushSubscription.js      # one doc per device/browser push subscription
│   ├── middleware/
│   │   └── authMiddleware.js        # JWT auth guard (protect)
│   ├── services/
│   │   ├── llmService.js            # ONLY place that talks to OpenAI (chat, insight, curriculum, explainTopic, generateFlashcards)
│   │   ├── timerService.js          # elapsed time, continuePoint(), buildRemainingPlan()
│   │   ├── quizService.js           # test generation (AI + offline fallback), adaptive difficulty
│   │   └── flashcardService.js      # manual/AI/mistake-derived cards, Leitner-box scheduling
│   ├── routes/
│   │   ├── authRoutes.js            # signup / login / me / preferences (rate-limited)
│   │   ├── sessionRoutes.js         # planner CRUD + weekly view
│   │   ├── studySessionRoutes.js    # start/heartbeat/pause/resume/finish/active/today/remaining/continue/remaining-plan
│   │   ├── analyticsRoutes.js       # overview + heatmap + daily briefing + CSV export
│   │   ├── aiRoutes.js              # status, doubt-clear, coach, recommendations, coach-insight, facts, learn
│   │   ├── testRoutes.js            # generate/submit/history/adaptive-suggestion
│   │   ├── mistakeRoutes.js         # list + retry
│   │   ├── flashcardRoutes.js       # CRUD + due + review + from-mistake + generate
│   │   ├── profileRoutes.js         # onboarding wizard read/write + AI summary
│   │   ├── jobRoutes.js             # Kanban CRUD, prep-plan, prep-config, AI suggestion, career-readiness
│   │   ├── notificationRoutes.js    # VAPID public key, subscribe/unsubscribe, test push
│   │   └── cronRoutes.js            # GET /api/cron/daily-digest (Vercel Cron target)
│   └── utils/
│       ├── gamification.js          # XP/streak/badge logic (study + test completion)
│       ├── sanitize.js              # asQueryString() — NoSQL-injection-safe query param handling
│       ├── doubtBot.js              # rule-based chatbot fallback engine
│       ├── interviewPrep.js         # default + custom prep-plan generators, role curricula
│       ├── studyFacts.js            # single source of truth for AI-facing analytics facts
│       └── pushSender.js            # web-push wrapper, VAPID setup, expired-subscription cleanup
├── public/
│   ├── index.html
│   ├── style.css
│   ├── sw.js                        # service worker (push + notificationclick handling)
│   ├── api.js / auth.js / app.js    # core app shell + fetch helpers + mobile "More" sheet
│   ├── theme.js / quotes.js         # dark mode + daily motivation quote
│   ├── heatmap.js / briefing.js / planner-views.js
│   ├── onboarding.js / profile.js   # adaptive wizard + Profile tab
│   ├── dashboard.js                 # My Learning Space + Analytics + AI Coach + Learn Anything
│   ├── timer.js                     # Smart Timer + Focus Mode + Remaining Plan + Study History
│   ├── practice.js / revision.js    # Tests/Mistakes + Flashcards/Revision
│   ├── quickstudy.js                # "I have X minutes" router
│   ├── jobs.js                      # Kanban + Career Readiness + prep plan UI
│   ├── notifications.js             # tab-open reminders + service worker registration + push toggle
│   ├── pdf.js                       # PDF report + CSV export triggers
│   └── gamification.js / resources.js / doubtchat.js
├── server.js                        # Local dev entrypoint only (`npm run dev`)
├── vercel.json                      # routes /api/* to the serverless function, rest to /public, + cron
├── package.json
└── .env.example
```

---

## Data model

**User** — auth credentials, gamification state (`xp`, `streak`, `longestStreak`, `totalSessionsCompleted`, `totalMinutesStudied`, `totalTestsCompleted`, `badges[]`), notification preferences, and a `profile` sub-schema:
```
profile: {
  educationLevel, schoolClass, year, semester, branch, department, stream,
  institution, subjects[], academicGoals, careerGoals, targetExam, targetDate,
  dailyStudyMinutes, preferredStudyTime, strengths[], weakAreas[],
  learningPreferences[], careerInterests[], skills[], onboardingCompleted
}
```

**StudySession** — `day`, `subject`, `timeSlot`, `startTime`, `duration`, `goal`, `priority`, `tag`, `completed`, `completedAt`.

**Test** — generated quiz: `subject`, `topic`, `difficulty`, `source` (`ai`|`fallback`), `questions[]` (`questionText`, `options[]`, `correctIndex`, `explanation` — never sent to the client pre-submission).

**TestAttempt** — `test`, `subject`, `topic`, `difficulty`, `answers[]`, `score`, `totalQuestions`, `accuracy`, `timeSpentSeconds`.

**Mistake** — `subject`, `topic`, `questionText`, `options[]`, `correctIndex`, `selectedIndex`, `explanation`, `resolved`.

**Flashcard** — `subject`, `topic`, `front`, `back`, `source` (`manual`|`ai`|`mistake`), `box` (1–5), `nextReviewAt`, `lastReviewedAt`, `reviewCount`; `status()` derives New/Learning/Mastered from `box`.

**JobApplication** — `company`, `role`, `status`, `appliedDate`, `interviewDate`, `link`, `location`, `salary`, `notes`, `nextStep`/`nextStepDate`, `prepPlan[]`, `prepConfig{ targetRole, experienceLevel, dailyPrepMinutes, topics[], aiSuggestion }`.

**PushSubscription** — `user`, `endpoint` (unique), `keys.p256dh`, `keys.auth`, `userAgent`.

---

## API reference

All routes below except `/api/auth/signup`, `/api/auth/login`, and `/api/notifications/vapid-public-key` require an `Authorization: Bearer <token>` header. `/api/auth/login` and `/api/auth/signup` are additionally rate-limited (20 requests / 15 min / IP).

### Auth — `/api/auth`
| Method | Route | Description |
|---|---|---|
| POST | `/signup` | Create an account, returns user + JWT |
| POST | `/login` | Authenticate, returns user + JWT |
| GET | `/me` | Get the current user's profile |
| PUT | `/preferences` | Update `notificationsEnabled` / `reminderMinutesBefore` |

### Profile (onboarding) — `/api/profile`
| Method | Route | Description |
|---|---|---|
| GET | `/` | Read the student's profile |
| PUT | `/` | Partial or full update; `{ completeOnboarding: true }` marks the wizard done |
| GET | `/summary` | AI-written one-paragraph student summary (requires `OPENAI_API_KEY`) |

### Sessions (planner) — `/api/sessions`
| Method | Route | Description |
|---|---|---|
| GET | `/` | List all sessions |
| GET | `/day/:day` | List sessions for a weekday (`Mon`…`Sun`) |
| POST | `/` | Create a session |
| PUT | `/:id` | Update a session (completing it awards XP/streak/badges) |
| DELETE | `/:id` | Delete a session |
| GET | `/weekly/all` | All sessions grouped by weekday |

### Smart Timer — `/api/study-sessions`
| Method | Route | Description |
|---|---|---|
| POST | `/start` | Start a tracked session. `409` if one's already live, unless `force: true`. |
| GET | `/active` | Current live session, live-computed. |
| POST | `/:id/heartbeat` | Keep-alive; advances real elapsed time, capped. |
| POST | `/:id/pause` / `/:id/resume` | Pause/resume. |
| POST | `/:id/finish` | Finalize; awards XP for actual minutes. |
| GET | `/today` | Today's target/actual/remaining + individual runs. |
| GET | `/remaining` | Lightweight target/actual/remaining/percent. |
| GET | `/continue` | "Continue Where You Left Off." |
| GET | `/remaining-plan` | AI Remaining Plan (deterministic scheduler). |

### Tests / Practice — `/api/tests`
| Method | Route | Description |
|---|---|---|
| GET | `/adaptive-suggestion` | Suggested next difficulty from real recent attempts |
| POST | `/generate` | Generate a quiz (`{ subject, topic?, difficulty?, numQuestions? }`) — answer key withheld |
| POST | `/:id/submit` | Grade server-side; files a Mistake per wrong answer; awards XP |
| GET | `/history` | Recent test attempts |

### Mistakes — `/api/mistakes`
| Method | Route | Description |
|---|---|---|
| GET | `/` | Unresolved mistakes (optional `?subject=`) |
| POST | `/:id/retry` | Grade a retry; marks resolved on success |

### Flashcards — `/api/flashcards`
| Method | Route | Description |
|---|---|---|
| GET | `/` | All flashcards (optional `?subject=`) |
| GET | `/due` | Cards due for review right now |
| POST | `/` | Create a manual flashcard |
| POST | `/generate` | AI-generate flashcards on a topic |
| POST | `/from-mistake/:mistakeId` | Create a flashcard from a mistake (idempotent) |
| POST | `/:id/review` | Record a review outcome; advances the Leitner box |
| DELETE | `/:id` | Delete a flashcard |

### Analytics — `/api/analytics`
| Method | Route | Description |
|---|---|---|
| GET | `/overview` | Completion rate, subject breakdown, weekly activity, 30-day trend, hourly performance, heatmap |
| GET | `/briefing` | Today's task count, next session, top-priority task, nearest job deadline, streak/XP |
| GET | `/export/csv` | Downloads a CSV of every study session |

### AI — `/api/ai`
| Method | Route | Description |
|---|---|---|
| GET | `/status` | `{ llmConfigured, model }` |
| POST | `/doubt-clear` | Quick Q&A; real LLM if configured, rule-based fallback otherwise |
| POST | `/coach` | Free-form conversational coaching, grounded in real study facts |
| GET | `/recommendations` | Rule-based coaching cards (always available) |
| GET | `/coach-insight` | LLM-narrated paragraph from real facts (requires `OPENAI_API_KEY`) |
| GET | `/facts` | The same deterministic facts, raw — no LLM required |
| POST | `/learn` | "Learn Anything" — explanation + example + key points |

### Jobs / Career — `/api/jobs`
| Method | Route | Description |
|---|---|---|
| GET | `/` | List job applications |
| GET | `/stats` | Status breakdown, active count, response rate |
| GET | `/career-readiness` | Per-subject test accuracy + interview-prep completion + recommendation |
| POST | `/` | Create an application |
| PUT | `/:id` | Update an application (Kanban status changes go through here) |
| DELETE | `/:id` | Delete an application |
| POST | `/:id/prep-plan` | Generate the default fixed-curriculum prep plan |
| POST | `/:id/prep-plan/sync-to-planner` | Turn each prep-plan day into a real `StudySession` |
| GET | `/prep-config/roles` | Built-in role → topic-checklist templates |
| PUT | `/:id/prep-config` | Save target role, experience, daily time, and topic checklist |
| POST | `/:id/prep-plan/custom` | Generate a plan from the saved custom `prepConfig` |
| POST | `/:id/prep-config/ai-suggestion` | Ask the AI to prioritize selected topics into Priority 1/2/3 |
| PUT | `/:id/prep-config/ai-suggestion/:action` | Accept or reject a pending AI suggestion |

### Notifications (push) — `/api/notifications`
| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/vapid-public-key` | No | Returns `{ configured, publicKey }` |
| POST | `/subscribe` | Yes | Saves/refreshes a push subscription |
| DELETE | `/unsubscribe` | Yes | Removes a push subscription |
| POST | `/test` | Yes | Sends a one-off test push |

### Cron — `/api/cron`
| Method | Route | Description |
|---|---|---|
| GET | `/daily-digest` | Server-side scheduled digest push; protected by `CRON_SECRET` |

### Health
| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Basic liveness check |
| * | `/api/*` (unmatched) | Clean `404 { message: "Not found" }` instead of Express's default page |

---

## Gamification rules

- **XP (study):** 10 base + 1 per 5 minutes of session duration, awarded on completion (real minutes studied, not planned).
- **XP (testing):** 5 base + up to 10 accuracy bonus per completed quiz — deliberately smaller than study XP so testing complements studying rather than replacing it.
- **Level:** `floor(xp / 100) + 1`.
- **Streak:** +1 for completing at least one *study* session on consecutive calendar days; resets to 1 if a day is missed.
- **Badges (15):** first session · 3/7/30-day streaks · 10/50/100 sessions completed · marathon session (2+ hrs) · early bird · night owl · 10/50 total study hours · **First Test Completed** · **Quiz Regular** (10 tests) · **Sharp Shooter** (90%+ accuracy).

---

## Installation

```bash
npm install
```

Installs `express`, `mongoose`, `bcryptjs`, `jsonwebtoken`, `cors`, `dotenv`, plus the optional-at-runtime `openai` and `web-push`, and the security middleware `helmet` + `express-rate-limit`.

## Environment variables

Copy the template and fill in what you need:

```bash
cp .env.example .env
```

| Variable | Required? | Purpose |
|---|---|---|
| `PORT` | Local dev only | Port for `npm run dev` (ignored on Vercel) |
| `MONGO_URI` | **Yes, always** | MongoDB connection string (local or Atlas) |
| `JWT_SECRET` | **Yes, always** | Long random string used to sign auth tokens |
| `NODE_ENV` | No | `development` locally; Vercel sets `production` automatically |
| `OPENAI_API_KEY` | No — enables real LLM features | From https://platform.openai.com/api-keys. Leave blank to keep everything AI-labeled on its rule-based/offline fallback. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` if unset |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | No — enables background push | Generate with `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | No | A `mailto:` address or URL identifying you to push services |
| `CRON_SECRET` | No but recommended once push is configured | Protects `GET /api/cron/daily-digest` |

Never commit `.env` — it's already listed in `.gitignore`. Only commit `.env.example`, and only with placeholder values.

## MongoDB setup

**Local:** install MongoDB Community Server and run it, then leave `MONGO_URI` at its default `mongodb://localhost:27017/smart_study_planner`.

**Atlas (needed for Vercel):**
1. Create a free M0 cluster at https://www.mongodb.com/cloud/atlas/register.
2. Create a database user under *Database Access*.
3. Under *Network Access*, allow `0.0.0.0/0` (fine for a small project; restrict later if you want).
4. Copy the connection string from *Connect → Drivers*.

## OpenAI setup

1. Create a key at https://platform.openai.com/api-keys.
2. Set `OPENAI_API_KEY` in `.env` (locally) or your Vercel project's environment variables (production).
3. Optionally set `OPENAI_MODEL` to a different chat-completions-compatible model.
4. `server/services/llmService.js` auto-detects the key and every AI route (coach, insight, Learn Anything, quiz generation, flashcard generation) upgrades itself — no other code changes needed. Never put a real key in `.env.example` or commit it.

## Push notification (VAPID) setup

1. Generate a key pair: `npx web-push generate-vapid-keys`
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in `.env` / Vercel env vars.
3. Optionally set `CRON_SECRET`.
4. In the app: **Reminders → Enable Background Push Notifications**, then **Send Test Push** to confirm.
5. The private key never reaches the frontend — only the public key is exposed, via `GET /api/notifications/vapid-public-key`.

## Local development

```bash
npm install
cp .env.example .env   # fill in at least MONGO_URI and JWT_SECRET
# start MongoDB locally, or point MONGO_URI at Atlas
npm run dev             # auto-restarts via nodemon
```

Open **http://localhost:5000**. AI and push features stay in their free/fallback modes until you add the optional env vars above.

## Vercel deployment

1. **Push to GitHub**, then **import into Vercel** at https://vercel.com/new (Framework preset: **Other**).
2. **Configure environment variables**: at minimum `MONGO_URI` and `JWT_SECRET`; optionally `OPENAI_API_KEY`, `OPENAI_MODEL`, `VAPID_*`, `CRON_SECRET`.
3. **Set up MongoDB Atlas** as described above.
4. **Deploy** — Vercel builds `api/index.js` as a serverless function and serves `public/` as static assets, per `vercel.json`.
5. **Test:** hit `/api/health`, sign up, complete onboarding, start a timer session, take a quiz, and (if configured) try the AI Coach and **Send Test Push**.
6. **Scheduled jobs:** `vercel.json` already registers `GET /api/cron/daily-digest` (`"0 8 * * *"`) — no extra setup, though it only sends once push is configured and someone's subscribed.

Or via CLI: `npm i -g vercel && vercel login && vercel --prod`

---

## Security

- `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY`, the MongoDB connection string, and `JWT_SECRET` are **never** sent to the frontend — read only from `process.env` server-side. The frontend only ever receives the **public** VAPID key.
- Passwords are hashed with `bcryptjs` (salt rounds: 10); auth tokens are signed JWTs (`jsonwebtoken`), 30-day expiry.
- **`helmet`** sets standard protective headers (clickjacking, MIME-sniffing, HSTS, etc.). Its `contentSecurityPolicy` is explicitly disabled — the frontend relies on inline `onclick=""` handlers throughout, which a default CSP would break — everything else stays on.
- **`express-rate-limit`** on `/api/auth/login` and `/api/auth/signup` specifically (20 req / 15 min / IP) — not the whole API, since the rest of the app depends on frequent legitimate polling (30s timer heartbeats, 60s notification checks) that a blanket limiter would disrupt.
- **NoSQL-injection guard** (`server/utils/sanitize.js`, `asQueryString()`): any `req.query`/`req.body` value headed into a Mongoose filter is coerced to a plain string or dropped, so a crafted query string (e.g. `?subject[$ne]=null`, which Express's parser turns into an object) can never be interpreted as a Mongo operator. Applied across mistakes, flashcards, and adaptive-difficulty lookups.
- Tests are graded **server-side only** against the stored answer key — `correctIndex`/`explanation` are stripped from `POST /tests/generate`'s response and never trusted from the client on submission.
- Clean, generic error responses everywhere (`{ message: "..." }`) — stack traces and internal errors are logged server-side, never sent to the client. Unmatched `/api/*` routes return a proper JSON 404 instead of Express's default HTML page.
- OpenAI and Web Push calls are wrapped in try/catch with graceful fallbacks (rule-based/offline engine, or a friendly "not configured" message) rather than propagating provider errors to the user.

---

## Known limitations

- **Heartbeat gaps are capped, not zeroed.** Up to ~90 seconds of a real gap is still credited before a session flips to `interrupted` — bounds the damage from a genuine gap without punishing a brief hiccup.
- **Multi-device detection is single-active-session, not live sync.** A conflicting tab only notices on its next heartbeat or reload, not instantly.
- **Background push is a once-daily digest on Vercel's Hobby plan** (cron minimum interval), not minute-accurate — that finer timing still runs client-side while a tab is open.
- **The Calendar view is weekday-based, not date-based** — the planner is weekly-recurring by design.
- **The offline quiz fallback bank has finite coverage** — very niche subjects/topics may get a smaller or more generic question set than a configured LLM would generate.
- **Adaptive difficulty and the AI Remaining Plan are both simple, explainable heuristics**, not machine-learned models — by design, so their suggestions are always traceable to a real number you can see (average accuracy, remaining seconds, task priority).
- **CORS is currently wide-open (`origin: '*'`)**, which is a normal pattern for a Bearer-token API (no cookies, so no CSRF exposure from it) but worth narrowing to your actual frontend domain if you fork this for a multi-tenant deployment.
- **Mobile "More" sheet groups 8 destinations behind one tap** — a deliberate trade-off to keep the primary bottom nav at exactly five items rather than cramming more into the always-visible row.

## Future improvements

- Per-user AI usage limits/quotas if this is ever opened beyond a personal/portfolio deployment.
- Push reminder the morning of a specific interview date.
- More built-in role curricula (DevOps, QA/SDET, Mobile Developer).
- Expand CSV export to include test/flashcard data alongside study sessions.
- Real-time multi-device sync for the timer conflict flow (currently reload/heartbeat-driven).
