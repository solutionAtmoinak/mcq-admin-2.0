/* ============================================================================
   HARD DELETE a QuestionLot and EVERYTHING under it — permanent, not a
   soft-delete (IsDeleted=1). There is no undo short of restoring the DB from
   a backup. Take a backup (or at least confirm one exists) before running.

   Currently parameterized for:
       LotId = 32
       LotNo = LOT-20260923-1770FA63
   To reuse for a different lot, change @LotId/@LotNo below — everything
   else is driven off those two.

   SCOPE — confirmed with the requester before writing this:
   If a question from this lot sits inside an exam (MockTest) that ALSO has
   questions from other lots, or inside a student Attempt that ALSO answered
   other questions, this deletes that ENTIRE exam and ENTIRE attempt — not
   just the rows naming this lot's questions. That means collateral deletion
   of other lots' questions-within-that-exam and other (non-lot) answers
   within that attempt. This was an explicit choice, not an oversight — see
   the "Nuke the whole exam + whole attempt" scope below if you need to
   narrow it later.

   SCHEMA NOTE: dbo.QuestionLot and dbo.Question.LotId are NOT present in
   this repo's DB_SCHEMA.sql (that file predates the lot feature — see
   CLAUDE.md's note that it's otherwise "the only schema reference"). Their
   shape here (QuestionLot: LotId PK, LotNo, CreatedBy, FranchiseId,
   CreatedOn, IsDeleted; Question.LotId nullable FK) is reverse-engineered
   from mcq-admin/sql/spMcqTeacherService.sql's Modes 7-9/12. Sanity-check
   against the live DB (e.g. INFORMATION_SCHEMA.COLUMNS) if anything below
   errors on a column/table name.

   Deletes, in FK-safe child-to-parent order:
     Attempt-side : AttemptEvent, AttemptAnswer, AttemptSection, Attempt
     Exam-side    : TestQuestion, TestPool, MockTestPackage, QuestionMarks,
                    MockTest, PaperSection, ExamPaper
                    (ExamPaper/PaperSection are minted fresh per MockTest by
                    this app — confirmed 1:1, never shared across exams — so
                    deleting them alongside their MockTest is safe)
     Question-side: StudentBookmark, StudentQuestionSeen, QuestionReport,
                    QuestionStat, ReviewAction, QuestionSearch, QuestionTag,
                    QuestionRelation, QuestionVersionTranslation,
                    QuestionVersion, Question
     Lot itself   : QuestionLot

   Deliberately NOT touched (shared/reusable, not owned 1:1 by this lot):
     - QuestionGroup / QuestionGroupVersion (a comprehension-passage group
       can be shared by questions outside this lot; left alone even if it
       ends up with no members left)
     - MarkingScheme, TagDimension/Tag, BlueprintTemplate, MediaAsset
     - AuditEvent (polymorphic EntityId/EntityType, no real FK to Question;
       also unused by the live app today — only ever populated by this
       schema file's own demo seed)
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @LotId BIGINT = 32;
DECLARE @LotNo VARCHAR(50) = 'LOT-20260923-1770FA63';

-- Safety gate: stays 0 (preview-only, no writes) until you've read the
-- preview counts below and deliberately flip it to 1 and re-run.
DECLARE @Confirm BIT = 0;

-- Sanity-check the id/number pair actually match before touching anything.
IF NOT EXISTS (SELECT 1 FROM dbo.QuestionLot WHERE LotId = @LotId AND LotNo = @LotNo)
BEGIN
    RAISERROR('LotId/LotNo mismatch (or lot not found) — aborting before touching anything.', 16, 1);
    RETURN;
END

-- ---- Resolve the full blast radius -----------------------------------------
IF OBJECT_ID('tempdb..#QuestionIds') IS NOT NULL DROP TABLE #QuestionIds;
SELECT QuestionId INTO #QuestionIds
FROM dbo.Question
WHERE LotId = @LotId;                       -- all of this lot's questions,
                                              -- regardless of current IsDeleted

IF OBJECT_ID('tempdb..#MockTestIds') IS NOT NULL DROP TABLE #MockTestIds;
SELECT DISTINCT MockTestId INTO #MockTestIds
FROM (
    SELECT MockTestId FROM dbo.TestQuestion WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds)
    UNION
    SELECT MockTestId FROM dbo.TestPool     WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds)
) touched;                                   -- every exam that has even ONE
                                              -- question from this lot, anywhere

IF OBJECT_ID('tempdb..#AttemptIds') IS NOT NULL DROP TABLE #AttemptIds;
SELECT AttemptId INTO #AttemptIds
FROM dbo.Attempt
WHERE MockTestId IN (SELECT MockTestId FROM #MockTestIds);  -- every attempt on
                                                              -- those exams, in full

IF OBJECT_ID('tempdb..#PaperIds') IS NOT NULL DROP TABLE #PaperIds;
SELECT DISTINCT PaperId INTO #PaperIds
FROM dbo.MockTest
WHERE MockTestId IN (SELECT MockTestId FROM #MockTestIds);

-- ---- Preview — always runs; review this before flipping @Confirm ----------
SELECT 'Questions in this lot'                          AS What, COUNT(*) AS Cnt FROM #QuestionIds
UNION ALL SELECT 'Question versions',                          COUNT(*) FROM dbo.QuestionVersion WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds)
UNION ALL SELECT 'Exams (MockTest) deleted in full',           COUNT(*) FROM #MockTestIds
UNION ALL SELECT 'TestQuestion rows removed (any lot, those exams)', COUNT(*) FROM dbo.TestQuestion WHERE MockTestId IN (SELECT MockTestId FROM #MockTestIds)
UNION ALL SELECT 'TestPool rows removed (any lot, those exams)',     COUNT(*) FROM dbo.TestPool     WHERE MockTestId IN (SELECT MockTestId FROM #MockTestIds)
UNION ALL SELECT 'Student attempts deleted in full',           COUNT(*) FROM #AttemptIds
UNION ALL SELECT 'AttemptAnswer rows removed (any question, those attempts)', COUNT(*) FROM dbo.AttemptAnswer WHERE AttemptId IN (SELECT AttemptId FROM #AttemptIds)
UNION ALL SELECT 'Distinct students affected',                 COUNT(DISTINCT StudentId) FROM dbo.Attempt WHERE AttemptId IN (SELECT AttemptId FROM #AttemptIds);

IF @Confirm = 0
BEGIN
    PRINT 'PREVIEW ONLY — @Confirm is 0, nothing was deleted.';
    PRINT 'Review the counts above. If they look right, set @Confirm = 1 near the top and re-run the whole script.';
    RETURN;
END

-- ---- The actual hard delete, in FK-safe child-to-parent order -------------
BEGIN TRY
    BEGIN TRANSACTION;

    -- 1) Attempt-side — every attempt on every touched exam, in full.
    DELETE FROM dbo.AttemptEvent   WHERE AttemptId IN (SELECT AttemptId FROM #AttemptIds);
    DELETE FROM dbo.AttemptAnswer  WHERE AttemptId IN (SELECT AttemptId FROM #AttemptIds);
    DELETE FROM dbo.AttemptSection WHERE AttemptId IN (SELECT AttemptId FROM #AttemptIds);
    DELETE FROM dbo.Attempt        WHERE AttemptId IN (SELECT AttemptId FROM #AttemptIds);

    -- 2) Exam-side — every touched MockTest, in full (including its
    --    questions from other lots), plus its own private ExamPaper/sections.
    DELETE FROM dbo.TestQuestion    WHERE MockTestId IN (SELECT MockTestId FROM #MockTestIds);
    DELETE FROM dbo.TestPool        WHERE MockTestId IN (SELECT MockTestId FROM #MockTestIds);
    DELETE FROM dbo.MockTestPackage WHERE MockTestId IN (SELECT MockTestId FROM #MockTestIds);
    DELETE FROM dbo.QuestionMarks   WHERE PaperId IN (SELECT PaperId FROM #PaperIds);
    DELETE FROM dbo.MockTest        WHERE MockTestId IN (SELECT MockTestId FROM #MockTestIds);
    DELETE FROM dbo.PaperSection    WHERE PaperId IN (SELECT PaperId FROM #PaperIds);
    DELETE FROM dbo.ExamPaper       WHERE PaperId IN (SELECT PaperId FROM #PaperIds);

    -- 3) Question-side — every question actually in this lot.
    DELETE FROM dbo.StudentBookmark     WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.StudentQuestionSeen WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.QuestionReport      WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.QuestionStat        WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.ReviewAction        WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.QuestionSearch      WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.QuestionTag         WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.QuestionRelation
        WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds)
           OR RelatedQuestionId IN (SELECT QuestionId FROM #QuestionIds);

    DELETE qvt
    FROM dbo.QuestionVersionTranslation qvt
    JOIN dbo.QuestionVersion qv ON qv.VersionId = qvt.VersionId
    WHERE qv.QuestionId IN (SELECT QuestionId FROM #QuestionIds);

    -- Break the circular FK (Question.CurrentVersionId -> QuestionVersion)
    -- before dropping the versions it points at.
    UPDATE dbo.Question SET CurrentVersionId = NULL WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.QuestionVersion WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);
    DELETE FROM dbo.Question        WHERE QuestionId IN (SELECT QuestionId FROM #QuestionIds);

    -- 4) The lot itself.
    DELETE FROM dbo.QuestionLot WHERE LotId = @LotId;

    COMMIT TRANSACTION;
    PRINT 'Done — lot ' + @LotNo + ' (LotId ' + CAST(@LotId AS VARCHAR(20)) + ') and everything under it, including every exam/attempt it touched, was hard-deleted.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH
