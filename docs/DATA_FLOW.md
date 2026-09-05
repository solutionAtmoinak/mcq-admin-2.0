# Admin data flow & table reference

Status: the admin app (question bank + exam designer) is feature-complete.
This document is the map to hand to whoever builds the **student exam
portal** next, so they don't have to re-derive it by reading every file.

Source of truth for anything below: `prisma/schema.prisma` (32 models) and
the four modules under `app/lib/questions/` and `app/lib/exams/`. If this
doc and the code disagree, the code wins — update this file.

## 1. Request lifecycle

```
Browser
  -> Next.js Server Component / Server Action  (app/**/page.tsx, app/lib/**/actions.ts)
       -> requireAuth() / requireUser()          (app/lib/auth/auth.ts)
       -> Prisma Client                          (app/lib/db/prisma.ts)
            -> MSSQL, via @prisma/adapter-mssql
```

- **Auth**: an httpOnly `dth_token` cookie holds a JWT issued by the external
  LMS. `requireAuth()` re-validates it against the LMS
  (`API_ENDPOINT_URL/auth/authentication`) at most once every 60s
  (in-memory cache), then `requireUser()` decodes it (no signature check —
  only `exp` and the `nameid`/`FranchiseId` claims are read) to get the
  acting user's id and franchise. Every mutation calls `requireUser()`;
  read-only pages call `requireAuth()`.
- **No local session/user table.** Identity and franchise membership live
  entirely in the LMS-issued JWT — there is no `User` or `Student` model in
  this schema. The student portal will need the same JWT cookie flow (see
  `app/login/[jwt]/route.ts` for how a token lands in the cookie).
- **Media**: files never touch this app's disk or DB. `app/api/media/route.ts`
  and `.../[id]/route.ts` proxy upload/delete straight to the LMS
  (`API_ENDPOINT_URL/uploads`), attaching the signed-in user's bearer token.
  The response `{id, url}` is what gets embedded in `QuestionVersion.
  PresentationJson` (see §3). The `MediaAsset` table exists in the schema
  but **nothing writes to it** — it's unused today.

## 2. Franchise scoping

Almost every table carries a nullable `FranchiseId`. Every read filters on
`currentUser.franchiseId` (from the JWT) and every write stamps it — a
franchise only ever sees its own rows.

One exception: `BlueprintTemplate`. Franchise `1` is the master/HQ franchise
(`MASTER_FRANCHISE_ID` in `app/lib/shared/constants.ts`). Master's templates
are visible **read-only** to every other franchise (as a starting point for
their own exam), but only master can edit or delete them, and master never
sees anyone else's templates. See `listBlueprintTemplates` /
`getBlueprintTemplateForEdit` in `app/lib/exams/data.ts`.

## 3. Status & lookup values — never hardcoded

`QuestionStatus`, `QuestionDifficulty`, and `ExamStatus` (Draft/Published/
Archived) are **not** TypeScript enums — they're rows in one shared lookup
table, fetched at runtime:

- **Table**: `_InternalService` (Prisma model `InternalService`), keyed by
  `Category` (`"QUESTION_STATUS"`, `"QUESTION_DIFFICULTY"`, `"EXAM_STATUS"`).
  Each row: `ServiceLabel` (machine key, e.g. `"APPROVED"`), `ServiceValue`
  (the number code, stored as text), `ServiceDisplayLabel` (UI text).
