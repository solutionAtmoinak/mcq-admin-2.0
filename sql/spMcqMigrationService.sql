SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- =============================================
-- Author:		<Author, DbTeam>
-- Create date: <Create Date, 2024-03-10 13:09:25.567>
-- Description:	<Description, storage purpose>
-- =============================================

ALTER   PROCEDURE [dbo].[spMcqMigrationService]
    @Mode int = 0,
	@IP VARCHAR(20) = NULL,
	@UserId NVARCHAR(450) = NULL,
	@FranchiseId int = 0,
	@json NVARCHAR(MAX) = NULL,	
    @output Nvarchar(max) OUTPUT
AS
BEGIN
BEGIN TRY
BEGIN TRANSACTION

DECLARE
@SectionId INT, @ExtractedJson NVARCHAR(MAX), @QuestionIdsJson NVARCHAR(MAX),
@LotIdText NVARCHAR(50), @LotId BIGINT,
@QuestionsJson NVARCHAR(MAX), @Total INT,
@RowNo INT, @MaxRowNo INT, @CurCode NVARCHAR(50), @CurTypeCode VARCHAR(50), @CurTypeId INT,
@CurDifficulty TINYINT, @CurStatus INT, @CurEstSolveSec SMALLINT, @CurPresentationJson NVARCHAR(MAX),
@CurAnswerJson NVARCHAR(MAX), @CurSearchText NVARCHAR(MAX), @CurTagsJson NVARCHAR(MAX),
@NewQuestionId BIGINT, @NewVersionId BIGINT, @ContentHash CHAR(64), @CodeAttempts INT,
@TagRowNo INT, @TagMaxRowNo INT, @TagKey NVARCHAR(200), @TagValue NVARCHAR(200),
@DimensionId INT, @DimCode VARCHAR(50), @TagId BIGINT, @ApprovedStatus INT;

-- T-SQL does not allow a TABLE variable declaration inside the same
-- comma-separated DECLARE list as scalar variables — each one needs its
-- own standalone DECLARE statement.
DECLARE @QInput TABLE (RowNo INT IDENTITY(1,1), Code NVARCHAR(50), TypeCode VARCHAR(50), Difficulty TINYINT, Status INT, EstSolveSec SMALLINT, PresentationJson NVARCHAR(MAX), AnswerJson NVARCHAR(MAX), SearchText NVARCHAR(MAX), TagsJson NVARCHAR(MAX));
DECLARE @TagInput TABLE (RowNo INT IDENTITY(1,1), TagKey NVARCHAR(200), TagValue NVARCHAR(200));
DECLARE @CreatedOutput TABLE (Code VARCHAR(50), QuestionId BIGINT);
DECLARE @NewId TABLE (Id BIGINT);

BEGIN
   
    

