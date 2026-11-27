# Aptitude Preparation

Placement-style aptitude practice inside CodeSphere: a question bank with step-by-step solutions, timed mock tests, a daily challenge, progress analytics, a mistake notebook, badges and leaderboards, plus an admin panel for managing questions and tests.

This page is for whoever maintains the section. It covers setup, how the pieces fit together, the rules the server enforces, and what's not done yet.

## Setup

From `server/`:

1. **Load the question bank and sample tests.** Safe to run again: questions are matched by code and updated in place, and questions an editor changed in the admin panel are left alone.
   ```
   node scripts/seedAptitude.js
   ```
2. **Restart the backend.** No new environment variables are needed.
3. **Give editors access (optional).** In the admin panel, open *Users* and give a student the **Aptitude editor** staff role. Admins always have access.

Before adding or changing questions in `server/data/aptitudeQuestions/`, run the checker. It catches bad codes, duplicates, unknown topics, out-of-range answers and missing explanations, and recomputes numeric answers that have a `verify` expression:

```
npm run check:aptitude
```

## Running the tests

```
npm run test:aptitude
```

Each file starts a throwaway in-memory MongoDB (`mongodb-memory-server`, a dev dependency), so your real database is never touched. The first run downloads a MongoDB binary (about 70 MB). If that download is blocked (offline or behind a firewall), point the tests at any local `mongod` with the `MONGOMS_SYSTEM_BINARY` environment variable, for example `MONGOMS_SYSTEM_BINARY=C:/path/to/mongod.exe npm run test:aptitude`.

| File | What it covers |
|---|---|
| `1-foundation` | Catalog, topic pages, dashboard summary |
| `2-practice` | Practice filters, hints, reveal, bookmarks, XP rules, daily goals |
| `3-mock-tests` | Start/resume, autosave, deadline, auto-submit, scoring, attempt limits |
| `4-progress` | Analytics and the mistake notebook |
| `5-daily-leaderboard` | Daily challenge, badges, both leaderboards |
| `6-admin` | Editor permissions, validation, import, test management, stats |
| `7-end-to-end` | One student's full journey, plus sweeps for sign-in, permissions, answer leaks and crashes on every route |

## Pages

| Path | Who | What |
|---|---|---|
| `/aptitude` | Everyone | Dashboard: level, stats, quick links, categories, placement tracks |
| `/aptitude/topics/:slug` | Everyone | One topic: question counts by difficulty, practise buttons |
| `/aptitude/practice` | Signed in | Filtered practice with hints, solutions, bookmarks and XP |
| `/aptitude/tests` | Everyone (start needs sign-in) | Mock test list and previous attempts |
| `/aptitude/exam/:attemptId` | Owner | Exam screen: timer, palette, autosave |
| `/aptitude/results/:attemptId` | Owner | Score, topic breakdown, answer review |
| `/aptitude/progress` | Signed in | Analytics with SVG charts |
| `/aptitude/mistakes` | Signed in | Mistake notebook |
| `/aptitude/daily` | Everyone (play needs sign-in) | Daily challenge |
| `/aptitude/leaderboard` | Everyone | Weekly and all-time aptitude rankings |
| `/admin/aptitude` | Admin or Aptitude editor | Questions, import, tests, usage |

Guests can browse the dashboard, topics, test list, daily challenge summary and leaderboard. Everything that records progress needs sign-in.

## How it fits together

### Server

| File | Role |
|---|---|
| `data/aptitudeTopics.js` | The 4 categories and 65 topics, placement tracks and difficulty levels. Topic slugs are the keys used everywhere. |
| `data/aptitudeQuestions/` | The built-in question bank (`batch1.js`, `batch2.js`, `batch3.json`, `batch4.js`). `batch3.json` is a curated 1,268-question selection from a 100,000-question template set: repeats, mislabelled questions and wrong answers were removed, every computable answer was recomputed, and each topic is capped at 40. `index.js` shuffles option order per question, so the correct answer isn't always A. |
| `data/aptitudeTests.js` | The 4 sample mock tests loaded by the seed script. |
| `models/Aptitude.js` | All aptitude collections (below). |
| `routes/aptitudeRoutes.js` | Catalog, topics, dashboard summary, practice, hints, reveal, bookmarks, answering, streaks and daily goals. |
| `routes/aptitudeTestRoutes.js` | Mock tests: list, start, autosave, submit, results. |
| `routes/aptitudeProgressRoutes.js` | Analytics and the mistake notebook. |
| `routes/aptitudeDailyRoutes.js` | Daily challenge and the aptitude leaderboard. |
| `routes/aptitudeAdminRoutes.js` | Admin API: questions, import, tests, stats. Guarded by `requireStaff('aptitude-editor')`. |
| `utils/aptitudeValidate.js` | Shared validation for the editor and bulk import, and automatic question codes. |
| `utils/activity.js` → `aptitudeSummary()` | Per-student aptitude XP, solved count, streak, tests and dailies, used by badges and both leaderboards. |
| `scripts/seedAptitude.js`, `scripts/checkAptitude.js` | Seed and check the bank. |

