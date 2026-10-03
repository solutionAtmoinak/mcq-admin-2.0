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
TagsJson AS
(
    SELECT
        q.MCQQuestionId,
        JSON_QUERY(
        (
            SELECT DISTINCT
                x.[Key],
                x.[Value]
            FROM
            (
                -- Question Tags
                SELECT
                    N'Tag' AS [Key],
                    t.TagName AS [Value]
                FROM dbo.TblMasterMCQ9QuestionTags t
                WHERE t.QuestionId = q.MCQQuestionId
                  AND t.IsDeleted = 0
                  AND NULLIF(LTRIM(RTRIM(t.TagName)), N'') IS NOT NULL

                UNION ALL

                -- Chapter information
                SELECT
                    v.[Key],
                    v.[Value]
                FROM dbo.tblMasterMCQ10Chapter c
                LEFT JOIN dbo.tblMasterSectionChapters ch
                    ON ch.SectionChapterId = c.ChapterId
                LEFT JOIN dbo.tblMasterSectionChapters parent
                    ON parent.SectionChapterId = c.MasterParentId
                CROSS APPLY
                (
                    VALUES
                        (N'ChapterId',        CONVERT(nvarchar(20), c.ChapterId)),
                        (N'ChapterName',      NULLIF(TRIM(ch.SectionChapterName), N'')),
                        (N'MasterParentId',   CONVERT(nvarchar(20), c.MasterParentId)),
                        (N'MasterParentName', NULLIF(TRIM(parent.SectionChapterName), N''))
                ) v([Key], [Value])
                WHERE c.QuestionId = q.MCQQuestionId
                  AND c.IsDeleted = 0
                  AND v.[Value] IS NOT NULL
            ) x
            FOR JSON PATH
        )) AS TagsArrayJson
    FROM dbo.TblMasterMCQ4Question q
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