- **Read path**: `app/lib/db/serviceConfig.ts`'s `getServiceOptions(category)`
  (60s in-memory cache) / `getServiceValue(category, key)` (throws if the row
  is missing — used for control-flow branches like "is this the Approved
  value?"). `app/lib/db/serviceOptions.ts` has the pure helpers
  (`toLabelRecord`, `toValueRecord`, `valueByLabel`) for shaping the fetched
  list.
- **Why this matters for the student portal**: don't invent new status
  enums for attempt/grading states without checking whether they should be
  `_InternalService` rows too, for consistency with how the rest of the app
  resolves "what does 4 mean" at runtime instead of at compile time.
- Badge **colors** (not business meaning) are the one thing still hardcoded,
  in `app/lib/questions/constants.ts` (`QUESTION_STATUS_BADGE`) and
  `app/lib/exams/constants.ts` (`MOCK_TEST_STATUS_BADGE`) — presentation
  only, keyed by whatever numeric value the DB currently reports.

## 4. Domain: Question Bank

Code: `app/lib/questions/{actions,data,schema,constants}.ts`, pages under
`app/questions/`, components under `app/components/questions/`.

| Table | Written by | Read by | Purpose |
|---|---|---|---|
| `Question` | `createQuestions`, `updateQuestion` (raw SQL — see §6), `changeQuestionStatus`, `deleteQuestion` (soft) | `listQuestions`, `getQuestionForEdit`, `getBankSummary`, exam question picker | One row per question. Holds type/difficulty/status/franchise and `CurrentVersionId` (points at the live content). Never holds content itself. |
| `QuestionVersion` | `createQuestions`, `updateQuestion` | `getQuestionForEdit`, `listQuestions` (for stem preview), exam picker | Immutable content snapshot: `PresentationJson` (stem, options, attached media) + `AnswerJson` (correct answer, marks, negative marks, explanation). Every save creates a **new** version and repoints `Question.CurrentVersionId` — old versions are kept, never overwritten. |
| `QuestionType` | (seeded, not admin-editable) | everywhere questions are listed/created | The 4 fixed types: `mcq_single`, `msq`, `integer`, `owa` — see `QUESTION_TYPE_LABELS` in `app/lib/questions/schema.ts`. |
| `QuestionLot` | `createQuestionLot` (one per "Create Questions" browser tab session) | `listQuestionLots`, `listQuestions` filter | Groups questions authored together in one sitting, for later bulk-finding/reuse. |
| `Tag` / `TagDimension` | `resolveTagIds` in `actions.ts` (auto-creates on first use) | `getReferenceData`, `listQuestions` filter, `getQuestionForEdit` | Free-form `{key: value}` tagging (e.g. `subject: Reasoning`). A dimension is the key, a tag is the value within it. Both are created on the fly — there's no admin UI to manage them directly. |
| `QuestionTag` | `createQuestions`, `updateQuestion` (delete + re-create on every edit) | filtering, tag display | Question <-> Tag join. |
| `QuestionSearch` | `createQuestions`, `updateQuestion` (upsert) | `listQuestions`'s `q` filter (`SearchText contains`) | Denormalized flattened text (stem + option text + tag values) per question, one row per locale (`en` only today). This is a poor-man's search index — no full-text index is used. |
| `QuestionStat` | `createQuestions` (inserts a zeroed row) | — (nothing reads it yet) | **Reserved for the student portal.** Counters (`AttemptCount`, `CorrectCount`, `PValue`, `DiscriminationIndex`, etc.) that only make sense once students actually attempt questions. Admin just seeds the row. |
| `ReviewAction` | `changeQuestionStatus` | — (no UI reads history back yet) | Audit trail of every status transition (`FromStatus` -> `ToStatus` + comment), tied to the version that was live at the time. |

Not touched by admin at all (present in the schema, unused): `QuestionGroup`,
`QuestionGroupVersion` (shared-passage/comprehension grouping),
`QuestionVersionTranslation` (multi-locale content), `QuestionRelation`
(similar-question links), `QuestionReport` (student-flagged issues),
`MediaAsset` (see §1).

### Question create/edit flow specifics

- `Question` and `QuestionVersion` both have a SQL Server `rowversion`
  (`RowVer`) column that Prisma's structured query builder (this
  generator/adapter combo) can't build INSERT/UPDATE plans for — every write
  to them goes through `tx.$queryRaw` / `tx.$executeRaw` with
  `OUTPUT INSERTED.<Id>` instead of `prisma.question.create(...)`. Same
  pattern in the exams domain for `MarkingScheme`/`ExamPaper`/`PaperSection`/
  `MockTest`. Reads work fine through the normal Prisma API.