Mount order in `server.js` matters: `/api/aptitude/admin` and `/api/aptitude/tests` come before the general `/api/aptitude` routers.

### Database collections

All new; nothing existing was changed except as noted below.

| Collection | Holds |
|---|---|
| `aptitudequestions` | The question bank. `code` is unique (e.g. `QA-PCT-004`). `status` is draft, published or archived; students only ever see published. `source` records where it came from (`codesphere`, `codesphere-edited`, `admin`, `import`). |
| `aptitudeattempts` | One row per practice or daily answer. A partial unique index (`one_xp_award_per_question`) allows XP on a question only once per student. |
| `aptitudeprogresses` | One per student: bookmarks, mistakes, revealed solutions, streak, claimed daily goals and bonus XP. |
| `aptitudetests` | Mock test definitions: fixed question list or random sections, timing, marking, attempt limit, open/close window. |
| `aptitudetestattempts` | One per sitting: frozen questions and option order, server deadline, saved answers, score. |
| `aptitudedailies` | The daily set, one per India-time day. |
| `aptitudedailyattempts` | One per student per day (unique index). |

Changes to existing data:

- `User.staffRoles` accepts a new value, `aptitude-editor`.
- New badges in a new **Aptitude** group in `data/badges.js` (see below).
- The main leaderboard and badge XP now include aptitude XP.

### Client

Pages are in `client/src/pages/Aptitude*.jsx` and `AdminAptitude.jsx`. Shared bits are in `lib/aptitude.js`, and all styles are in `css/Aptitude.css` (classes prefixed `apt-`). Charts are hand-drawn SVG; no chart library was added. Bulk import reads Excel files in the browser with the existing `lib/spreadsheet.js`.

## Rules the server enforces

- **No answer leaks.** Answers, explanations and shortcuts are only sent after a student answers (practice), submits (tests and daily), or chooses to reveal the solution. The end-to-end test checks every pre-answer response for these fields.
- **Server time only.** Test and daily deadlines are set from the server clock when the attempt starts. Saves after the deadline are refused (5 s grace for tests, 10 s for the daily). An overdue test is auto-submitted the next time any of that student's test routes is hit.
- **Scored once.** Submitting is an atomic status change, so double clicks or two tabs can't score twice or pay XP twice.
- **Frozen sittings.** Editing a test doesn't affect attempts already started.
- **History is kept.** Deleting a question or test that students have used archives it instead.

## XP, levels and badges

| Source | XP |
|---|---|
| Practice, first correct answer | very easy 2, easy 4, medium 6, hard 10 (none if the solution was revealed first) |
| Daily goals | +10 for 5 answers, +20 for 10 answers (once a day each) |
| Streak | +25 every 7 days in a row |
| Mock test | +2 per correct answer, first attempt of each test only |
| Daily challenge | +4 per correct answer, +10 for all correct (none if submitted late) |

Aptitude levels go by questions solved: Beginner (0), Learner (25), Practitioner (100), Problem Solver (250), Aptitude Pro (500).

Badges: Number Cruncher (25 solved), Aptitude Ace (100), Aptitude Pro (250), Mock Warrior (5 tests), Daily Solver (7 dailies), Perfect Day (a perfect daily), Aptitude Streak (14 days).

Aptitude XP counts toward the main CodeSphere leaderboard and site level as well as the aptitude leaderboard. The weekly aptitude board counts XP earned in the last 7 days, not including goal and streak bonuses.

## Adding questions

Three ways:

1. **Admin panel, one at a time.** *New question* opens the editor with a student preview. Leave the code blank to get the next free one.
2. **Admin panel, bulk import.** Upload `.xlsx`, `.csv` or `.json`. Every row is checked and previewed before anything is saved. Download the CSV template from the import tab for the column names.
3. **In code.** Add to `server/data/aptitudeQuestions/` using the `q()` helper (correct answer at index 0; the loader shuffles), run `npm run check:aptitude`, then the seed script.

New questions from the panel or import start as **draft**, so nothing reaches students until someone publishes it.

## Known limitations

- **Question bank size and variety.** 1,551 questions (783 quantitative, 360 logical, 142 verbal, 266 data interpretation). Many batch 3 questions are number-swapped versions of the same template, and their difficulty labels are rough. Verbal is still the thinnest section; batch 4 (written for the club) filled the topics batch 3 couldn't, such as partnership, mixtures, number series, syllogisms, statements, data sufficiency, reading comprehension and grammar.
- **Data interpretation** questions are text tables only. There are no chart images in questions yet.
- **Tests are multiple choice only.** No numeric-entry questions.
- **Badges earned in a mock test** are saved, but the test result page doesn't announce them.
- **Leaderboards and analytics** are computed on each request. That's fine for a club-sized user base. With thousands of active students they should be cached.
- **The daily set** is picked by whoever opens the daily page first each day, at random within the category mix. There's no editor control over it yet.
- **Exam integrity.** There's no proctoring (tab-switch detection, camera). Tests are for practice.
