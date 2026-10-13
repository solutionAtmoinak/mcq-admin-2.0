-- Adds the "case_study" question kind (a question answered against a shared
-- paragraph — see add-questiongroup-case-study-columns.sql and
-- app/lib/questions/caseStudy.ts). QuestionType is seeded, not admin-editable,
-- and the question editor's type dropdown is read from it (SP Mode 5), so this
-- row is what makes "Case Study" appear next to MCQ / MSQ / Integer / One Word.
--
-- Presentation/Answer schemas and flags are copied from the mcq_single row: a
-- case-study question is an option-based, single-correct, auto-gradable
-- question whose stem is shown under its group's paragraph.
--
-- Idempotent: safe to run more than once. Run AFTER add-questiongroup-case-study-columns.sql.

IF NOT EXISTS (SELECT 1 FROM dbo.QuestionType WHERE Code = 'case_study')
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.QuestionType WHERE Code = 'mcq_single')
        THROW 50001, 'QuestionType mcq_single not found - cannot copy its schemas for case_study.', 1;

    INSERT INTO dbo.QuestionType (Code, Name, PresentationSchema, AnswerSchema, ShuffleDefault, IsAutoGradable, FranchiseId, IsActive, IsDeleted, CreatedBy)
    SELECT 'case_study', N'Case Study', PresentationSchema, AnswerSchema, ShuffleDefault, IsAutoGradable, FranchiseId, 1, 0, N'seed-question-type-case-study'
    FROM dbo.QuestionType
    WHERE Code = 'mcq_single';
END
GO