- Editing a question **always** creates a new `QuestionVersion` (never
  mutates one in place) and repoints `CurrentVersionId`. `changeQuestionStatus`
  is the one exception: it flips `Question.Status` directly and does not
  touch content or version, so review/approval stays a distinct, logged
  action from content edits.

## 5. Domain: Exam Designer (Mock Test / Blueprint Template)

Code: `app/lib/exams/{actions,data,schema,constants}.ts`, pages under
`app/exam-designer/` and `app/exam-templates/`, components under
`app/components/exams/`.

Two related but distinct concepts:

- **`BlueprintTemplate`** — a fully self-contained, reusable exam *shape*
  (name, sections, marking scheme, test kind) saved as one JSON blob
  (`FilterJson`). No `ExamPaper`/`PaperSection`/`MarkingScheme` rows exist
  for a template — see `app/lib/exams/schema.ts`'s `BlueprintFilterJson`.
  Purely a design-time convenience for starting a new exam quickly.
- **`MockTest`** — an actual, materialized exam. Creating one (
  `createMockTestFromDraft` -> `materializeMockTest`) always mints **its
  own, never-shared** `MarkingScheme` + `ExamPaper` + `PaperSection` rows,
  even if it came from a template — so editing one exam's sections can never
  affect another exam that started from the same template.

| Table | Written by | Read by | Purpose |
|---|---|---|---|
| `BlueprintTemplate` | `createBlueprintTemplate`, `updateBlueprintTemplate`, or inline via `createMockTestFromDraft`'s "save as template" option | `listBlueprintTemplates`, `getBlueprintTemplateForEdit`, exam-designer "start from template" | Reusable exam shape, see above. |
| `ExamBody` / `ExamProgram` / `ExamStage` | `resolveFallbackStageId` (find-or-create) | `materializeMockTest` (needs a `StageId` for `ExamPaper`) | There's no admin UI for this catalog yet — every exam is find-or-created under one fixed fallback chain (`FALLBACK_CATALOG` in `app/lib/exams/constants.ts`: body "Templates" / program+stage "GENERAL"). Real categorization lives on the template/exam's own `Name` instead. |
| `MarkingScheme` | `materializeMockTest` (create), `updateMockTestFromDraft` (raw SQL update in place) | `getMockTestDraftForEdit` | One dedicated row per `MockTest`, holding `RulesJson`. |
| `ExamPaper` | same as above | `listMockTests`, `getMockTestForEdit`, `getMockTestDraftForEdit` | One dedicated row per `MockTest` — name, total marks, duration. |
| `PaperSection` | `materializeMockTest` (create), `updateMockTestFromDraft` (update/soft-delete in place, with a two-pass negative-placeholder trick to dodge the unique `(PaperId, SeqNo)` constraint while reordering) | `getMockTestForEdit`, question picker | One row per section (e.g. "Quant", "Verbal"), `RulesJson` holds `{questionType, questions (pool size), mandatory, marks, negative}`. |
| `TestKind` | `resolveTestKindId` (find-or-create; caller-supplied non-autoincrement id) | exam designer's "test kind" picker | e.g. "Mock Test" — the "is this a real mock or some other kind" classifier. `FALLBACK_TEST_KIND` in constants is the default. |
| `MockTest` | `materializeMockTest` (raw SQL insert), `updateMockTestFromDraft`/`changeMockTestStatus`/`deleteMockTest` (raw SQL update) | `listMockTests`, `getMockTestForEdit`, `getMockTestDraftForEdit` | The exam row itself. `SelectionPolicyJson` caches a `MockTestRecipe` snapshot (section id/name/type/pool/mandatory) so re-reading the shape doesn't require re-parsing every `PaperSection.RulesJson`. `Status` (Draft/Published/Archived) is an `_InternalService` "EXAM_STATUS" value — see §3. Only Draft exams can have their shape or picks edited; publishing freezes both. |
| `TestQuestion` | `addQuestionsToSection`, `removeQuestionsFromSection` (soft-delete), `reorderSectionQuestions` | `getMockTestForEdit`, `getMockTestDraftForEdit` (picked-count) | The **actual, finalized, ordered** picks for a section — this is what the admin's question-picker UI writes. One row per (MockTest, Section, SeqNo). Every question picked this way gets a fixed `EffectiveMarks`/`EffectiveNegative` snapshot from the section's rules at pick time. |

