-- =====================================================================
-- Migration preview: TblMasterMCQ4Question (MCQSectionId = 566, IsDeleted = 0)
-- -> Mode 13 (createQuestions) JSON payload shape.
--
-- Run this against the OLD DB. One row per legacy question. PresentationJson
-- / AnswerJson / TagsJson come out as ready-to-use JSON text matching
-- Mode 13's Questions[] contract (see mcq-admin/app/lib/questions/schema.ts
-- buildContent(), and mcq-admin/sql/spMcqTeacherService.sql Mode 13).
--
-- Requires DBDTHLMSPro to be reachable cross-database (same server) for
-- GetDocumentPath(); if not on the same instance, prefix calls with a
-- linked server name instead.
--
-- This is a READ-ONLY preview step. Review the output here before wiring
-- it into the Mode 13 API calls (see plan: temp API route in mcq-admin that
-- mints a QuestionLot via Mode 12, resolves the Approved status via
-- getQuestionStatus(), batches these rows into <=200-row Mode 13 calls,
-- then runs a CreatedBy cleanup UPDATE scoped to that LotId).
-- =====================================================================

SET NOCOUNT ON;

;WITH BaseQ AS (
    SELECT
        q.MCQQuestionId,
        q.MCQQuestion,
        q.MCQPassageId,
        q.MCQQuestionMarks,
        q.MCQNegativeMarks,
        q.AnswerExplanation,
        q.DocumentId,
        q.AnswerDocumentId,
        p.PassageDetails,
        p.DocumentId AS PassageDocumentId
    FROM dbo.TblMasterMCQ4Question q
    LEFT JOIN dbo.TblMasterMCQ5PassageDetail p ON p.MCQPassageId = q.MCQPassageId
    WHERE q.MCQSectionId = 566 AND q.IsDeleted = 0
),
Stem AS (
    SELECT
        MCQQuestionId,
        CASE WHEN MCQPassageId IS NOT NULL
             THEN PassageDetails + N'<br/><br/>' + MCQQuestion
             ELSE MCQQuestion
        END AS StemHtml,
        COALESCE(DocumentId, PassageDocumentId) AS EffectiveMediaDocId
    FROM BaseQ
),
Opt AS (
    SELECT
        o.MCQOptionId,
        o.MCQQuestionId,
        o.MCQOption,
        o.MCQOptionDocumentId,
        ROW_NUMBER() OVER (PARTITION BY o.MCQQuestionId ORDER BY o.MCQOptionId) AS OptNum
    FROM dbo.TblMasterMCQ6SetAnswerOption o
    JOIN BaseQ q ON q.MCQQuestionId = o.MCQQuestionId
),
OptionsJson AS (
    SELECT
        o.MCQQuestionId,
        (
            SELECT
                CHAR(64 + o2.OptNum) AS id,
                o2.MCQOption AS [text],
                JSON_QUERY(CASE WHEN o2.MCQOptionDocumentId IS NOT NULL THEN (
                    SELECT CAST(o2.MCQOptionDocumentId AS VARCHAR(20)) AS id,
                           DBDTHLMSPro.dbo.GetDocumentPath(o2.MCQOptionDocumentId) AS url,
                           'image' AS kind
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                ) END) AS media
            FROM Opt o2
            WHERE o2.MCQQuestionId = o.MCQQuestionId
            ORDER BY o2.OptNum
            FOR JSON PATH
        ) AS OptionsArrayJson
    FROM Opt o
    GROUP BY o.MCQQuestionId
),
CorrectLetters AS (
    SELECT
        o.MCQQuestionId,
        STRING_AGG('"' + CHAR(64 + o.OptNum) + '"', ',') WITHIN GROUP (ORDER BY o.OptNum) AS CorrectArrayInner
    FROM Opt o
    JOIN dbo.TblMasterMCQ7SetCorrectAnswer c ON c.MCQOptionId = o.MCQOptionId
    GROUP BY o.MCQQuestionId
),
TagsJson AS (
    SELECT
        t.QuestionId AS MCQQuestionId,
        (
            SELECT N'Chapter' AS [Key], t2.TagName AS [Value]
            FROM dbo.TblMasterMCQ9QuestionTags t2
            WHERE t2.QuestionId = t.QuestionId
              AND t2.IsDeleted = 0
              AND NULLIF(LTRIM(RTRIM(t2.TagName)), N'') IS NOT NULL
            FOR JSON PATH
        ) AS TagsArrayJson
    FROM dbo.TblMasterMCQ9QuestionTags t
    GROUP BY t.QuestionId
),
SearchWords AS (
    SELECT
        q.MCQQuestionId,
        q.MCQQuestion AS StemText,
        (SELECT STRING_AGG(o.MCQOption, ' ') FROM Opt o WHERE o.MCQQuestionId = q.MCQQuestionId) AS OptionsText,
        (SELECT STRING_AGG(t2.TagName, ' ') FROM dbo.TblMasterMCQ9QuestionTags t2 WHERE t2.QuestionId = q.MCQQuestionId AND t2.IsDeleted = 0) AS TagsText
    FROM BaseQ q
)
SELECT
    q.MCQQuestionId AS LegacyQuestionId,
    N'mcq_single' AS TypeCode,
    3 AS Difficulty,
    q.MCQQuestionMarks AS Marks,
    q.MCQNegativeMarks AS Negative,
    (
        SELECT
            s.StemHtml AS stem,
            JSON_QUERY(CASE WHEN s.EffectiveMediaDocId IS NOT NULL THEN (
                SELECT CAST(s.EffectiveMediaDocId AS VARCHAR(20)) AS id,
                       DBDTHLMSPro.dbo.GetDocumentPath(s.EffectiveMediaDocId) AS url,
                       'image' AS kind
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) END) AS media,
            JSON_QUERY(ISNULL(oj.OptionsArrayJson, N'[]')) AS options
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ) AS PresentationJson,
    (
        SELECT
            JSON_QUERY('[' + ISNULL(cl.CorrectArrayInner, N'') + ']') AS correct,
            q.MCQQuestionMarks AS marks,
            q.MCQNegativeMarks AS negative,
            NULLIF(LTRIM(RTRIM(q.AnswerExplanation)), N'') AS explanation,
            JSON_QUERY(CASE WHEN q.AnswerDocumentId IS NOT NULL THEN (
                SELECT CAST(q.AnswerDocumentId AS VARCHAR(20)) AS id,
                       DBDTHLMSPro.dbo.GetDocumentPath(q.AnswerDocumentId) AS url,
                       'image' AS kind
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) END) AS explanationMedia
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ) AS AnswerJson,
    LEFT(
        (SELECT STRING_AGG(value, ' ') FROM STRING_SPLIT(
            REPLACE(REPLACE(REPLACE(
                sw.StemText + ' ' + ISNULL(sw.OptionsText,'') + ' ' + ISNULL(sw.TagsText,'')
            , CHAR(13), ' '), CHAR(10), ' '), CHAR(9), ' ')
        , ' ') WHERE value <> ''),
    3800) AS SearchText,
    ISNULL(tj.TagsArrayJson, N'[]') AS TagsJson
