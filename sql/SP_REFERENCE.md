# mcq-admin — Stored Procedure Reference

Every DB call goes through the .NET executor (`app/lib/db/executor.ts`) as
`(spName, @Mode, @json)`. Use this file to find which page hits which SP mode.
**Keep it updated** whenever a mode is added/changed/removed or a page starts/stops using one.

- `spMcqTeacherService` — source: [spMcqTeacherService-deploy.sql](spMcqTeacherService-deploy.sql), TS wrapper `callTeacherService` ([teacherService.ts](../app/lib/db/teacherService.ts))
- `spMcqMigrationService` — source: [spMcqMigrationService-deploy.sql](spMcqMigrationService-deploy.sql), TS wrapper `callMigrationService` ([migrationService.ts](../app/lib/db/migrationService.ts))

Payload = keys the TS caller puts in `@json` (FranchiseId/UserId/IP are supplied by the executor, not listed).
"Page URL" = the route whose page (or a component on it) triggers the call.

## spMcqTeacherService

| Page URL | Task | SP | Mode | TS function | Payload JSON |
|---|---|---|---|---|---|
| — (not called by the app) | Return teacher exam-panel URL | spMcqTeacherService | 1 | — | `{}` |
| — (not called by the app; packages come from LMS API `listPackageOptions`) | List MCQ packages of franchise | spMcqTeacherService | 2 | — | `{}` |
| `/exam-designer` | Paginated exam (MockTest) list | spMcqTeacherService | 3 | `listMockTests` | `{"Page","PageSize", …filters}` |
| `/`, `/exam-designer`, `/exam-designer/new`, `/exam-designer/[id]`, `/exam-designer/question-pick/[id]` | `_InternalService` options for a category (status/difficulty labels) | spMcqTeacherService | 4 | `getServiceOptions` / `getServiceValue` | `{"Category":"QUESTION_STATUS"\|"QUESTION_DIFFICULTY"\|"EXAM_STATUS"…}` |
| `/questions`, `/questions/new`, `/questions/[id]`, `/tags`, `/tags/[id]`, `/exam-designer/question-pick/[id]` | Question-editor reference data (types, dimensions, tags) | spMcqTeacherService | 5 | `getReferenceData` | `{}` |
| `/` (home) | Question bank summary tiles | spMcqTeacherService | 6 | `getBankSummary` | `{}` |
| `/questions` | Paginated, filtered question list | spMcqTeacherService | 7 | `listQuestions` | `{…filters,"Page","PageSize"}` |
| `/exam-designer/question-pick/[id]` (picker "select all") | Id list of all questions matching filters | spMcqTeacherService | 8 | `listQuestionIdsForFilter` (via `selectAllPickerQuestionIds`) | `{…filters,"Limit"}` |
| `/questions`, `/exam-designer/question-pick/[id]` | Question-lot filter dropdown (latest 200) | spMcqTeacherService | 9 | `listQuestionLots` | `{}` |
| `/questions/new` | "Saved earlier today" explorer | spMcqTeacherService | 10 | `getTodayQuestions` | `{"Limit"}` |
| `/questions/[id]` | Load one question for edit | spMcqTeacherService | 11 | `getQuestionForEdit` | `{"QuestionId"}` |
| `/questions/new`, `/questions/lots`, `/api/migration/json` | Create a new question lot (LOT-yyyyMMdd-XXXX) | spMcqTeacherService | 12 | `createQuestionLot` | `{}` |
| `/questions/new` | Bulk-create questions (+ tag find-or-create) | spMcqTeacherService | 13 | `createQuestions` | `{"LotId","Questions":[…]}` |
| `/questions/new`, `/questions/[id]` | Edit question → new QuestionVersion Also moves `MockTestTag` counts when the tag set changes and the question sits in a teacher exam. | spMcqTeacherService | 14 | `updateQuestion` | `{"QuestionId","TypeCode","Difficulty","EstSolveSec","PresentationJson","AnswerJson","SearchText","ChangeNote","Tags","SetGroup","GroupId"}` |
| `/questions`, `/questions/[id]`, `/exam-designer/question-pick/[id]` (StatusChanger / QuestionStatusBadge) | Change question status + log ReviewAction | spMcqTeacherService | 15 | `changeQuestionStatus` | `{"QuestionId","ToStatus","Comment"}` |
| `/questions`, `/exam-designer/question-pick/[id]` (DeleteQuestionButton) | Soft-delete question | spMcqTeacherService | 16 | `deleteQuestion` | `{"QuestionId"}` |
| `/exam-templates`, `/exam-designer/new`, `/exam-designer/[id]` | Blueprint template list (own + master) | spMcqTeacherService | 17 | `listBlueprintTemplates` | `{}` |
| `/exam-templates/[id]` | One template for edit | spMcqTeacherService | 18 | `getBlueprintTemplateForEdit` | `{"TemplateId"}` |
| `/exam-designer/new`, `/exam-designer/[id]`, `/exam-templates/new`, `/exam-templates/[id]` | Test-kind picker options | spMcqTeacherService | 19 | `listTestKinds` | `{}` |
| `/exam-designer/question-pick/[id]` | Exam read-only detail (sections + questions) | spMcqTeacherService | 20 | `getMockTestForEdit` | `{"MockTestId"}` |
| `/exam-designer/[id]` | Exam draft shape for edit | spMcqTeacherService | 21 | `getMockTestDraftForEdit` | `{"MockTestId"}` |
| `/exam-designer/new` | Create exam draft (+ optional save-as-template) | spMcqTeacherService | 22 | `createMockTestFromDraft` | `{"ExamFilterJson","PaperCode","TemplateName","TemplateFilterJson","InitialStatus","Instructions",…}` |
| `/exam-designer/[id]` (ExamDesigner, edit mode) | Edit exam shape in place Also takes tags off `MockTestTag` when `OverCapacityResolution=trim` soft-deletes questions. | spMcqTeacherService | 23 | `updateMockTestFromDraft` | `{"MockTestId","ExamName","TestKindCode","TestKindName","MarkingSchemeName",…}` |
| `/exam-designer`, `/exam-designer/[id]`, `/exam-designer/question-pick/[id]` | Change exam status (Draft/Published/Archived) | spMcqTeacherService | 24 | `changeMockTestStatus` | `{"MockTestId","ToStatus"}` |
| `/exam-designer` (DeleteMockTestButton) | Soft-delete exam | spMcqTeacherService | 25 | `deleteMockTest` | `{"MockTestId"}` |
| `/exam-designer` (LinkPackagesButton) | Replace exam ↔ package links | spMcqTeacherService | 26 | `updateMockTestPackages` | `{"MockTestId","PackageIds":"<csv>"}` |
| `/exam-templates/new` | Create blueprint template | spMcqTeacherService | 27 | `createBlueprintTemplate` | `{"Name","FilterJson"}` |
| `/exam-templates/[id]` | Update blueprint template | spMcqTeacherService | 28 | `updateBlueprintTemplate` | `{"TemplateId","Name","FilterJson"}` |
| `/exam-templates` (DeleteTemplateButton) | Soft-delete template | spMcqTeacherService | 29 | `deleteBlueprintTemplate` | `{"TemplateId"}` |
| `/exam-designer/question-pick/[id]` (QuestionPickerDrawer) | Append picked questions to a section Also +1 per tag in `MockTestTag`. | spMcqTeacherService | 30 | `addQuestionsToSection` | `{"MockTestId","SectionId","QuestionIds":"<csv>"}` |
| `/exam-designer/question-pick/[id]` (SectionQuestionList) | Remove questions from a section Also −1 per tag in `MockTestTag` (hard-delete at 0). | spMcqTeacherService | 31 | `removeQuestionsFromSection` | `{"MockTestId","SectionId","QuestionIds":"<csv>"}` |
| `/exam-designer/question-pick/[id]` (SectionQuestionList) | Reorder section questions | spMcqTeacherService | 32 | `reorderSectionQuestions` | `{"MockTestId","SectionId","OrderedQuestionIds":[…]}` |
| `/` (home) | Dashboard analytics | spMcqTeacherService | 34 | `getDashboardAnalytics` | `{}` |
| `/questions/new`, `/questions/[id]` (CaseStudyParts "choose existing") | Case-study list/search | spMcqTeacherService | 35 | `listCaseStudies` (via `searchCaseStudies`) | `{"Q","Page","PageSize"}` |
| `/questions/new`, `/questions/[id]` (CaseStudyParts) | Load one case study + its questions | spMcqTeacherService | 36 | `getCaseStudy` (via `loadCaseStudy`) | `{"GroupId"}` |
| `/questions/new`, `/questions/[id]` | Create case study | spMcqTeacherService | 37 | `saveCaseStudy` | `{"Title","ContextJson","SearchText"}` |
| `/questions/new`, `/questions/[id]` | Edit case study → new QuestionGroupVersion | spMcqTeacherService | 38 | `saveCaseStudy` | `{"GroupId","Title","ContextJson","SearchText","ChangeNote"}` |
| `/questions/lots` | Paginated question-lot list | spMcqTeacherService | 39 | `listQuestionLotsPaged` | `{"Q","Page","PageSize"}` |
| `/tags` | Tag dimension list with counts | spMcqTeacherService | 40 | `listTagDimensions` | `{"Q"}` |
| `/tags/[id]` | One dimension with its tags | spMcqTeacherService | 41 | `getTagDimension` | `{"DimensionId"}` |
| `/tags`, `/tags/[id]` (TagForms) | Rename dimension | spMcqTeacherService | 42 | `renameTagDimension` | `{"DimensionId","Name"}` |
| `/tags`, `/tags/[id]` (TagForms) | Rename tag | spMcqTeacherService | 43 | `renameTag` | `{"TagId","Name"}` |
| `/tags`, `/tags/[id]` (TagForms) | Create tags from key→value pairs | spMcqTeacherService | 44 | `createTagPairs` | `{"Pairs":[{"Key","Value"}]}` |
| `/attempts` | Paginated student attempts list | spMcqTeacherService | 45 | `listExamAttempts` | `{"MockTestId","Status","Page","PageSize",…}` |
| `/attempts` | Exam picker for attempts filter | spMcqTeacherService | 46 | `listExamOptions` | `{}` |
| `/attempts` (DeleteAttemptButton) | Delete an attempt + its answers/sections/events | spMcqTeacherService | 47 | `deleteExamAttempt` | `{"AttemptId"}` |

Mode 33 does not exist.

## spMcqMigrationService

| Page URL | Task | SP | Mode | Caller | Payload JSON |
|---|---|---|---|---|---|
| `/migration/json` (ExtractPanel → `GET /api/migration/extract`) | Extract legacy questions as JSON for a page of ids | spMcqMigrationService | 1 | `api/migration/extract/route.ts` | `{"SectionId","QuestionIds"}` |
| `/migration/json` (MigratePanel → `POST /api/migration/json`) | Bulk-import questions into a lot (tag find-or-create) | spMcqMigrationService | 2 | `api/migration/json/route.ts` | `{"LotId","Questions":[…]}` |
| `/migration/json` (ExtractPanel → `GET /api/migration/extract-ids`) | Full id list of a legacy section (cheap) | spMcqMigrationService | 3 | `api/migration/extract-ids/route.ts` | `{"SectionId"}` |

_Last updated: 2026-10-13_