**Not touched by admin at all: `TestPool`.** Same shape as `TestQuestion`
(MockTest/Section/Question/Version + `IsMandatory`) but nothing in
`app/lib/exams/` reads or writes it. Given the schema pairs `TestPool`
(candidate pool) with `TestQuestion` (finalized picks), this is almost
certainly meant for a **random-selection-at-attempt-time** flow — e.g. an
exam configured with a large pool per section, from which each student's
attempt draws a random subset — which the admin only ever does manually via
`TestQuestion` today. Worth confirming with the student-portal design before
assuming `TestQuestion` is the only table attempts should read from.

`QuestionMarks` (per-question marks override, keyed by `ExamPaper`) is also
defined but unused — `TestQuestion.EffectiveMarks`/`EffectiveNegative` is
where marks actually live today.

## 6. Tables reserved for the student portal (untouched by admin)

These exist in `prisma/schema.prisma` (so migrations/generation already
cover them) but **no code anywhere in this app reads or writes them yet**.
This is the starting point for exam-taking:

| Table | Likely role |
|---|---|
| `Attempt` | One row per student's sitting of a `MockTest` — status, timing, seed for randomization (`RandomSeed`/`AlgoVersion`), score. |
| `AttemptSection` | Per-section timing/status within an attempt (matches `PaperSection`). |
| `AttemptAnswer` | Per-question response within an attempt (`ResponseJson`, time spent, marks awarded) — PK is `(AttemptId, QuestionId)`. |
| `AttemptEvent` | Fine-grained event log during an attempt (tab-switch, pause, etc. — `EventType` is an int enum, `PayloadJson` free-form). |
| `StudentBookmark` | Student-saved questions for later review. |
| `StudentQuestionSeen` | Per-student exposure history per question (times seen/correct) — likely feeds adaptive selection and `TestPool`-style random draws so the same student doesn't see a question twice. |
| `StudentTopicMastery` | Per-student, per-`Tag` mastery score — likely for analytics/adaptive recommendations. |
| `QuestionStat` | Aggregate quality/usage stats per question (see §4) — will need to be updated as attempts are graded, not just seeded. |
| `AuditEvent` | Generic actor/entity/action audit log — schema exists, nothing writes to it (admin uses the narrower `ReviewAction` instead for question status changes). |

Student identity itself (`StudentId` columns above) is just a string — same
externally-issued-JWT model as the admin side (§1), not a local `User` table.

## 7. Post-reorg file map

```
app/lib/
  auth/     auth.ts (session/JWT + LMS validation), media.ts + mediaApi.ts (upload types/client — LMS-proxied, no local storage)
  db/       prisma.ts (client), serviceConfig.ts + serviceOptions.ts (_InternalService-backed dynamic lookups)
  questions/  actions.ts, data.ts, schema.ts, constants.ts  — see §4
  exams/      actions.ts, data.ts, schema.ts, constants.ts  — see §5
  shared/   constants.ts (PAGE_SIZE_OPTIONS, MASTER_FRANCHISE_ID), toast.ts

app/components/
  common/     AdminShell, NavBar, AppSelectPicker, FilterSelectPicker, BackLink, Drawer, ui.ts (shared Tailwind class constants)
  media/      MediaAttachmentField, MediaUploader
  questions/  DeleteQuestionButton, OptionMediaModal, QuestionOptionalSettingsModal, QuestionStatusBadge, StatusChanger, TagFilterPicker, TagPairEditor
  exams/      (already domain-grouped pre-reorg)
  table/      DataTable, PageSizeSelect, TablePagination (generic, shared by both domains)
```