FROM BaseQ q
JOIN Stem s ON s.MCQQuestionId = q.MCQQuestionId
LEFT JOIN OptionsJson oj ON oj.MCQQuestionId = q.MCQQuestionId
LEFT JOIN CorrectLetters cl ON cl.MCQQuestionId = q.MCQQuestionId
LEFT JOIN TagsJson tj ON tj.MCQQuestionId = q.MCQQuestionId
LEFT JOIN SearchWords sw ON sw.MCQQuestionId = q.MCQQuestionId
ORDER BY q.MCQQuestionId;

-- =====================================================================
-- Sanity checks -- run these too and flag any non-zero counts before
-- trusting the batch:
-- =====================================================================

-- Questions with no linked correct answer (would migrate as correct: [])
SELECT q.MCQQuestionId
FROM TblMasterMCQ4Question q
WHERE q.MCQSectionId = 566 AND q.IsDeleted = 0
  AND NOT EXISTS (
      SELECT 1
      FROM TblMasterMCQ6SetAnswerOption o
      JOIN TblMasterMCQ7SetCorrectAnswer c ON c.MCQOptionId = o.MCQOptionId
      WHERE o.MCQQuestionId = q.MCQQuestionId
  );

-- Questions with more than one linked correct answer (unexpected, since
-- IsMultipleCorrect = 0 for all rows in this section)
SELECT q.MCQQuestionId, COUNT(*) AS CorrectCount
FROM TblMasterMCQ4Question q
JOIN TblMasterMCQ6SetAnswerOption o ON o.MCQQuestionId = q.MCQQuestionId
JOIN TblMasterMCQ7SetCorrectAnswer c ON c.MCQOptionId = o.MCQOptionId
WHERE q.MCQSectionId = 566 AND q.IsDeleted = 0
GROUP BY q.MCQQuestionId
HAVING COUNT(*) > 1;

-- Questions with fewer than 2 options
SELECT q.MCQQuestionId, COUNT(o.MCQOptionId) AS OptionCount
FROM TblMasterMCQ4Question q
LEFT JOIN TblMasterMCQ6SetAnswerOption o ON o.MCQQuestionId = q.MCQQuestionId
WHERE q.MCQSectionId = 566 AND q.IsDeleted = 0
GROUP BY q.MCQQuestionId
HAVING COUNT(o.MCQOptionId) < 2;