-- Mode 1: Extract one legacy section's questions as Mode 2-ready JSON
-- (extractBySectionId). @json: {"SectionId": <int>, "QuestionIds":
-- [<bigint>, ...] | null}. Read-only. Parameterized version of
-- mcq-admin/sql/migrate-section-566-preview.sql — see that file for the
-- full row-shape rationale (passage text folded into stem, media resolved
-- via GetDocumentPath and defaulted to kind "image", tags filed under
-- dimension "Chapter", TypeCode derived from IsMultipleCorrect so a section
-- with genuine multi-answer questions maps to "msq" instead of always
-- "mcq_single", Difficulty fixed at 3 since the legacy schema has no
-- difficulty concept). PresentationJson/AnswerJson/TagsJson come back as
-- JSON-TEXT STRINGS (not nested JSON) inside the response array, matching
-- exactly what Mode 2 expects verbatim and what the admin UI's
-- ImportWorkspace.tsx JSON.parse()s per row.
--
-- QuestionIds is optional and additive: when present, BaseQ is further
-- restricted to just those ids (still scoped to @SectionId, still behind
-- the same franchise permission check below) instead of the whole section.
-- Large sections (1000+ questions) time out building the full per-row JSON
-- in one call — the admin UI's ExtractPanel first calls Mode 3 (cheap:
-- just MCQQuestionId, no joins) to get the full id list, then calls this
-- mode once per page-sized chunk of ids, so each call only has to build
-- JSON for a page's worth of rows.
if(@Mode = 1)
BEGIN
    SELECT @SectionId = SectionId FROM OPENJSON(@json) WITH (SectionId INT)
    IF @SectionId IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'SectionId is required.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    IF NOT EXISTS (
        select 1 from DBDTHLMSPro..TblMasterMCQ3Section ms
        join DBDTHLMSPro..TblMasterMCQ2Paper mp on ms.MCQPaperId = mp.MCQPaperId
        where mp.FranchiseId = @FranchiseId and MCQSectionId = @SectionId
    )
    BEGIN
        SET @output = (
            SELECT 0 AS ID,
                400 AS statuscode,
                'Not permitterd !!' AS response
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        COMMIT RETURN;
    END

    -- The .NET executor can hand a nested array over as a JSON *string*
    -- instead of a real array (same quirk Mode 2 handles for Questions) —
    -- accept either form.
    SET @QuestionIdsJson = NULL
    SELECT @QuestionIdsJson = Q FROM OPENJSON(@json) WITH (Q NVARCHAR(MAX) '$.QuestionIds' AS JSON)
    IF @QuestionIdsJson IS NULL
        SELECT @QuestionIdsJson = Q FROM OPENJSON(@json) WITH (Q NVARCHAR(MAX) '$.QuestionIds')
    IF @QuestionIdsJson IS NOT NULL AND ISJSON(@QuestionIdsJson) = 0 SET @QuestionIdsJson = NULL

    -- The CTE chain below must be a single top-level statement (a WITH
    -- clause can't be nested inside another expression's parentheses), so it
    -- assigns straight into @ExtractedJson; the {ID, statuscode, response}
    -- envelope is built as a separate statement right after.
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
            q.IsMultipleCorrect,
            p.PassageDetails,
            p.DocumentId AS PassageDocumentId
        FROM DBDthLmsPro.dbo.TblMasterMCQ4Question q
        LEFT JOIN DBDthLmsPro.dbo.TblMasterMCQ5PassageDetail p ON p.MCQPassageId = q.MCQPassageId
        WHERE q.MCQSectionId = @SectionId AND q.IsDeleted = 0
          AND (@QuestionIdsJson IS NULL OR q.MCQQuestionId IN (SELECT TRY_CAST([value] AS BIGINT) FROM OPENJSON(@QuestionIdsJson)))
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
        FROM DBDthLmsPro.dbo.TblMasterMCQ6SetAnswerOption o
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
                               DBDthLmsPro.dbo.GetDocumentPath(o2.MCQOptionDocumentId) AS url,
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
        JOIN DBDthLmsPro.dbo.TblMasterMCQ7SetCorrectAnswer c ON c.MCQOptionId = o.MCQOptionId
        GROUP BY o.MCQQuestionId
    ),
    TagsJson AS (
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
                    FROM DBDTHLMSPro.dbo.TblMasterMCQ9QuestionTags t
                    WHERE t.QuestionId = q.MCQQuestionId
                    AND t.IsDeleted = 0
                    AND NULLIF(LTRIM(RTRIM(t.TagName)), N'') IS NOT NULL

                    UNION ALL

                    -- Chapter information
                    SELECT
                        v.[Key],
                        v.[Value]
                    FROM DBDTHLMSPro.dbo.tblMasterMCQ10Chapter c
                    LEFT JOIN DBDTHLMSPro.dbo.tblMasterSectionChapters ch
                        ON ch.SectionChapterId = c.ChapterId
                    LEFT JOIN DBDTHLMSPro.dbo.tblMasterSectionChapters parent
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
        FROM DBDTHLMSPro.dbo.TblMasterMCQ4Question q
    ),
    SearchWords AS (
        SELECT
            q.MCQQuestionId,
            q.MCQQuestion AS StemText,
            (SELECT STRING_AGG(o.MCQOption, ' ') FROM Opt o WHERE o.MCQQuestionId = q.MCQQuestionId) AS OptionsText,
            (SELECT STRING_AGG(t2.TagName, ' ') FROM DBDthLmsPro.dbo.TblMasterMCQ9QuestionTags t2 WHERE t2.QuestionId = q.MCQQuestionId AND t2.IsDeleted = 0) AS TagsText
        FROM BaseQ q
    )
    SELECT @ExtractedJson = (
        SELECT
            q.MCQQuestionId AS LegacyQuestionId,
            CASE WHEN q.IsMultipleCorrect = 1 THEN N'msq' ELSE N'mcq_single' END AS TypeCode,
            3 AS Difficulty,
            q.MCQQuestionMarks AS Marks,
            q.MCQNegativeMarks AS Negative,
            (
                SELECT
                    s.StemHtml AS stem,
                    JSON_QUERY(CASE WHEN s.EffectiveMediaDocId IS NOT NULL THEN (
                        SELECT CAST(s.EffectiveMediaDocId AS VARCHAR(20)) AS id,
                               DBDthLmsPro.dbo.GetDocumentPath(s.EffectiveMediaDocId) AS url,
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
                               DBDthLmsPro.dbo.GetDocumentPath(q.AnswerDocumentId) AS url,
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
        ORDER BY q.MCQQuestionId
        FOR JSON PATH
    )

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        JSON_QUERY(ISNULL(@ExtractedJson, N'[]')) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 2: Create questions in bulk, uncapped (createQuestionsBulk). Same
-- @json contract, DB-level checks, and writes as spMcqTeacherService's old
-- Mode 13/33 (Question, QuestionVersion, find-or-create TagDimension/Tag +
-- QuestionTag, QuestionSearch, zeroed QuestionStat) — no 200-row cap, since
-- this SP only ever exists for one-off bulk migrations. Tag find-or-create
-- (TagDimension/Tag matched by exact Name, scoped by FranchiseId) reuses the
-- same TagId whenever a value repeats across the whole call, so hundreds of
-- questions sharing a Chapter tag correctly collapse onto one Tag row.
if(@Mode = 2)
BEGIN
    SELECT @LotIdText = LotId FROM OPENJSON(@json) WITH (LotId NVARCHAR(50))
    SET @LotId = TRY_CAST(@LotIdText AS BIGINT)

    -- The .NET executor can hand a nested array over as a JSON *string*
    -- (Questions: "[{...}]") instead of a real array, in which case
    -- OPENJSON(@json, '$.Questions') silently yields zero rows. Accept
    -- either form; the same goes for each question's Tags.
    SET @QuestionsJson = NULL
    SELECT @QuestionsJson = Q FROM OPENJSON(@json) WITH (Q NVARCHAR(MAX) '$.Questions' AS JSON)
    IF @QuestionsJson IS NULL
        SELECT @QuestionsJson = Q FROM OPENJSON(@json) WITH (Q NVARCHAR(MAX) '$.Questions')
    IF @QuestionsJson IS NOT NULL AND ISJSON(@QuestionsJson) = 0 SET @QuestionsJson = NULL

    DELETE FROM @QInput
    INSERT INTO @QInput (Code, TypeCode, Difficulty, Status, EstSolveSec, PresentationJson, AnswerJson, SearchText, TagsJson)
    SELECT Code, TypeCode, Difficulty, Status, EstSolveSec, PresentationJson, AnswerJson, SearchText, COALESCE(Tags, TagsStr)
    FROM OPENJSON(@QuestionsJson)
    WITH (
        Code NVARCHAR(50), TypeCode VARCHAR(50), Difficulty TINYINT, Status INT, EstSolveSec SMALLINT,
        PresentationJson NVARCHAR(MAX), AnswerJson NVARCHAR(MAX), SearchText NVARCHAR(MAX),
        Tags NVARCHAR(MAX) AS JSON, TagsStr NVARCHAR(MAX) '$.Tags'
    )

    SELECT @Total = COUNT(*) FROM @QInput
    IF @Total = 0
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'No questions to create.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF EXISTS (SELECT 1 FROM @QInput qi WHERE NOT EXISTS (SELECT 1 FROM QuestionType t WHERE t.Code = qi.TypeCode AND t.IsDeleted = 0))
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'One or more questions have an unknown question type.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF EXISTS (SELECT Code FROM @QInput WHERE Code IS NOT NULL AND LTRIM(RTRIM(Code)) <> '' GROUP BY Code HAVING COUNT(*) > 1)
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'Duplicate code(s) in this batch.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF EXISTS (SELECT 1 FROM @QInput qi WHERE qi.Code IS NOT NULL AND LTRIM(RTRIM(qi.Code)) <> '' AND EXISTS (SELECT 1 FROM Question q WHERE q.Code = qi.Code))
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'One or more codes already exist.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SELECT @ApprovedStatus = TRY_CAST(ServiceValue AS INT) FROM _InternalService WHERE Category = 'QUESTION_STATUS' AND ServiceLabel = 'APPROVED' AND IsActive = 1

    DELETE FROM @CreatedOutput
    SELECT @RowNo = MIN(RowNo), @MaxRowNo = MAX(RowNo) FROM @QInput
    WHILE @RowNo IS NOT NULL AND @RowNo <= @MaxRowNo
    BEGIN
        SELECT
            @CurCode = Code, @CurTypeCode = TypeCode, @CurDifficulty = Difficulty, @CurStatus = Status,
            @CurEstSolveSec = EstSolveSec, @CurPresentationJson = PresentationJson, @CurAnswerJson = AnswerJson,
            @CurSearchText = SearchText, @CurTagsJson = TagsJson
        FROM @QInput WHERE RowNo = @RowNo

        SELECT @CurTypeId = QuestionTypeId FROM QuestionType WHERE Code = @CurTypeCode AND IsDeleted = 0

        IF @CurCode IS NULL OR LTRIM(RTRIM(@CurCode)) = ''
        BEGIN
            SET @CodeAttempts = 0
            WHILE 1 = 1
            BEGIN
                SET @CurCode = 'Q-' + UPPER(LEFT(@CurTypeCode, 3)) + '-' + UPPER(CONVERT(VARCHAR(8), CRYPT_GEN_RANDOM(4), 2))
                IF NOT EXISTS (SELECT 1 FROM Question WHERE Code = @CurCode) BREAK
                SET @CodeAttempts += 1
                IF @CodeAttempts > 5 BREAK
            END
        END

        DELETE FROM @NewId
        IF @CurStatus = @ApprovedStatus
            INSERT INTO dbo.Question (Code, QuestionTypeId, Difficulty, Status, EstSolveSec, LotId, ApprovedBy, ApprovedOn, CreatedBy, FranchiseId)
            OUTPUT INSERTED.QuestionId INTO @NewId
            VALUES (@CurCode, @CurTypeId, @CurDifficulty, @CurStatus, @CurEstSolveSec, @LotId, @UserId, GETDATE(), @UserId, @FranchiseId)
        ELSE
            INSERT INTO dbo.Question (Code, QuestionTypeId, Difficulty, Status, EstSolveSec, LotId, CreatedBy, FranchiseId)
            OUTPUT INSERTED.QuestionId INTO @NewId
            VALUES (@CurCode, @CurTypeId, @CurDifficulty, @CurStatus, @CurEstSolveSec, @LotId, @UserId, @FranchiseId)
        SELECT @NewQuestionId = Id FROM @NewId

        SET @ContentHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', @CurPresentationJson + '|' + @CurAnswerJson), 2))

        DELETE FROM @NewId
        INSERT INTO dbo.QuestionVersion (QuestionId, VersionNo, Locale, PresentationJson, AnswerJson, MetaJson, ContentHash, ChangeNote, CreatedBy, FranchiseId)
        OUTPUT INSERTED.VersionId INTO @NewId
        VALUES (@NewQuestionId, 1, 'en', @CurPresentationJson, @CurAnswerJson, N'{"source":"migration-service"}', @ContentHash, 'Initial version', @UserId, @FranchiseId)
        SELECT @NewVersionId = Id FROM @NewId

        UPDATE dbo.Question SET CurrentVersionId = @NewVersionId, ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE QuestionId = @NewQuestionId

        DELETE FROM @TagInput
        INSERT INTO @TagInput (TagKey, TagValue)
        SELECT [Key], Value FROM OPENJSON(@CurTagsJson) WITH ([Key] NVARCHAR(200) '$.Key', Value NVARCHAR(200) '$.Value')
        WHERE [Key] IS NOT NULL AND LTRIM(RTRIM([Key])) <> '' AND Value IS NOT NULL AND LTRIM(RTRIM(Value)) <> ''

        SELECT @TagRowNo = MIN(RowNo), @TagMaxRowNo = MAX(RowNo) FROM @TagInput
        WHILE @TagRowNo IS NOT NULL AND @TagRowNo <= @TagMaxRowNo
        BEGIN
            SELECT @TagKey = LTRIM(RTRIM(TagKey)), @TagValue = LTRIM(RTRIM(TagValue)) FROM @TagInput WHERE RowNo = @TagRowNo

            SET @DimensionId = NULL
            SELECT TOP 1 @DimensionId = DimensionId FROM TagDimension
            WHERE IsDeleted = 0 AND FranchiseId = @FranchiseId AND (Name = @TagKey OR Code = @TagKey)

            IF @DimensionId IS NULL
            BEGIN
                SET @DimCode = LOWER(LEFT(REPLACE(REPLACE(REPLACE(REPLACE(@TagKey, ' ', '_'), '-', '_'), '/', '_'), '\', '_'), 40))
                IF @DimCode = '' SET @DimCode = 'tag'
                SET @DimCode = @DimCode + '_' + LOWER(CONVERT(VARCHAR(8), CRYPT_GEN_RANDOM(4), 2))
                INSERT INTO dbo.TagDimension (Code, Name, CreatedBy, FranchiseId) VALUES (@DimCode, @TagKey, @UserId, @FranchiseId)
                SET @DimensionId = CAST(SCOPE_IDENTITY() AS INT)
            END

            SET @TagId = NULL
            SELECT TOP 1 @TagId = TagId FROM Tag WHERE DimensionId = @DimensionId AND IsDeleted = 0 AND FranchiseId = @FranchiseId AND Name = @TagValue

            IF @TagId IS NULL
            BEGIN
                DELETE FROM @NewId
                INSERT INTO dbo.Tag (DimensionId, Name, CreatedBy, FranchiseId)
                OUTPUT INSERTED.TagId INTO @NewId
                VALUES (@DimensionId, @TagValue, @UserId, @FranchiseId)
                SELECT @TagId = Id FROM @NewId
            END

            IF NOT EXISTS (SELECT 1 FROM QuestionTag WHERE QuestionId = @NewQuestionId AND TagId = @TagId)
                INSERT INTO dbo.QuestionTag (TagId, QuestionId, CreatedBy, FranchiseId) VALUES (@TagId, @NewQuestionId, @UserId, @FranchiseId)

            SET @TagRowNo += 1
        END

        INSERT INTO dbo.QuestionSearch (QuestionId, Locale, SearchText, CreatedBy, FranchiseId) VALUES (@NewQuestionId, 'en', @CurSearchText, @UserId, @FranchiseId)
        INSERT INTO dbo.QuestionStat (QuestionId, CreatedBy, FranchiseId) VALUES (@NewQuestionId, @UserId, @FranchiseId)
        INSERT INTO @CreatedOutput (Code, QuestionId) VALUES (@CurCode, @NewQuestionId)

        SET @RowNo += 1
    END

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (SELECT JSON_QUERY((SELECT Code, CAST(QuestionId AS VARCHAR(20)) AS QuestionId FROM @CreatedOutput ORDER BY QuestionId FOR JSON PATH)) AS Created FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

if(@Mode = 3)
begin
    SELECT @SectionId = SectionId FROM OPENJSON(@json) WITH (SectionId INT)
    IF @SectionId IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'SectionId is required.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    IF NOT EXISTS (
        select 1 from DBDTHLMSPro..TblMasterMCQ3Section ms
        join DBDTHLMSPro..TblMasterMCQ2Paper mp on ms.MCQPaperId = mp.MCQPaperId
        where mp.FranchiseId = @FranchiseId and MCQSectionId = @SectionId
    )
    BEGIN
        SET @output = (
            SELECT 0 AS ID,
                400 AS statuscode,
                'Not permitterd !!' AS response
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        COMMIT RETURN;
    END

    SET @output = (
        SELECT 1 AS ID,
           200 AS statuscode,
           (
                select 
                    MCQQuestionId 
                from 
                DBDTHLMSPro..TblMasterMCQ4Question
                where MCQSectionId = @SectionId
                and ISDeleted = 0
                for json path
           ) AS response
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'Unknown mode.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
COMMIT RETURN;


	
END
COMMIT TRANSACTION 

    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION -- Rollback transaction in case of error

        -- Insert error details into the DatabaseError table
        INSERT INTO DatabaseError (Error_State, Error_Line, ERROR_MESSAGE, ERROR_PROCEDURE, DateOfError, FranchiseId, IpAddress, jsonData, Mode, UserId)
        VALUES (
            ERROR_STATE(),
            ERROR_LINE(),
            ERROR_MESSAGE(),
            ERROR_PROCEDURE(),
            GETDATE(),
            @FranchiseId,
            @IP,
            @json,
            @Mode,
            @UserId
        );

		SET @output = JSON_QUERY((select 0 as ID, 400 as StatusCode, ERROR_MESSAGE() as response FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END CATCH
END
GO
