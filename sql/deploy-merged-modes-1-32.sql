USE [DBDTHMCQPRO]
GO
/****** Object:  StoredProcedure [dbo].[spMcqTeacherService] ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- =============================================
-- Author:		<Author, DbTeam>
-- Create date: <Create Date, 2024-03-10 13:09:25.567>
-- Description:	<Description, storage purpose>
-- Modes 3-32 added by Claude Code (mcq-admin Prisma-removal migration) —
-- see mcq-admin/sql/spMcqTeacherService.sql in the repo for per-mode docs.
-- =============================================

ALTER PROCEDURE [dbo].[spMcqTeacherService]
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


BEGIN
DECLARE
    @Page INT, @PageSize INT, @Total INT, @Category NVARCHAR(250),
    @SevenDaysAgo DATETIME, @StartOfDay DATETIME,
    @Q NVARCHAR(4000), @QPattern NVARCHAR(MAX), @TypeId INT, @Difficulty TINYINT, @Status INT,
    @LotIdText NVARCHAR(50), @LotId BIGINT, @HasLotFilter BIT,
    @TagKeysCsv NVARCHAR(MAX), @TagValuesCsv NVARCHAR(MAX), @HasTagKeys BIT, @HasTagValues BIT,
    @ExcludeIdsCsv NVARCHAR(MAX), @HasExcludeIds BIT, @Limit INT, @QuestionId BIGINT,
    @LotNo VARCHAR(50), @LotNoAttempts INT, @ApprovedStatus INT,
    @RowNo INT, @MaxRowNo INT, @CurCode NVARCHAR(50), @CurTypeCode VARCHAR(50), @CurTypeId INT,
    @CurDifficulty TINYINT, @CurStatus INT, @CurEstSolveSec SMALLINT, @CurPresentationJson NVARCHAR(MAX),
    @CurAnswerJson NVARCHAR(MAX), @CurSearchText NVARCHAR(MAX), @CurTagsJson NVARCHAR(MAX),
    @NewQuestionId BIGINT, @NewVersionId BIGINT, @ContentHash CHAR(64), @CodeAttempts INT,
    @TagRowNo INT, @TagMaxRowNo INT, @TagKey NVARCHAR(200), @TagValue NVARCHAR(200),
    @DimensionId INT, @DimCode VARCHAR(50), @TagId BIGINT,
    @NextVersionNo INT, @ChangeNote NVARCHAR(400),
    @ToStatus INT, @Comment NVARCHAR(MAX), @ExistingStatus INT, @ExistingVersionId BIGINT,
    @TemplateId BIGINT, @PaperId BIGINT, @MockTestId BIGINT,
    @PublishedStatus INT, @DraftStatus INT, @DraftStatus2 INT, @SecNegative DECIMAL(5,2),
    @BodyId BIGINT, @ProgramId BIGINT, @StageId BIGINT,
    @TestKindId INT, @TestKindCode VARCHAR(40), @TestKindName NVARCHAR(100),
    @ExamFilterJson NVARCHAR(MAX), @TemplateName NVARCHAR(200), @TemplateFilterJson NVARCHAR(MAX),
    @InitialStatus INT, @Instructions NVARCHAR(MAX),
    @MsName NVARCHAR(150), @MsRulesJson NVARCHAR(MAX),
    @PaperName NVARCHAR(200), @PaperCode VARCHAR(30), @PaperTotalMarks DECIMAL(6,2),
    @PaperDurationMin INT, @PaperIsQualifying BIT, @PaperDefaultLocale VARCHAR(10),
    @SchemeId BIGINT, @MtCode VARCHAR(50), @MtCodeAttempts INT,
    @SelectionPolicyJson NVARCHAR(MAX), @TemplateIdStr VARCHAR(20), @PriorTemplateId VARCHAR(20),
    @SecName NVARCHAR(100), @SecSeqNo INT, @SecRulesJson NVARCHAR(MAX), @SecSectionIdText VARCHAR(20),
    @SecSectionId BIGINT, @MatchesExisting BIT, @NewPool INT,
    @OverCapacityResolution VARCHAR(10), @ExamName NVARCHAR(200),
    @MarkingSchemeName NVARCHAR(150), @TotalMarks DECIMAL(6,2), @DurationMin INT,
    @ToStatus2 INT, @PackagesCsv NVARCHAR(MAX), @PackageId BIGINT,
    @QuestionIdsCsv NVARCHAR(MAX), @QuestionsJson NVARCHAR(MAX);

-- T-SQL does not allow a TABLE variable declaration inside the same
-- comma-separated DECLARE list as scalar variables — each one needs its
-- own standalone DECLARE statement.
DECLARE @QInput TABLE (RowNo INT IDENTITY(1,1), Code NVARCHAR(50), TypeCode VARCHAR(50), Difficulty TINYINT, Status INT, EstSolveSec SMALLINT, PresentationJson NVARCHAR(MAX), AnswerJson NVARCHAR(MAX), SearchText NVARCHAR(MAX), TagsJson NVARCHAR(MAX));
DECLARE @TagInput TABLE (RowNo INT IDENTITY(1,1), TagKey NVARCHAR(200), TagValue NVARCHAR(200));
DECLARE @CreatedOutput TABLE (Code VARCHAR(50), QuestionId BIGINT);
DECLARE @NewId TABLE (Id BIGINT);
DECLARE @SectionInput TABLE (RowNo INT IDENTITY(1,1), SectionIdText VARCHAR(20), SeqNo INT, Name NVARCHAR(100), RulesJson NVARCHAR(MAX));
DECLARE @CurSections TABLE (SectionId BIGINT, SeqNo INT, Kept BIT DEFAULT 0);
DECLARE @QuestionIdsInput TABLE (RowNo INT IDENTITY(1,1), QuestionId BIGINT);
DECLARE @OrderedIdsInput TABLE (RowNo INT IDENTITY(1,1), QuestionId BIGINT);

    -- teacher exam panel url fro admin panel
    if(@Mode = 1)
    BEGIN
        SET @output = (
            SELECT 1 AS ID,
            200 AS statuscode,
            'https://proexam.dthlms.com' AS response
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        COMMIT RETURN;
    END

    -- all packages with mcq
    if(@mode =2)
    BEGIN
        SET @output = (
            SELECT 1 AS ID,
            200 AS statuscode,
            (
                SELECT distinct p.PackageId AS [value]
				,p.PackageName AS [label]
				FROM DBDTHLMSPro.[dbo].[tblPackage] AS p
				JOIN DBDTHLMSPro..tblPackageService AS ps ON ps.PackageId = p.PackageId and ps.IsDeleted = 0 and ps.IsActive = 1
				WHERE p.FranchiseId = @FranchiseId
					AND p.IsDeleted = 0
					AND p.IsCombo = 0
					AND ps.ServiceId = 4 --mcq
                ORDER by PackageName
                for json path
            ) AS response
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        COMMIT RETURN;
    END

	

    if(@Mode = 3)
    BEGIN
        SELECT @Page = Page, @PageSize = PageSize
        FROM OPENJSON(@json) WITH (Page INT, PageSize INT)

        IF @Page IS NULL OR @Page < 1 SET @Page = 1
        IF @PageSize IS NULL OR @PageSize < 1 SET @PageSize = 20

        SELECT @Total = COUNT(*)
        FROM MockTest mt
        WHERE mt.IsDeleted = 0 AND mt.FranchiseId = @FranchiseId AND mt.IsPersonalized = 0

        SET @output = (
            SELECT 1 AS ID,
            200 AS statuscode,
            (
                SELECT
                    @Total AS Total,
                    JSON_QUERY((
                        SELECT
                            CAST(mt.MockTestId AS VARCHAR(20)) AS MockTestId,
                            mt.Code,
                            mt.Name,
                            mt.Status,
                            (
                                SELECT TOP 1 ServiceDisplayLabel
                                FROM _InternalService
                                WHERE Category = 'EXAM_STATUS' AND TRY_CAST(ServiceValue AS INT) = mt.Status AND IsActive = 1
                            ) AS StatusLabel,
                            ep.Name AS PaperName,
                            tk.Name AS TestKindName,
                            CAST(ep.TotalMarks AS VARCHAR(20)) AS TotalMarks,
                            ep.DurationMin,
                            mt.CreatedOn,
                            ISNULL(tq.QuestionCount, 0) AS QuestionCount,
                            JSON_QUERY((
                                SELECT CAST(mtp.PackageId AS VARCHAR(20)) AS PackageId
                                FROM MockTestPackage mtp
                                WHERE mtp.MockTestId = mt.MockTestId AND mtp.IsDeleted = 0
                                FOR JSON PATH, INCLUDE_NULL_VALUES
                            )) AS Packages
                        FROM MockTest mt
                        JOIN ExamPaper ep ON ep.PaperId = mt.PaperId
                        JOIN TestKind tk ON tk.TestKindId = mt.TestKindId
                        LEFT JOIN (
                            SELECT MockTestId, COUNT(*) AS QuestionCount
                            FROM TestQuestion
                            WHERE IsDeleted = 0
                            GROUP BY MockTestId
                        ) tq ON tq.MockTestId = mt.MockTestId
                        WHERE mt.IsDeleted = 0 AND mt.FranchiseId = @FranchiseId AND mt.IsPersonalized = 0
                        ORDER BY mt.CreatedOn DESC
                        OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
                        FOR JSON PATH, INCLUDE_NULL_VALUES
                    )) AS Items
                FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
            ) AS response
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        );
        COMMIT RETURN;
    END

-- Mode 4: _InternalService lookup — status/difficulty option lists (admin
-- app/lib/db/serviceConfig.ts's getServiceOptions/getServiceValue).
-- @json: {"Category": "QUESTION_STATUS" | "QUESTION_DIFFICULTY" | "EXAM_STATUS"}.
-- Numeric coercion of ServiceValue, label uppercasing, and the 60s cache all
-- stay in serviceConfig.ts — this mode is a straight read of the active rows
-- for one category, same filter/order the old Prisma call used
-- (Category = @Category AND IsActive = 1, ordered by SortedOrder/ServiceId).
if(@Mode = 4)
BEGIN
    SELECT @Category = Category FROM OPENJSON(@json) WITH (Category NVARCHAR(250))

    SET @output = (
        SELECT 1 AS ID,
        200 AS statuscode,
        (
            SELECT
                ServiceValue AS Value,
                ServiceLabel AS Label,
                ServiceDisplayLabel AS DisplayLabel,
                Category,
                Description
            FROM _InternalService
            WHERE Category = @Category AND IsActive = 1
            ORDER BY SortedOrder, ServiceId
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 5: Question editor reference data (getReferenceData). @json: {}.
-- Status/difficulty options come from Mode 4, called separately by TS — this
-- mode only returns QuestionType/TagDimension/Tag rows.
if(@Mode = 5)
BEGIN
    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT
                JSON_QUERY((
                    SELECT QuestionTypeId AS Id, Code, Name FROM QuestionType
                    WHERE IsDeleted = 0 AND IsActive = 1 ORDER BY QuestionTypeId FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS QuestionTypes,
                JSON_QUERY((
                    SELECT DimensionId AS Id, Code, Name FROM TagDimension
                    WHERE IsDeleted = 0 AND IsActive = 1 AND FranchiseId = @FranchiseId ORDER BY Name FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS Dimensions,
                JSON_QUERY((
                    SELECT CAST(TagId AS VARCHAR(20)) AS Id, DimensionId, Name FROM Tag
                    WHERE IsDeleted = 0 AND IsActive = 1 AND FranchiseId = @FranchiseId ORDER BY Name FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS Tags
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 6: Question bank summary tiles (getBankSummary). @json: {}.
if(@Mode = 6)
BEGIN
    SET @SevenDaysAgo = DATEADD(DAY, -7, GETDATE())

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT
                (SELECT COUNT(*) FROM Question WHERE IsDeleted = 0 AND FranchiseId = @FranchiseId) AS Total,
                (SELECT COUNT(*) FROM Question WHERE IsDeleted = 0 AND FranchiseId = @FranchiseId AND CreatedOn >= @SevenDaysAgo) AS RecentCount,
                JSON_QUERY((
                    SELECT Status, COUNT(*) AS Count FROM Question
                    WHERE IsDeleted = 0 AND FranchiseId = @FranchiseId
                    GROUP BY Status ORDER BY Status FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS ByStatus,
                JSON_QUERY((
                    SELECT qt.Code, qt.Name, ISNULL(qc.Cnt, 0) AS Count
                    FROM QuestionType qt
                    OUTER APPLY (
                        SELECT COUNT(*) AS Cnt FROM Question q
                        WHERE q.QuestionTypeId = qt.QuestionTypeId AND q.IsDeleted = 0 AND q.FranchiseId = @FranchiseId
                    ) qc
                    WHERE qt.IsDeleted = 0
                    ORDER BY qt.QuestionTypeId FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS ByType
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Modes 7/8 share the same filter (kept deliberately in sync, same
-- convention as spMcqStudentService's Modes 7/8 — any change to one's WHERE
-- clause belongs in the other too). @json (both): {"Q": "<search text>",
-- "TypeId": <int>, "Difficulty": <tinyint>, "Status": <int>,
-- "LotId": "<bigint string>", "TagKeys": "<csv>", "TagValues": "<csv>",
-- "ExcludeIds": "<csv bigint>"}. A garbage/unparseable LotId matches nothing
-- (rather than silently ignoring the filter), same defensive behavior the
-- old buildQuestionWhere had. Q is matched against QuestionSearch.SearchText
-- with a LIKE, manually escaping %, _ and [ (Prisma's `contains` did this
-- automatically).

-- Mode 7: Paginated question list (listQuestions).
-- @json adds: {"Page": <int>, "PageSize": <int>}.
if(@Mode = 7)
BEGIN
    SELECT
        @Page = Page, @PageSize = PageSize, @Q = Q, @TypeId = TypeId, @Difficulty = Difficulty,
        @Status = Status, @TagKeysCsv = TagKeys, @TagValuesCsv = TagValues, @ExcludeIdsCsv = ExcludeIds
    FROM OPENJSON(@json) WITH (
        Page INT, PageSize INT, Q NVARCHAR(4000), TypeId INT, Difficulty TINYINT, Status INT,
        TagKeys NVARCHAR(MAX), TagValues NVARCHAR(MAX), ExcludeIds NVARCHAR(MAX)
    )
    SELECT @LotIdText = LotId FROM OPENJSON(@json) WITH (LotId NVARCHAR(50))

    IF @Page IS NULL OR @Page < 1 SET @Page = 1
    IF @PageSize IS NULL OR @PageSize < 1 SET @PageSize = 20
    SET @HasLotFilter = CASE WHEN @LotIdText IS NOT NULL AND LTRIM(RTRIM(@LotIdText)) <> '' THEN 1 ELSE 0 END
    SET @LotId = TRY_CAST(@LotIdText AS BIGINT)
    SET @HasTagKeys = CASE WHEN @TagKeysCsv IS NOT NULL AND LTRIM(RTRIM(@TagKeysCsv)) <> '' THEN 1 ELSE 0 END
    SET @HasTagValues = CASE WHEN @TagValuesCsv IS NOT NULL AND LTRIM(RTRIM(@TagValuesCsv)) <> '' THEN 1 ELSE 0 END
    SET @HasExcludeIds = CASE WHEN @ExcludeIdsCsv IS NOT NULL AND LTRIM(RTRIM(@ExcludeIdsCsv)) <> '' THEN 1 ELSE 0 END
    SET @QPattern = CASE WHEN @Q IS NOT NULL AND LTRIM(RTRIM(@Q)) <> ''
        THEN '%' + REPLACE(REPLACE(REPLACE(@Q, '[', '[[]'), '%', '[%]'), '_', '[_]') + '%' ELSE NULL END

    SELECT @Total = COUNT(*)
    FROM Question q
    WHERE q.IsDeleted = 0 AND q.FranchiseId = @FranchiseId
      AND (@TypeId IS NULL OR q.QuestionTypeId = @TypeId)
      AND (@Difficulty IS NULL OR q.Difficulty = @Difficulty)
      AND (@Status IS NULL OR q.Status = @Status)
      AND (@HasLotFilter = 0 OR (@LotId IS NOT NULL AND q.LotId = @LotId))
      AND (@HasExcludeIds = 0 OR q.QuestionId NOT IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ExcludeIdsCsv, ',')))
      AND (@QPattern IS NULL OR EXISTS (SELECT 1 FROM QuestionSearch qs WHERE qs.QuestionId = q.QuestionId AND qs.SearchText LIKE @QPattern ESCAPE '['))
      AND ((@HasTagKeys = 0 AND @HasTagValues = 0) OR EXISTS (
            SELECT 1 FROM QuestionTag qt2
            JOIN Tag t2 ON t2.TagId = qt2.TagId
            JOIN TagDimension td2 ON td2.DimensionId = t2.DimensionId
            WHERE qt2.QuestionId = q.QuestionId AND qt2.IsDeleted = 0
              AND (@HasTagValues = 0 OR t2.Name IN (SELECT value FROM STRING_SPLIT(@TagValuesCsv, ',')))
              AND (@HasTagKeys = 0 OR td2.Name IN (SELECT value FROM STRING_SPLIT(@TagKeysCsv, ',')))
          ))

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT
                @Total AS Total,
                JSON_QUERY((
                    SELECT
                        CAST(q.QuestionId AS VARCHAR(20)) AS Id, q.Code, qt.Code AS TypeCode, qt.Name AS TypeName,
                        q.Difficulty, q.Status, JSON_QUERY(qv.PresentationJson) AS Presentation,
                        JSON_QUERY((
                            SELECT t3.Name FROM QuestionTag qt3 JOIN Tag t3 ON t3.TagId = qt3.TagId
                            WHERE qt3.QuestionId = q.QuestionId AND qt3.IsDeleted = 0 FOR JSON PATH, INCLUDE_NULL_VALUES
                        )) AS TagNames,
                        q.CreatedOn, ql.LotNo
                    FROM Question q
                    JOIN QuestionType qt ON qt.QuestionTypeId = q.QuestionTypeId
                    LEFT JOIN QuestionVersion qv ON qv.VersionId = q.CurrentVersionId
                    LEFT JOIN QuestionLot ql ON ql.LotId = q.LotId
                    WHERE q.IsDeleted = 0 AND q.FranchiseId = @FranchiseId
                      AND (@TypeId IS NULL OR q.QuestionTypeId = @TypeId)
                      AND (@Difficulty IS NULL OR q.Difficulty = @Difficulty)
                      AND (@Status IS NULL OR q.Status = @Status)
                      AND (@HasLotFilter = 0 OR (@LotId IS NOT NULL AND q.LotId = @LotId))
                      AND (@HasExcludeIds = 0 OR q.QuestionId NOT IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ExcludeIdsCsv, ',')))
                      AND (@QPattern IS NULL OR EXISTS (SELECT 1 FROM QuestionSearch qs WHERE qs.QuestionId = q.QuestionId AND qs.SearchText LIKE @QPattern ESCAPE '['))
                      AND ((@HasTagKeys = 0 AND @HasTagValues = 0) OR EXISTS (
                            SELECT 1 FROM QuestionTag qt2
                            JOIN Tag t2 ON t2.TagId = qt2.TagId
                            JOIN TagDimension td2 ON td2.DimensionId = t2.DimensionId
                            WHERE qt2.QuestionId = q.QuestionId AND qt2.IsDeleted = 0
                              AND (@HasTagValues = 0 OR t2.Name IN (SELECT value FROM STRING_SPLIT(@TagValuesCsv, ',')))
                              AND (@HasTagKeys = 0 OR td2.Name IN (SELECT value FROM STRING_SPLIT(@TagKeysCsv, ',')))
                          ))
                    ORDER BY q.CreatedOn DESC
                    OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY
                    FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS Items
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 8: Bare id list for "select all matching filters"
-- (listQuestionIdsForFilter). @json adds: {"Limit": <int>}.
if(@Mode = 8)
BEGIN
    SELECT
        @Q = Q, @TypeId = TypeId, @Difficulty = Difficulty, @Status = Status,
        @TagKeysCsv = TagKeys, @TagValuesCsv = TagValues, @ExcludeIdsCsv = ExcludeIds, @Limit = Limit
    FROM OPENJSON(@json) WITH (
        Q NVARCHAR(4000), TypeId INT, Difficulty TINYINT, Status INT,
        TagKeys NVARCHAR(MAX), TagValues NVARCHAR(MAX), ExcludeIds NVARCHAR(MAX), Limit INT
    )
    SELECT @LotIdText = LotId FROM OPENJSON(@json) WITH (LotId NVARCHAR(50))

    IF @Limit IS NULL OR @Limit < 0 SET @Limit = 0
    SET @HasLotFilter = CASE WHEN @LotIdText IS NOT NULL AND LTRIM(RTRIM(@LotIdText)) <> '' THEN 1 ELSE 0 END
    SET @LotId = TRY_CAST(@LotIdText AS BIGINT)
    SET @HasTagKeys = CASE WHEN @TagKeysCsv IS NOT NULL AND LTRIM(RTRIM(@TagKeysCsv)) <> '' THEN 1 ELSE 0 END
    SET @HasTagValues = CASE WHEN @TagValuesCsv IS NOT NULL AND LTRIM(RTRIM(@TagValuesCsv)) <> '' THEN 1 ELSE 0 END
    SET @HasExcludeIds = CASE WHEN @ExcludeIdsCsv IS NOT NULL AND LTRIM(RTRIM(@ExcludeIdsCsv)) <> '' THEN 1 ELSE 0 END
    SET @QPattern = CASE WHEN @Q IS NOT NULL AND LTRIM(RTRIM(@Q)) <> ''
        THEN '%' + REPLACE(REPLACE(REPLACE(@Q, '[', '[[]'), '%', '[%]'), '_', '[_]') + '%' ELSE NULL END

    SELECT @Total = COUNT(*)
    FROM Question q
    WHERE q.IsDeleted = 0 AND q.FranchiseId = @FranchiseId
      AND (@TypeId IS NULL OR q.QuestionTypeId = @TypeId)
      AND (@Difficulty IS NULL OR q.Difficulty = @Difficulty)
      AND (@Status IS NULL OR q.Status = @Status)
      AND (@HasLotFilter = 0 OR (@LotId IS NOT NULL AND q.LotId = @LotId))
      AND (@HasExcludeIds = 0 OR q.QuestionId NOT IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ExcludeIdsCsv, ',')))
      AND (@QPattern IS NULL OR EXISTS (SELECT 1 FROM QuestionSearch qs WHERE qs.QuestionId = q.QuestionId AND qs.SearchText LIKE @QPattern ESCAPE '['))
      AND ((@HasTagKeys = 0 AND @HasTagValues = 0) OR EXISTS (
            SELECT 1 FROM QuestionTag qt2
            JOIN Tag t2 ON t2.TagId = qt2.TagId
            JOIN TagDimension td2 ON td2.DimensionId = t2.DimensionId
            WHERE qt2.QuestionId = q.QuestionId AND qt2.IsDeleted = 0
              AND (@HasTagValues = 0 OR t2.Name IN (SELECT value FROM STRING_SPLIT(@TagValuesCsv, ',')))
              AND (@HasTagKeys = 0 OR td2.Name IN (SELECT value FROM STRING_SPLIT(@TagKeysCsv, ',')))
          ))

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT
                @Total AS Total,
                JSON_QUERY((
                    SELECT TOP (@Limit) CAST(q.QuestionId AS VARCHAR(20)) AS Id
                    FROM Question q
                    WHERE q.IsDeleted = 0 AND q.FranchiseId = @FranchiseId
                      AND (@TypeId IS NULL OR q.QuestionTypeId = @TypeId)
                      AND (@Difficulty IS NULL OR q.Difficulty = @Difficulty)
                      AND (@Status IS NULL OR q.Status = @Status)
                      AND (@HasLotFilter = 0 OR (@LotId IS NOT NULL AND q.LotId = @LotId))
                      AND (@HasExcludeIds = 0 OR q.QuestionId NOT IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ExcludeIdsCsv, ',')))
                      AND (@QPattern IS NULL OR EXISTS (SELECT 1 FROM QuestionSearch qs WHERE qs.QuestionId = q.QuestionId AND qs.SearchText LIKE @QPattern ESCAPE '['))
                      AND ((@HasTagKeys = 0 AND @HasTagValues = 0) OR EXISTS (
                            SELECT 1 FROM QuestionTag qt2
                            JOIN Tag t2 ON t2.TagId = qt2.TagId
                            JOIN TagDimension td2 ON td2.DimensionId = t2.DimensionId
                            WHERE qt2.QuestionId = q.QuestionId AND qt2.IsDeleted = 0
                              AND (@HasTagValues = 0 OR t2.Name IN (SELECT value FROM STRING_SPLIT(@TagValuesCsv, ',')))
                              AND (@HasTagKeys = 0 OR td2.Name IN (SELECT value FROM STRING_SPLIT(@TagKeysCsv, ',')))
                          ))
                    ORDER BY q.CreatedOn DESC
                    FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS Ids
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 9: Question-lot filter options (listQuestionLots). @json: {}. Only
-- lots with >= 1 active question, most recent 200 lots considered.
if(@Mode = 9)
BEGIN
    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT CAST(ql.LotId AS VARCHAR(20)) AS LotId, ql.LotNo, qc.Cnt AS QuestionCount, ql.CreatedOn
            FROM (SELECT TOP 200 * FROM QuestionLot WHERE IsDeleted = 0 AND FranchiseId = @FranchiseId ORDER BY CreatedOn DESC) ql
            CROSS APPLY (
                SELECT COUNT(*) AS Cnt FROM Question q
                WHERE q.LotId = ql.LotId AND q.IsDeleted = 0 AND q.FranchiseId = @FranchiseId
            ) qc
            WHERE qc.Cnt > 0
            ORDER BY ql.CreatedOn DESC
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 10: "Saved earlier today" explorer (getTodayQuestions).
-- @json: {"Limit": <int>}.
if(@Mode = 10)
BEGIN
    SELECT @Limit = Limit FROM OPENJSON(@json) WITH (Limit INT)
    IF @Limit IS NULL OR @Limit < 1 SET @Limit = 50
    SET @StartOfDay = CAST(CAST(GETDATE() AS DATE) AS DATETIME)

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT TOP (@Limit)
                CAST(q.QuestionId AS VARCHAR(20)) AS Id, q.Code, JSON_QUERY(qv.PresentationJson) AS Presentation,
                q.Status, q.CreatedOn
            FROM Question q
            LEFT JOIN QuestionVersion qv ON qv.VersionId = q.CurrentVersionId
            WHERE q.IsDeleted = 0 AND q.FranchiseId = @FranchiseId AND q.CreatedOn >= @StartOfDay
            ORDER BY q.CreatedOn DESC
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 11: Single question for the edit page (getQuestionForEdit).
-- @json: {"QuestionId": <bigint>}.
if(@Mode = 11)
BEGIN
    SELECT @QuestionId = QuestionId FROM OPENJSON(@json) WITH (QuestionId BIGINT)

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT
                CAST(q.QuestionId AS VARCHAR(20)) AS QuestionId, q.Code, qt.Code AS TypeCode, qt.Name AS TypeName,
                q.Status, q.Difficulty, q.EstSolveSec, qv.VersionNo,
                JSON_QUERY(qv.PresentationJson) AS Presentation, JSON_QUERY(qv.AnswerJson) AS Answer,
                q.CreatedBy, q.CreatedOn, ql.LotNo,
                JSON_QUERY((
                    SELECT td4.Name AS DimensionName, t4.Name AS TagName
                    FROM QuestionTag qt4
                    JOIN Tag t4 ON t4.TagId = qt4.TagId
                    JOIN TagDimension td4 ON td4.DimensionId = t4.DimensionId
                    WHERE qt4.QuestionId = q.QuestionId AND qt4.IsDeleted = 0
                    FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS Tags
            FROM Question q
            JOIN QuestionType qt ON qt.QuestionTypeId = q.QuestionTypeId
            LEFT JOIN QuestionVersion qv ON qv.VersionId = q.CurrentVersionId
            LEFT JOIN QuestionLot ql ON ql.LotId = q.LotId
            WHERE q.QuestionId = @QuestionId AND q.IsDeleted = 0 AND q.FranchiseId = @FranchiseId
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 12: Mint a new question lot (createQuestionLot). @json: {}.
-- Generates LotNo directly (LOT-yyyyMMdd-XXXXXXXX) with a bounded retry
-- against the unique constraint, instead of the old catch-and-retry-in-TS
-- loop.
if(@Mode = 12)
BEGIN
    SET @LotNoAttempts = 0
    WHILE 1 = 1
    BEGIN
        SET @LotNo = 'LOT-' + FORMAT(GETDATE(), 'yyyyMMdd') + '-' + UPPER(CONVERT(VARCHAR(8), CRYPT_GEN_RANDOM(4), 2))
        IF NOT EXISTS (SELECT 1 FROM QuestionLot WHERE LotNo = @LotNo) BREAK
        SET @LotNoAttempts += 1
        IF @LotNoAttempts > 5 BREAK
    END
    IF EXISTS (SELECT 1 FROM QuestionLot WHERE LotNo = @LotNo)
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'Could not generate a unique lot number. Please try again.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    DELETE FROM @NewId
    INSERT INTO dbo.QuestionLot (LotNo, CreatedBy, FranchiseId)
    OUTPUT INSERTED.LotId INTO @NewId
    VALUES (@LotNo, @UserId, @FranchiseId)
    SELECT @LotId = Id FROM @NewId

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (SELECT CAST(@LotId AS VARCHAR(20)) AS LotId, @LotNo AS LotNo FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 13: Create questions in bulk (createQuestions). @json:
-- {"LotId": "<bigint string>" | null, "Questions": [{"Code": "<string>" |
-- "", "TypeCode": "<QuestionType.Code>", "Difficulty": <tinyint>,
-- "Status": <int>, "EstSolveSec": <smallint> | null, "PresentationJson":
-- "<json text, built by questions/schema.ts's buildContent() in TS>",
-- "AnswerJson": "<json text>", "SearchText": "<built by buildSearchText()>",
-- "Tags": [{"Key": "<dimension name>", "Value": "<tag name>"}]}]}.
-- Content validation (stem/options/marks/etc.) and building of
-- Presentation/AnswerJson/SearchText stay in TS (questions/schema.ts,
-- unchanged) — this mode only does DB-level checks (type exists, explicit
-- code uniqueness) and the writes: Question (RowVer, raw INSERT ... OUTPUT),
-- QuestionVersion (VersionNo 1), find-or-create TagDimension/Tag per
-- {Key,Value} + QuestionTag links, QuestionSearch, and a zeroed QuestionStat
-- row. ContentHash is computed here (SHA2_256 over PresentationJson + '|' +
-- AnswerJson, the same concatenation the old TS crypto.createHash('sha256')
-- used) instead of being passed from the client. A brand-new
-- TagDimension.Code is a SIMPLIFIED slug (common separators only, no full
-- regex strip) always suffixed with 4 random hex chars for guaranteed
-- uniqueness — not byte-identical to the old TS slugifyCode's
-- incrementing-suffix scheme, since Code is an internal id never shown in
-- the UI (dimensions display by Name). NOTE: this is the most complex mode
-- in this file (nested loops, dynamic find-or-create) — test against a real
-- DB before relying on it in production.
if(@Mode = 13)
BEGIN
    SELECT @LotIdText = LotId FROM OPENJSON(@json) WITH (LotId NVARCHAR(50))
    SET @HasLotFilter = CASE WHEN @LotIdText IS NOT NULL AND LTRIM(RTRIM(@LotIdText)) <> '' THEN 1 ELSE 0 END
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
    IF @Total > 200
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'Please submit 200 questions or fewer at a time.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
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
        VALUES (@NewQuestionId, 1, 'en', @CurPresentationJson, @CurAnswerJson, N'{"source":"question-bank-ui"}', @ContentHash, 'Initial version', @UserId, @FranchiseId)
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

-- Mode 14: Edit a question — always creates a new QuestionVersion and
-- repoints CurrentVersionId, never mutates one in place (updateQuestion).
-- @json: {"QuestionId": <bigint>, "TypeCode": "...", "Difficulty": <tinyint>,
-- "EstSolveSec": <smallint> | null, "PresentationJson": "...",
-- "AnswerJson": "...", "SearchText": "...", "ChangeNote": "..." | null,
-- "Tags": [{"Key","Value"}]}. Status is deliberately left untouched here —
-- see Mode 15 for that. Same find-or-create tag resolution as Mode 13
-- (duplicated rather than shared — see that mode's header).
if(@Mode = 14)
BEGIN
    SELECT
        @QuestionId = QuestionId, @CurTypeCode = TypeCode, @CurDifficulty = Difficulty, @CurEstSolveSec = EstSolveSec,
        @CurPresentationJson = PresentationJson, @CurAnswerJson = AnswerJson, @CurSearchText = SearchText, @ChangeNote = ChangeNote
    FROM OPENJSON(@json) WITH (
        QuestionId BIGINT, TypeCode VARCHAR(50), Difficulty TINYINT, EstSolveSec SMALLINT,
        PresentationJson NVARCHAR(MAX), AnswerJson NVARCHAR(MAX), SearchText NVARCHAR(MAX), ChangeNote NVARCHAR(400)
    )
    SELECT @CurTagsJson = Tags FROM OPENJSON(@json) WITH (Tags NVARCHAR(MAX) AS JSON)

    IF NOT EXISTS (SELECT 1 FROM Question WHERE QuestionId = @QuestionId AND IsDeleted = 0 AND FranchiseId = @FranchiseId)
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Question not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    SELECT @CurTypeId = QuestionTypeId FROM QuestionType WHERE Code = @CurTypeCode AND IsDeleted = 0
    IF @CurTypeId IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'Unknown question type.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SELECT @NextVersionNo = ISNULL(MAX(VersionNo), 0) + 1 FROM QuestionVersion WHERE QuestionId = @QuestionId
    SET @ContentHash = LOWER(CONVERT(CHAR(64), HASHBYTES('SHA2_256', @CurPresentationJson + '|' + @CurAnswerJson), 2))

    DELETE FROM @NewId
    INSERT INTO dbo.QuestionVersion (QuestionId, VersionNo, Locale, PresentationJson, AnswerJson, MetaJson, ContentHash, ChangeNote, CreatedBy, FranchiseId)
    OUTPUT INSERTED.VersionId INTO @NewId
    VALUES (@QuestionId, @NextVersionNo, 'en', @CurPresentationJson, @CurAnswerJson, N'{"source":"question-bank-ui"}', @ContentHash, ISNULL(NULLIF(LTRIM(RTRIM(@ChangeNote)), ''), 'Edited via question bank UI'), @UserId, @FranchiseId)
    SELECT @NewVersionId = Id FROM @NewId

    UPDATE dbo.Question
    SET QuestionTypeId = @CurTypeId, Difficulty = @CurDifficulty, EstSolveSec = @CurEstSolveSec,
        CurrentVersionId = @NewVersionId, ModifiedBy = @UserId, ModifiedOn = GETDATE()
    WHERE QuestionId = @QuestionId

    DELETE FROM QuestionTag WHERE QuestionId = @QuestionId

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

        IF NOT EXISTS (SELECT 1 FROM QuestionTag WHERE QuestionId = @QuestionId AND TagId = @TagId)
            INSERT INTO dbo.QuestionTag (TagId, QuestionId, CreatedBy, FranchiseId) VALUES (@TagId, @QuestionId, @UserId, @FranchiseId)

        SET @TagRowNo += 1
    END

    IF EXISTS (SELECT 1 FROM QuestionSearch WHERE QuestionId = @QuestionId AND Locale = 'en')
        UPDATE dbo.QuestionSearch SET SearchText = @CurSearchText, ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE QuestionId = @QuestionId AND Locale = 'en'
    ELSE
        INSERT INTO dbo.QuestionSearch (QuestionId, Locale, SearchText, CreatedBy, FranchiseId) VALUES (@QuestionId, 'en', @CurSearchText, @UserId, @FranchiseId)

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

-- Mode 15: Status transition, logged as a ReviewAction
-- (changeQuestionStatus). @json: {"QuestionId": <bigint>, "ToStatus": <int>,
-- "Comment": "..." | null}.
if(@Mode = 15)
BEGIN
    SELECT @QuestionId = QuestionId, @ToStatus = ToStatus, @Comment = Comment
    FROM OPENJSON(@json) WITH (QuestionId BIGINT, ToStatus INT, Comment NVARCHAR(MAX))

    SELECT @ExistingStatus = Status, @ExistingVersionId = CurrentVersionId
    FROM Question WHERE QuestionId = @QuestionId AND IsDeleted = 0 AND FranchiseId = @FranchiseId

    IF @ExistingStatus IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Question not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF @ExistingStatus = @ToStatus
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'Question is already in that status.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SELECT @ApprovedStatus = TRY_CAST(ServiceValue AS INT) FROM _InternalService WHERE Category = 'QUESTION_STATUS' AND ServiceLabel = 'APPROVED' AND IsActive = 1

    IF @ToStatus = @ApprovedStatus
        UPDATE dbo.Question SET Status = @ToStatus, ApprovedBy = @UserId, ApprovedOn = GETDATE(), ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE QuestionId = @QuestionId
    ELSE
        UPDATE dbo.Question SET Status = @ToStatus, ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE QuestionId = @QuestionId

    IF @ExistingVersionId IS NOT NULL
        INSERT INTO dbo.ReviewAction (QuestionId, VersionId, FromStatus, ToStatus, Comment, CreatedBy, FranchiseId)
        VALUES (@QuestionId, @ExistingVersionId, @ExistingStatus, @ToStatus, NULLIF(LTRIM(RTRIM(@Comment)), ''), @UserId, @FranchiseId)

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

-- Mode 16: Soft-delete a question (deleteQuestion). @json: {"QuestionId": <bigint>}.
if(@Mode = 16)
BEGIN
    SELECT @QuestionId = QuestionId FROM OPENJSON(@json) WITH (QuestionId BIGINT)

    IF NOT EXISTS (SELECT 1 FROM Question WHERE QuestionId = @QuestionId AND IsDeleted = 0 AND FranchiseId = @FranchiseId)
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Question not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    UPDATE dbo.Question SET IsDeleted = 1, ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE QuestionId = @QuestionId

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

-- Mode 17: Blueprint template list (listBlueprintTemplates). @json: {}.
-- Master franchise (FranchiseId = 1 — MASTER_FRANCHISE_ID in
-- shared/constants.ts) only ever sees its own templates; every other
-- franchise sees its own PLUS master's (read-only — IsOwner tells the UI
-- which).
if(@Mode = 17)
BEGIN
    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT
                CAST(TemplateId AS VARCHAR(20)) AS TemplateId, Name, FilterJson,
                CAST(CASE WHEN FranchiseId = @FranchiseId THEN 1 ELSE 0 END AS BIT) AS IsOwner
            FROM BlueprintTemplate
            WHERE IsDeleted = 0 AND IsActive = 1
              AND (
                    (@FranchiseId = 1 AND FranchiseId = 1)
                    OR (@FranchiseId <> 1 AND (FranchiseId = @FranchiseId OR FranchiseId = 1))
                  )
            ORDER BY CreatedOn DESC
            FOR JSON PATH, INCLUDE_NULL_VALUES
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 18: One template for the edit page (getBlueprintTemplateForEdit).
-- @json: {"TemplateId": <bigint>}. Strict ownership only — no master-
-- franchise fallback, unlike Mode 17.
if(@Mode = 18)
BEGIN
    SELECT @TemplateId = TemplateId FROM OPENJSON(@json) WITH (TemplateId BIGINT)

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT CAST(TemplateId AS VARCHAR(20)) AS TemplateId, Name, FilterJson
            FROM BlueprintTemplate
            WHERE TemplateId = @TemplateId AND IsDeleted = 0 AND FranchiseId = @FranchiseId
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 19: Test-kind picker options (listTestKinds). @json: {}.
if(@Mode = 19)
BEGIN
    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (SELECT Code, Name FROM TestKind WHERE IsDeleted = 0 ORDER BY TestKindId FOR JSON PATH, INCLUDE_NULL_VALUES) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 20: One exam's read-only detail view (getMockTestForEdit). @json:
-- {"MockTestId": <bigint>}. Returns three raw slices (MockTest,
-- PaperSections, TestQuestions) rather than pre-grouping server-side — the
-- SelectionPolicyJson recipe parsing and per-section grouping stays in TS
-- (exams/data.ts), unchanged from the old Prisma version, to keep that
-- already-correct stitching logic in one place. NULL response (statuscode
-- 200) means "not found" — TS treats that the same as Prisma's null.
if(@Mode = 20)
BEGIN
    SELECT @MockTestId = MockTestId FROM OPENJSON(@json) WITH (MockTestId BIGINT)

    SELECT @PaperId = mt.PaperId FROM MockTest mt WHERE mt.MockTestId = @MockTestId AND mt.IsDeleted = 0 AND mt.FranchiseId = @FranchiseId

    IF @PaperId IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 200 AS statuscode, NULL AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT
                JSON_QUERY((
                    SELECT
                        CAST(mt.MockTestId AS VARCHAR(20)) AS MockTestId, mt.Code, mt.Name, mt.Status,
                        (SELECT TOP 1 ServiceDisplayLabel FROM _InternalService WHERE Category = 'EXAM_STATUS' AND TRY_CAST(ServiceValue AS INT) = mt.Status AND IsActive = 1) AS StatusLabel,
                        ep.Name AS PaperName, CAST(ep.TotalMarks AS VARCHAR(20)) AS TotalMarks, ep.DurationMin,
                        mt.SelectionPolicyJson
                    FROM MockTest mt JOIN ExamPaper ep ON ep.PaperId = mt.PaperId
                    WHERE mt.MockTestId = @MockTestId
                    FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
                )) AS MockTest,
                JSON_QUERY((
                    SELECT CAST(SectionId AS VARCHAR(20)) AS SectionId, RulesJson
                    FROM PaperSection WHERE PaperId = @PaperId
                    FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS PaperSections,
                JSON_QUERY((
                    SELECT
                        CAST(tq.SectionId AS VARCHAR(20)) AS SectionId, tq.SeqNo,
                        CAST(q.QuestionId AS VARCHAR(20)) AS QuestionId, q.Code, qt.Name AS TypeName,
                        q.Difficulty, q.Status, ql.LotNo,
                        CAST(tq.EffectiveMarks AS VARCHAR(20)) AS Marks, CAST(tq.EffectiveNegative AS VARCHAR(20)) AS Negative,
                        JSON_QUERY(qv.PresentationJson) AS Presentation,
                        JSON_QUERY((
                            SELECT t5.Name FROM QuestionTag qt5 JOIN Tag t5 ON t5.TagId = qt5.TagId
                            WHERE qt5.QuestionId = q.QuestionId AND qt5.IsDeleted = 0 FOR JSON PATH, INCLUDE_NULL_VALUES
                        )) AS TagNames
                    FROM TestQuestion tq
                    JOIN Question q ON q.QuestionId = tq.QuestionId
                    JOIN QuestionType qt ON qt.QuestionTypeId = q.QuestionTypeId
                    LEFT JOIN QuestionVersion qv ON qv.VersionId = q.CurrentVersionId
                    LEFT JOIN QuestionLot ql ON ql.LotId = q.LotId
                    WHERE tq.MockTestId = @MockTestId AND tq.IsDeleted = 0
                    ORDER BY tq.SectionId, tq.SeqNo
                    FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS TestQuestions
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 21: Edit-page draft shape (getMockTestDraftForEdit). @json:
-- {"MockTestId": <bigint>}. Reshaping into TemplateDraft
-- (buildTemplateDraftFromExam) stays in TS.
if(@Mode = 21)
BEGIN
    SELECT @MockTestId = MockTestId FROM OPENJSON(@json) WITH (MockTestId BIGINT)

    IF NOT EXISTS (SELECT 1 FROM MockTest WHERE MockTestId = @MockTestId AND IsDeleted = 0 AND FranchiseId = @FranchiseId)
    BEGIN
        SET @output = (SELECT 1 AS ID, 200 AS statuscode, NULL AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (
            SELECT
                CAST(mt.MockTestId AS VARCHAR(20)) AS MockTestId, mt.Status, mt.Name AS ExamName,
                tk.Code AS TestKindCode, tk.Name AS TestKindName, ep.DurationMin,
                ISNULL(ms.Name, N'Standard Marking') AS MarkingSchemeName, ISNULL(mt.Instructions, N'') AS Instructions,
                JSON_QUERY((
                    SELECT CAST(SectionId AS VARCHAR(20)) AS SectionId, Name, RulesJson
                    FROM PaperSection WHERE PaperId = mt.PaperId AND IsDeleted = 0 ORDER BY SeqNo FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS Sections,
                JSON_QUERY((
                    SELECT CAST(SectionId AS VARCHAR(20)) AS SectionId, COUNT(*) AS Picked
                    FROM TestQuestion WHERE MockTestId = mt.MockTestId AND IsDeleted = 0
                    GROUP BY SectionId FOR JSON PATH, INCLUDE_NULL_VALUES
                )) AS PickedBySection
            FROM MockTest mt
            JOIN ExamPaper ep ON ep.PaperId = mt.PaperId
            JOIN TestKind tk ON tk.TestKindId = mt.TestKindId
            LEFT JOIN MarkingScheme ms ON ms.SchemeId = ep.DefaultSchemeId
            WHERE mt.MockTestId = @MockTestId
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        ) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 22: Create an exam draft from a shape (createMockTestFromDraft +
-- materializeMockTest). @json: {"ExamFilterJson": "<JSON text of
-- BlueprintFilterJson, built by exams/schema.ts's buildFilterJsonFromDraft()
-- in TS>", "PaperCode": "<pre-generated via codeSlug() + random hex, in
-- TS>", "TemplateName": "<string>" | null, "TemplateFilterJson": "<JSON
-- text>" | null, "InitialStatus": <int>, "Instructions": "<string>"}.
-- Draft validation (validateShapeDraft) and building of FilterJson/PaperCode
-- stay in TS, unchanged — this mode only does the writes: optional
-- BlueprintTemplate save, find-or-create ExamBody/Program/Stage (the fixed
-- FALLBACK_CATALOG chain from exams/constants.ts — 'Templates'/'GENERAL' —
-- hardcoded here; keep in sync if that TS file ever changes) and TestKind,
-- fresh MarkingScheme + ExamPaper + PaperSection(s) (never shared across
-- exams, even from the same template — see materializeMockTest's original
-- comment) + MockTest. SelectionPolicyJson (the MockTestRecipe snapshot) is
-- built here from the just-inserted PaperSection rows, not passed in.
if(@Mode = 22)
BEGIN
    SELECT
        @ExamFilterJson = ExamFilterJson, @PaperCode = PaperCode, @TemplateName = TemplateName,
        @InitialStatus = InitialStatus, @Instructions = Instructions
    FROM OPENJSON(@json) WITH (
        ExamFilterJson NVARCHAR(MAX), PaperCode VARCHAR(30), TemplateName NVARCHAR(200),
        InitialStatus INT, Instructions NVARCHAR(MAX)
    )
    SELECT @TemplateFilterJson = TemplateFilterJson FROM OPENJSON(@json) WITH (TemplateFilterJson NVARCHAR(MAX))

    SET @TemplateIdStr = NULL
    IF @TemplateName IS NOT NULL AND LTRIM(RTRIM(@TemplateName)) <> ''
    BEGIN
        DELETE FROM @NewId
        INSERT INTO dbo.BlueprintTemplate (Name, FilterJson, CreatedBy, FranchiseId)
        OUTPUT INSERTED.TemplateId INTO @NewId
        VALUES (LTRIM(RTRIM(@TemplateName)), @TemplateFilterJson, @UserId, @FranchiseId)
        SELECT @TemplateIdStr = CAST(Id AS VARCHAR(20)) FROM @NewId
    END

    -- Find-or-create ExamBody/Program/Stage (FALLBACK_CATALOG).
    SELECT @BodyId = BodyId FROM ExamBody WHERE Name = N'Templates' AND IsDeleted = 0
    IF @BodyId IS NULL
    BEGIN
        INSERT INTO dbo.ExamBody (Name, CreatedBy, FranchiseId) VALUES (N'Templates', @UserId, @FranchiseId)
        SET @BodyId = SCOPE_IDENTITY()
    END
    SELECT @ProgramId = ProgramId FROM ExamProgram WHERE BodyId = @BodyId AND Code = 'GENERAL' AND IsDeleted = 0
    IF @ProgramId IS NULL
    BEGIN
        INSERT INTO dbo.ExamProgram (BodyId, Code, Name, CreatedBy, FranchiseId) VALUES (@BodyId, 'GENERAL', N'General', @UserId, @FranchiseId)
        SET @ProgramId = SCOPE_IDENTITY()
    END
    SELECT @StageId = StageId FROM ExamStage WHERE ProgramId = @ProgramId AND Code = 'GENERAL' AND IsDeleted = 0
    IF @StageId IS NULL
    BEGIN
        INSERT INTO dbo.ExamStage (ProgramId, Code, Name, SeqNo, CreatedBy, FranchiseId) VALUES (@ProgramId, 'GENERAL', N'General', 1, @UserId, @FranchiseId)
        SET @StageId = SCOPE_IDENTITY()
    END

    -- Find-or-create TestKind.
    SET @TestKindCode = ISNULL(JSON_VALUE(@ExamFilterJson, '$.testKind.code'), 'mock_test')
    SET @TestKindName = ISNULL(JSON_VALUE(@ExamFilterJson, '$.testKind.name'), 'Mock Test')
    SELECT @TestKindId = TestKindId FROM TestKind WHERE Code = @TestKindCode AND IsDeleted = 0
    IF @TestKindId IS NULL
    BEGIN
        SELECT @TestKindId = ISNULL(MAX(TestKindId), 0) + 1 FROM TestKind
        INSERT INTO dbo.TestKind (TestKindId, Code, Name, CreatedBy, FranchiseId) VALUES (@TestKindId, @TestKindCode, @TestKindName, @UserId, @FranchiseId)
    END

    SELECT @PublishedStatus = TRY_CAST(ServiceValue AS INT) FROM _InternalService WHERE Category = 'EXAM_STATUS' AND ServiceLabel = 'PUBLISHED' AND IsActive = 1

    SET @MsName = JSON_VALUE(@ExamFilterJson, '$.markingScheme.Name')
    SET @MsRulesJson = JSON_QUERY(@ExamFilterJson, '$.markingScheme.RulesJson')
    DELETE FROM @NewId
    INSERT INTO dbo.MarkingScheme (Name, RulesJson, CreatedBy, FranchiseId)
    OUTPUT INSERTED.SchemeId INTO @NewId
    VALUES (@MsName, @MsRulesJson, @UserId, @FranchiseId)
    SELECT @SchemeId = Id FROM @NewId

    SET @PaperName = JSON_VALUE(@ExamFilterJson, '$.examPaper.Name')
    SET @PaperTotalMarks = TRY_CAST(JSON_VALUE(@ExamFilterJson, '$.examPaper.TotalMarks') AS DECIMAL(6,2))
    SET @PaperDurationMin = TRY_CAST(JSON_VALUE(@ExamFilterJson, '$.examPaper.DurationMin') AS INT)
    SET @PaperIsQualifying = CASE WHEN JSON_VALUE(@ExamFilterJson, '$.examPaper.IsQualifying') = 'true' THEN 1 ELSE 0 END
    SET @PaperDefaultLocale = ISNULL(JSON_VALUE(@ExamFilterJson, '$.examPaper.DefaultLocale'), 'en')

    DELETE FROM @NewId
    INSERT INTO dbo.ExamPaper (StageId, Code, Name, TotalMarks, DurationMin, IsQualifying, DefaultSchemeId, DefaultLocale, CreatedBy, FranchiseId)
    OUTPUT INSERTED.PaperId INTO @NewId
    VALUES (@StageId, @PaperCode, @PaperName, @PaperTotalMarks, @PaperDurationMin, @PaperIsQualifying, @SchemeId, @PaperDefaultLocale, @UserId, @FranchiseId)
    SELECT @PaperId = Id FROM @NewId

    DELETE FROM @SectionInput
    INSERT INTO @SectionInput (SeqNo, Name, RulesJson)
    SELECT SeqNo, Name, RulesJson
    FROM OPENJSON(@ExamFilterJson, '$.paperSections') WITH (SeqNo INT, Name NVARCHAR(100), RulesJson NVARCHAR(MAX) AS JSON)

    SELECT @RowNo = MIN(RowNo), @MaxRowNo = MAX(RowNo) FROM @SectionInput
    WHILE @RowNo IS NOT NULL AND @RowNo <= @MaxRowNo
    BEGIN
        SELECT @SecName = Name, @SecSeqNo = SeqNo, @SecRulesJson = RulesJson FROM @SectionInput WHERE RowNo = @RowNo
        INSERT INTO dbo.PaperSection (PaperId, Name, SeqNo, RulesJson, CreatedBy, FranchiseId)
        VALUES (@PaperId, @SecName, @SecSeqNo, @SecRulesJson, @UserId, @FranchiseId)
        SET @RowNo += 1
    END

    SET @SelectionPolicyJson = (
        SELECT 1 AS version, @TemplateIdStr AS templateId,
            JSON_QUERY((
                SELECT CAST(SectionId AS VARCHAR(20)) AS sectionId, Name AS name,
                    JSON_VALUE(RulesJson, '$.questionType') AS questionType,
                    TRY_CAST(JSON_VALUE(RulesJson, '$.questions') AS INT) AS pool,
                    TRY_CAST(JSON_VALUE(RulesJson, '$.mandatory') AS INT) AS mandatory
                FROM PaperSection WHERE PaperId = @PaperId
                ORDER BY SeqNo FOR JSON PATH, INCLUDE_NULL_VALUES
            )) AS sections
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    )

    SET @MtCodeAttempts = 0
    WHILE 1 = 1
    BEGIN
        SET @MtCode = 'MT-' + UPPER(CONVERT(VARCHAR(8), CRYPT_GEN_RANDOM(4), 2))
        IF NOT EXISTS (SELECT 1 FROM MockTest WHERE Code = @MtCode) BREAK
        SET @MtCodeAttempts += 1
        IF @MtCodeAttempts > 5 BREAK
    END

    -- IsPersonalized is always 0 here — the only other MockTest-creation
    -- path is the student portal's Mode 7 (personalized mock generation).
    DELETE FROM @NewId
    INSERT INTO dbo.MockTest (Code, PaperId, TestKindId, Name, Instructions, IsPersonalized, Status, PublishedOn, SelectionPolicyJson, CreatedBy, FranchiseId)
    OUTPUT INSERTED.MockTestId INTO @NewId
    VALUES (
        @MtCode, @PaperId, @TestKindId, @PaperName, NULLIF(LTRIM(RTRIM(@Instructions)), ''), 0, @InitialStatus,
        CASE WHEN @InitialStatus = @PublishedStatus THEN GETDATE() ELSE NULL END,
        @SelectionPolicyJson, @UserId, @FranchiseId
    )
    SELECT @MockTestId = Id FROM @NewId

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (SELECT CAST(@MockTestId AS VARCHAR(20)) AS MockTestId, @TemplateIdStr AS TemplateId FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 23: Edit an exam's shape in place (updateMockTestFromDraft). @json:
-- {"MockTestId": <bigint>, "ExamName": "...", "TestKindCode": "...",
-- "TestKindName": "...", "MarkingSchemeRulesJson": {...},
-- "MarkingSchemeName": "...", "TotalMarks": <decimal>, "DurationMin": <int>,
-- "Instructions": "...", "OverCapacityResolution": "trim" | "manual",
-- "Sections": [{"SectionId": "<bigint string>" | null, "Name": "...",
-- "RulesJson": {questionType,questions,mandatory,marks,negative}}],
-- "TemplateName": "..." | null, "TemplateFilterJson": "<JSON text>" | null}.
-- Only allowed while the exam is Draft. Same two-pass negative-placeholder
-- reorder trick the old Prisma version used for PaperSection.SeqNo (the
-- unique (PaperId, SeqNo) constraint is checked per-statement, not deferred
-- to commit). A newly-saved template (TemplateName) does NOT become this
-- exam's own recipe.templateId — the recipe keeps whatever templateId this
-- exam already had (see the old TS comment on `priorTemplateId`); the new
-- template's id is only returned in the response. NOTE: this is the second
-- most complex mode in this file after Mode 13 — test against a real DB
-- before relying on it in production.
if(@Mode = 23)
BEGIN
    SELECT
        @MockTestId = MockTestId, @ExamName = ExamName, @TestKindCode = TestKindCode, @TestKindName = TestKindName,
        @MarkingSchemeName = MarkingSchemeName, @TotalMarks = TotalMarks, @DurationMin = DurationMin,
        @Instructions = Instructions, @OverCapacityResolution = OverCapacityResolution, @TemplateName = TemplateName
    FROM OPENJSON(@json) WITH (
        MockTestId BIGINT, ExamName NVARCHAR(200), TestKindCode VARCHAR(40), TestKindName NVARCHAR(100),
        MarkingSchemeName NVARCHAR(150), TotalMarks DECIMAL(6,2), DurationMin INT, Instructions NVARCHAR(MAX),
        OverCapacityResolution VARCHAR(10), TemplateName NVARCHAR(200)
    )
    SELECT @MsRulesJson = MarkingSchemeRulesJson, @TemplateFilterJson = TemplateFilterJson
    FROM OPENJSON(@json) WITH (MarkingSchemeRulesJson NVARCHAR(MAX) AS JSON, TemplateFilterJson NVARCHAR(MAX))

    SELECT @PaperId = PaperId, @DraftStatus2 = Status FROM MockTest
    WHERE MockTestId = @MockTestId AND IsDeleted = 0 AND FranchiseId = @FranchiseId
    IF @PaperId IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Exam not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    SELECT @DraftStatus = TRY_CAST(ServiceValue AS INT) FROM _InternalService WHERE Category = 'EXAM_STATUS' AND ServiceLabel = 'DRAFT' AND IsActive = 1
    IF @DraftStatus2 <> @DraftStatus
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'Only draft exams can be edited.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SELECT @PriorTemplateId = JSON_VALUE(SelectionPolicyJson, '$.templateId') FROM MockTest WHERE MockTestId = @MockTestId

    SET @TemplateIdStr = NULL
    IF @TemplateName IS NOT NULL AND LTRIM(RTRIM(@TemplateName)) <> ''
    BEGIN
        DELETE FROM @NewId
        INSERT INTO dbo.BlueprintTemplate (Name, FilterJson, CreatedBy, FranchiseId)
        OUTPUT INSERTED.TemplateId INTO @NewId
        VALUES (LTRIM(RTRIM(@TemplateName)), @TemplateFilterJson, @UserId, @FranchiseId)
        SELECT @TemplateIdStr = CAST(Id AS VARCHAR(20)) FROM @NewId
    END

    SELECT @TestKindId = TestKindId FROM TestKind WHERE Code = @TestKindCode AND IsDeleted = 0
    IF @TestKindId IS NULL
    BEGIN
        SELECT @TestKindId = ISNULL(MAX(TestKindId), 0) + 1 FROM TestKind
        INSERT INTO dbo.TestKind (TestKindId, Code, Name, CreatedBy, FranchiseId) VALUES (@TestKindId, @TestKindCode, @TestKindName, @UserId, @FranchiseId)
    END

    UPDATE dbo.MarkingScheme
    SET Name = @MarkingSchemeName, RulesJson = @MsRulesJson, ModifiedBy = @UserId, ModifiedOn = GETDATE()
    WHERE SchemeId = (SELECT DefaultSchemeId FROM ExamPaper WHERE PaperId = @PaperId)

    UPDATE dbo.ExamPaper
    SET Name = @ExamName, TotalMarks = @TotalMarks, DurationMin = @DurationMin, ModifiedBy = @UserId, ModifiedOn = GETDATE()
    WHERE PaperId = @PaperId

    DELETE FROM @CurSections
    INSERT INTO @CurSections (SectionId, SeqNo, Kept)
    SELECT SectionId, SeqNo, 0 FROM PaperSection WHERE PaperId = @PaperId AND IsDeleted = 0

    UPDATE PaperSection SET SeqNo = -SeqNo - 100000 WHERE SectionId IN (SELECT SectionId FROM @CurSections)

    -- SeqNo comes from the JSON array's own index (j.[key]), not row
    -- arrival order — OPENJSON's WITH-clause projection doesn't guarantee
    -- its result set order matches array order without this.
    DELETE FROM @SectionInput
    INSERT INTO @SectionInput (SectionIdText, SeqNo, Name, RulesJson)
    SELECT s.SectionId, CAST(j.[key] AS INT) + 1, s.Name, s.RulesJson
    FROM OPENJSON(@json, '$.Sections') j
    CROSS APPLY OPENJSON(j.value) WITH (SectionId VARCHAR(20) '$.SectionId', Name NVARCHAR(100) '$.Name', RulesJson NVARCHAR(MAX) '$.RulesJson' AS JSON) s

    SELECT @RowNo = MIN(RowNo), @MaxRowNo = MAX(RowNo) FROM @SectionInput
    WHILE @RowNo IS NOT NULL AND @RowNo <= @MaxRowNo
    BEGIN
        SELECT @SecSectionIdText = SectionIdText, @SecSeqNo = RowNo, @SecName = Name, @SecRulesJson = RulesJson FROM @SectionInput WHERE RowNo = @RowNo
        SET @SecSectionId = TRY_CAST(@SecSectionIdText AS BIGINT)
        SET @MatchesExisting = CASE WHEN @SecSectionId IS NOT NULL AND EXISTS (SELECT 1 FROM @CurSections WHERE SectionId = @SecSectionId) THEN 1 ELSE 0 END

        IF @MatchesExisting = 1
        BEGIN
            UPDATE dbo.PaperSection
            SET Name = @SecName, SeqNo = @SecSeqNo, RulesJson = @SecRulesJson, ModifiedBy = @UserId, ModifiedOn = GETDATE()
            WHERE SectionId = @SecSectionId

            UPDATE @CurSections SET Kept = 1 WHERE SectionId = @SecSectionId

            IF @OverCapacityResolution = 'trim'
            BEGIN
                SET @NewPool = TRY_CAST(JSON_VALUE(@SecRulesJson, '$.questions') AS INT)
                UPDATE TestQuestion SET IsDeleted = 1, ModifiedBy = @UserId, ModifiedOn = GETDATE()
                WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId AND IsDeleted = 0
                  AND SeqNo IN (
                    SELECT SeqNo FROM (
                        SELECT SeqNo, ROW_NUMBER() OVER (ORDER BY SeqNo ASC) AS rn
                        FROM TestQuestion WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId AND IsDeleted = 0
                    ) x WHERE x.rn > @NewPool
                  )
            END
        END
        ELSE
        BEGIN
            INSERT INTO dbo.PaperSection (PaperId, Name, SeqNo, RulesJson, CreatedBy, FranchiseId)
            VALUES (@PaperId, @SecName, @SecSeqNo, @SecRulesJson, @UserId, @FranchiseId)
        END

        SET @RowNo += 1
    END

    -- Sections the admin removed in this edit — soft-delete. Their negative
    -- placeholder SeqNo is left as-is; it can never collide with a future
    -- positive assignment.
    UPDATE PaperSection SET IsDeleted = 1, ModifiedBy = @UserId, ModifiedOn = GETDATE()
    WHERE SectionId IN (SELECT SectionId FROM @CurSections WHERE Kept = 0)

    SET @SelectionPolicyJson = (
        SELECT 1 AS version, @PriorTemplateId AS templateId,
            JSON_QUERY((
                SELECT CAST(SectionId AS VARCHAR(20)) AS sectionId, Name AS name,
                    JSON_VALUE(RulesJson, '$.questionType') AS questionType,
                    TRY_CAST(JSON_VALUE(RulesJson, '$.questions') AS INT) AS pool,
                    TRY_CAST(JSON_VALUE(RulesJson, '$.mandatory') AS INT) AS mandatory
                FROM PaperSection WHERE PaperId = @PaperId AND IsDeleted = 0
                ORDER BY SeqNo FOR JSON PATH, INCLUDE_NULL_VALUES
            )) AS sections
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    )

    UPDATE dbo.MockTest
    SET Name = @ExamName, TestKindId = @TestKindId, Instructions = NULLIF(LTRIM(RTRIM(@Instructions)), ''),
        SelectionPolicyJson = @SelectionPolicyJson, ModifiedBy = @UserId, ModifiedOn = GETDATE()
    WHERE MockTestId = @MockTestId

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (SELECT CAST(@MockTestId AS VARCHAR(20)) AS MockTestId, @TemplateIdStr AS TemplateId FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 24: Direct status change — Draft/Published/Archived
-- (changeMockTestStatus). @json: {"MockTestId": <bigint>, "ToStatus": <int>}.
-- Blocks publishing when any recipe section is over its own pool (picked >
-- pool), same guard the old TS had, using MockTest.SelectionPolicyJson.
if(@Mode = 24)
BEGIN
    SELECT @MockTestId = MockTestId, @ToStatus2 = ToStatus FROM OPENJSON(@json) WITH (MockTestId BIGINT, ToStatus INT)

    SELECT @SelectionPolicyJson = SelectionPolicyJson, @ExistingStatus = Status
    FROM MockTest WHERE MockTestId = @MockTestId AND IsDeleted = 0 AND FranchiseId = @FranchiseId
    IF @ExistingStatus IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Exam not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF @ExistingStatus = @ToStatus2
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'Exam is already in that status.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SELECT @PublishedStatus = TRY_CAST(ServiceValue AS INT) FROM _InternalService WHERE Category = 'EXAM_STATUS' AND ServiceLabel = 'PUBLISHED' AND IsActive = 1

    IF @ToStatus2 = @PublishedStatus AND EXISTS (
        SELECT 1
        FROM OPENJSON(@SelectionPolicyJson, '$.sections') WITH (sectionId VARCHAR(20), pool INT) rs
        CROSS APPLY (
            SELECT COUNT(*) AS Picked FROM TestQuestion
            WHERE MockTestId = @MockTestId AND SectionId = TRY_CAST(rs.sectionId AS BIGINT) AND IsDeleted = 0
        ) p
        WHERE p.Picked > rs.pool
    )
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'Cannot publish: one or more sections are over capacity. Remove the extra question(s) on the question picker page first.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    IF @ToStatus2 = @PublishedStatus
        UPDATE dbo.MockTest SET Status = @ToStatus2, PublishedOn = GETDATE(), ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE MockTestId = @MockTestId
    ELSE
        UPDATE dbo.MockTest SET Status = @ToStatus2, ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE MockTestId = @MockTestId

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

-- Mode 25: Soft-delete an exam (deleteMockTest). @json: {"MockTestId": <bigint>}.
if(@Mode = 25)
BEGIN
    SELECT @MockTestId = MockTestId FROM OPENJSON(@json) WITH (MockTestId BIGINT)

    IF NOT EXISTS (SELECT 1 FROM MockTest WHERE MockTestId = @MockTestId AND IsDeleted = 0 AND FranchiseId = @FranchiseId)
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Exam not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    UPDATE dbo.MockTest SET IsDeleted = 1, ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE MockTestId = @MockTestId

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

-- Mode 26: Replace an exam's Package links (updateMockTestPackages). @json:
-- {"MockTestId": <bigint>, "PackageIds": "<csv bigint>"}. Soft-delete only,
-- matched by (MockTestId, PackageId) — an unchecked package gets IsDeleted=1,
-- a re-checked one reactivates its existing row, only a never-linked one
-- gets a brand-new row.
if(@Mode = 26)
BEGIN
    SELECT @MockTestId = MockTestId, @PackagesCsv = PackageIds FROM OPENJSON(@json) WITH (MockTestId BIGINT, PackageIds NVARCHAR(MAX))

    IF NOT EXISTS (SELECT 1 FROM MockTest WHERE MockTestId = @MockTestId AND IsDeleted = 0 AND FranchiseId = @FranchiseId)
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Exam not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    UPDATE mtp
    SET IsDeleted = CASE WHEN TRY_CAST(mtp.PackageId AS VARCHAR(20)) IN (SELECT value FROM STRING_SPLIT(ISNULL(@PackagesCsv, ''), ',')) THEN 0 ELSE 1 END,
        ModifiedBy = @UserId, ModifiedOn = GETDATE()
    FROM MockTestPackage mtp
    WHERE mtp.MockTestId = @MockTestId
      AND mtp.IsDeleted <> CASE WHEN CAST(mtp.PackageId AS VARCHAR(20)) IN (SELECT value FROM STRING_SPLIT(ISNULL(@PackagesCsv, ''), ',')) THEN 0 ELSE 1 END

    INSERT INTO dbo.MockTestPackage (MockTestId, PackageId, CreatedBy, FranchiseId)
    SELECT @MockTestId, TRY_CAST(value AS BIGINT), @UserId, @FranchiseId
    FROM STRING_SPLIT(ISNULL(@PackagesCsv, ''), ',')
    WHERE TRY_CAST(value AS BIGINT) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM MockTestPackage mtp2 WHERE mtp2.MockTestId = @MockTestId AND mtp2.PackageId = TRY_CAST(value AS BIGINT))

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

-- Mode 27: Save a new reusable BlueprintTemplate
-- (createBlueprintTemplate — the standalone template designer page, distinct
-- from Modes 22/23's inline "save as template" option). @json:
-- {"Name": "...", "FilterJson": "<JSON text>"}.
if(@Mode = 27)
BEGIN
    SELECT @TemplateName = Name, @TemplateFilterJson = FilterJson FROM OPENJSON(@json) WITH (Name NVARCHAR(200), FilterJson NVARCHAR(MAX))

    DELETE FROM @NewId
    INSERT INTO dbo.BlueprintTemplate (Name, FilterJson, CreatedBy, FranchiseId)
    OUTPUT INSERTED.TemplateId INTO @NewId
    VALUES (LTRIM(RTRIM(@TemplateName)), @TemplateFilterJson, @UserId, @FranchiseId)
    SELECT @TemplateIdStr = CAST(Id AS VARCHAR(20)) FROM @NewId

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (SELECT @TemplateIdStr AS TemplateId FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 28: Overwrite a template's Name/FilterJson in place
-- (updateBlueprintTemplate). @json: {"TemplateId": <bigint>, "Name": "...",
-- "FilterJson": "<JSON text>"}. Strict ownership, same rule as Mode 18.
if(@Mode = 28)
BEGIN
    SELECT @TemplateId = TemplateId, @TemplateName = Name, @TemplateFilterJson = FilterJson
    FROM OPENJSON(@json) WITH (TemplateId BIGINT, Name NVARCHAR(200), FilterJson NVARCHAR(MAX))

    IF NOT EXISTS (SELECT 1 FROM BlueprintTemplate WHERE TemplateId = @TemplateId AND IsDeleted = 0 AND FranchiseId = @FranchiseId)
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Template not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    UPDATE dbo.BlueprintTemplate
    SET Name = LTRIM(RTRIM(@TemplateName)), FilterJson = @TemplateFilterJson, ModifiedBy = @UserId, ModifiedOn = GETDATE()
    WHERE TemplateId = @TemplateId

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

-- Mode 29: Soft-delete a template (deleteBlueprintTemplate). @json:
-- {"TemplateId": <bigint>}. Same strict ownership as Mode 28.
if(@Mode = 29)
BEGIN
    SELECT @TemplateId = TemplateId FROM OPENJSON(@json) WITH (TemplateId BIGINT)

    IF NOT EXISTS (SELECT 1 FROM BlueprintTemplate WHERE TemplateId = @TemplateId AND IsDeleted = 0 AND FranchiseId = @FranchiseId)
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Template not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    UPDATE dbo.BlueprintTemplate SET IsDeleted = 1, ModifiedBy = @UserId, ModifiedOn = GETDATE() WHERE TemplateId = @TemplateId

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

-- Modes 30-32 share a gate: the exam must exist, still be Draft, and the
-- section must belong to it — same as the old loadDraftSectionContext.
-- @json (all three): includes "MockTestId": <bigint>, "SectionId": <bigint>.

-- Mode 30: Append picked questions to a section's end (addQuestionsToSection).
-- @json adds: {"QuestionIds": "<csv bigint>"}. Rejects the whole batch if it
-- would overflow the section's pool (recipe.pool from SelectionPolicyJson) —
-- same all-or-nothing behavior as before.
if(@Mode = 30)
BEGIN
    SELECT @MockTestId = MockTestId, @SecSectionId = SectionId, @QuestionIdsCsv = QuestionIds
    FROM OPENJSON(@json) WITH (MockTestId BIGINT, SectionId BIGINT, QuestionIds NVARCHAR(MAX))

    SELECT @SelectionPolicyJson = SelectionPolicyJson, @ExistingStatus = Status
    FROM MockTest WHERE MockTestId = @MockTestId AND IsDeleted = 0 AND FranchiseId = @FranchiseId
    IF @SelectionPolicyJson IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Exam not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    SELECT @DraftStatus = TRY_CAST(ServiceValue AS INT) FROM _InternalService WHERE Category = 'EXAM_STATUS' AND ServiceLabel = 'DRAFT' AND IsActive = 1
    IF @ExistingStatus <> @DraftStatus
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'Only draft exams can be edited.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SELECT @NewPool = TRY_CAST(pool AS INT)
    FROM OPENJSON(@SelectionPolicyJson, '$.sections') WITH (sectionId VARCHAR(20), pool INT)
    WHERE TRY_CAST(sectionId AS BIGINT) = @SecSectionId
    IF @NewPool IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Section not found in this exam''s recipe.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SELECT @MsRulesJson = RulesJson FROM PaperSection WHERE SectionId = @SecSectionId AND IsDeleted = 0
    SET @PaperTotalMarks = TRY_CAST(JSON_VALUE(@MsRulesJson, '$.marks') AS DECIMAL(5,2))
    SET @SecNegative = TRY_CAST(JSON_VALUE(@MsRulesJson, '$.negative') AS DECIMAL(5,2))

    DELETE FROM @QuestionIdsInput
    INSERT INTO @QuestionIdsInput (QuestionId)
    SELECT DISTINCT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(ISNULL(@QuestionIdsCsv, ''), ',') WHERE TRY_CAST(value AS BIGINT) IS NOT NULL

    IF NOT EXISTS (SELECT 1 FROM @QuestionIdsInput)
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'No questions selected.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF EXISTS (SELECT 1 FROM @QuestionIdsInput qi WHERE NOT EXISTS (SELECT 1 FROM Question q WHERE q.QuestionId = qi.QuestionId AND q.IsDeleted = 0))
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'One or more selected questions could not be found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF EXISTS (SELECT 1 FROM @QuestionIdsInput qi WHERE EXISTS (SELECT 1 FROM TestQuestion tq WHERE tq.MockTestId = @MockTestId AND tq.SectionId = @SecSectionId AND tq.QuestionId = qi.QuestionId AND tq.IsDeleted = 0))
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'The selected question(s) are already in this section.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF EXISTS (SELECT 1 FROM @QuestionIdsInput qi JOIN Question q ON q.QuestionId = qi.QuestionId WHERE q.CurrentVersionId IS NULL)
    BEGIN
        SET @output = (SELECT 1 AS ID, 400 AS statuscode, 'One or more questions have no published content yet.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    SELECT @Total = COUNT(*) FROM TestQuestion WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId AND IsDeleted = 0
    SELECT @MaxRowNo = (SELECT COUNT(*) FROM @QuestionIdsInput)
    IF @MaxRowNo > @NewPool - @Total
    BEGIN
        SET @output = (
            SELECT 1 AS ID, 409 AS statuscode,
            CONCAT('This section has room for ', @NewPool - @Total, ' more question(s); you selected ', @MaxRowNo, '.') AS response
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
        );
        COMMIT RETURN;
    END

    SELECT @RowNo = ISNULL(MAX(SeqNo), 0) FROM TestQuestion WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId

    -- SIMPLIFICATION: SeqNo is assigned by QuestionId ascending, not by the
    -- caller's selection order (STRING_SPLIT doesn't guarantee input order
    -- across all supported SQL Server versions) — a cosmetic ordering
    -- difference from the old TS version only, not a correctness one.
    INSERT INTO dbo.TestQuestion (MockTestId, SectionId, SeqNo, QuestionId, VersionId, EffectiveMarks, EffectiveNegative, CreatedBy, FranchiseId)
    SELECT @MockTestId, @SecSectionId, @RowNo + ROW_NUMBER() OVER (ORDER BY qi.QuestionId), qi.QuestionId, q.CurrentVersionId, @PaperTotalMarks, @SecNegative, @UserId, @FranchiseId
    FROM @QuestionIdsInput qi JOIN Question q ON q.QuestionId = qi.QuestionId

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (SELECT @MaxRowNo AS AddedCount FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 31: Soft-delete picked questions from a section
-- (removeQuestionsFromSection). @json: {"MockTestId": <bigint>,
-- "SectionId": <bigint>, "QuestionIds": "<csv bigint>"}. Same Draft-only
-- gate as Mode 30 (section-existence check folded into the UPDATE's row
-- count instead of a separate lookup, for brevity).
if(@Mode = 31)
BEGIN
    SELECT @MockTestId = MockTestId, @SecSectionId = SectionId, @QuestionIdsCsv = QuestionIds
    FROM OPENJSON(@json) WITH (MockTestId BIGINT, SectionId BIGINT, QuestionIds NVARCHAR(MAX))

    SELECT @ExistingStatus = Status FROM MockTest WHERE MockTestId = @MockTestId AND IsDeleted = 0 AND FranchiseId = @FranchiseId
    IF @ExistingStatus IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Exam not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    SELECT @DraftStatus = TRY_CAST(ServiceValue AS INT) FROM _InternalService WHERE Category = 'EXAM_STATUS' AND ServiceLabel = 'DRAFT' AND IsActive = 1
    IF @ExistingStatus <> @DraftStatus
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'Only draft exams can be edited.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    DELETE FROM @QuestionIdsInput
    INSERT INTO @QuestionIdsInput (QuestionId)
    SELECT DISTINCT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(ISNULL(@QuestionIdsCsv, ''), ',') WHERE TRY_CAST(value AS BIGINT) IS NOT NULL

    SELECT @Total = COUNT(*) FROM TestQuestion tq
    WHERE tq.MockTestId = @MockTestId AND tq.SectionId = @SecSectionId AND tq.IsDeleted = 0
      AND tq.QuestionId IN (SELECT QuestionId FROM @QuestionIdsInput)
    IF @Total = 0
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'None of the selected question(s) were found in this section.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    UPDATE dbo.TestQuestion SET IsDeleted = 1, ModifiedBy = @UserId, ModifiedOn = GETDATE()
    WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId AND IsDeleted = 0
      AND QuestionId IN (SELECT QuestionId FROM @QuestionIdsInput)

    SET @output = (
        SELECT 1 AS ID, 200 AS statuscode,
        (SELECT @Total AS RemovedCount FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER) AS response
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
    );
    COMMIT RETURN;
END

-- Mode 32: Re-apply a section's SeqNo order (reorderSectionQuestions).
-- @json: {"MockTestId": <bigint>, "SectionId": <bigint>,
-- "OrderedQuestionIds": [<bigint>, ...]}. Unlike every other id list in this
-- file, OrderedQuestionIds is a genuine JSON ARRAY, not a CSV string — order
-- is the entire point of this mode, and OPENJSON's array enumeration
-- preserves source order where STRING_SPLIT does not guarantee it. Same
-- two-pass negative-placeholder trick as Mode 23's PaperSection reorder —
-- (MockTestId, SectionId, SeqNo) is a primary key checked per-statement.
if(@Mode = 32)
BEGIN
    SELECT @MockTestId = MockTestId, @SecSectionId = SectionId FROM OPENJSON(@json) WITH (MockTestId BIGINT, SectionId BIGINT)

    SELECT @ExistingStatus = Status FROM MockTest WHERE MockTestId = @MockTestId AND IsDeleted = 0 AND FranchiseId = @FranchiseId
    IF @ExistingStatus IS NULL
    BEGIN
        SET @output = (SELECT 1 AS ID, 404 AS statuscode, 'Exam not found.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    SELECT @DraftStatus = TRY_CAST(ServiceValue AS INT) FROM _InternalService WHERE Category = 'EXAM_STATUS' AND ServiceLabel = 'DRAFT' AND IsActive = 1
    IF @ExistingStatus <> @DraftStatus
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'Only draft exams can be edited.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    -- ORDER BY CAST([key] AS INT) so @OrderedIdsInput's IDENTITY RowNo is
    -- assigned in the same order the caller's JSON array specified — the
    -- standard SQL Server idiom for populating an ordered IDENTITY from an
    -- ordered SELECT (not ANSI-guaranteed in general, but reliable for a
    -- single non-parallel INSERT...SELECT...ORDER BY like this one).
    DELETE FROM @OrderedIdsInput
    INSERT INTO @OrderedIdsInput (QuestionId)
    SELECT TRY_CAST([value] AS BIGINT) FROM OPENJSON(@json, '$.OrderedQuestionIds')
    WHERE TRY_CAST([value] AS BIGINT) IS NOT NULL
    ORDER BY CAST([key] AS INT)

    SELECT @Total = COUNT(*) FROM TestQuestion WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId AND IsDeleted = 0
    IF (SELECT COUNT(*) FROM @OrderedIdsInput) <> @Total
       OR EXISTS (SELECT 1 FROM @OrderedIdsInput oi WHERE NOT EXISTS (SELECT 1 FROM TestQuestion tq WHERE tq.MockTestId = @MockTestId AND tq.SectionId = @SecSectionId AND tq.IsDeleted = 0 AND tq.QuestionId = oi.QuestionId))
    BEGIN
        SET @output = (SELECT 1 AS ID, 409 AS statuscode, 'This section''s question list is out of date — please refresh and try again.' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END
    IF @Total = 0
    BEGIN
        SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        COMMIT RETURN;
    END

    -- Bump every active row (and any never-cleaned removed row this section
    -- ever had) to a distinct placeholder below the section's lowest-ever
    -- SeqNo, so the final assignment pass can't transiently collide.
    SELECT @RowNo = ISNULL(MIN(SeqNo), 0) FROM TestQuestion WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId
    ;WITH Active AS (
        SELECT QuestionId, ROW_NUMBER() OVER (ORDER BY SeqNo) AS rn
        FROM TestQuestion WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId AND IsDeleted = 0
    )
    UPDATE tq SET SeqNo = @RowNo - 1 - a.rn
    FROM TestQuestion tq JOIN Active a ON a.QuestionId = tq.QuestionId
    WHERE tq.MockTestId = @MockTestId AND tq.SectionId = @SecSectionId AND tq.IsDeleted = 0

    -- Reassign in one pass: match each ordered question id (by its position
    -- in @OrderedIdsInput) to the section's own sorted target SeqNo slots
    -- (by position) — i.e. the Nth id the caller wants goes into whichever
    -- SeqNo slot currently sorts Nth.
    UPDATE tq SET SeqNo = f.TargetSeqNo
    FROM TestQuestion tq
    JOIN (
        SELECT oi.QuestionId, sorted.SeqNo AS TargetSeqNo
        FROM (SELECT QuestionId, ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS rn FROM @OrderedIdsInput) oi
        JOIN (SELECT SeqNo, ROW_NUMBER() OVER (ORDER BY SeqNo ASC) AS rn FROM TestQuestion WHERE MockTestId = @MockTestId AND SectionId = @SecSectionId AND IsDeleted = 0) sorted
          ON sorted.rn = oi.rn
    ) f ON f.QuestionId = tq.QuestionId
    WHERE tq.MockTestId = @MockTestId AND tq.SectionId = @SecSectionId AND tq.IsDeleted = 0

    SET @output = (SELECT 1 AS ID, 200 AS statuscode, 'OK' AS response FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
    COMMIT RETURN;
END

END
COMMIT TRANSACTION 

    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION -- Rollback transaction in case of error

        -- Insert error details into the DatabaseError table
        -- INSERT INTO DatabaseError (Error_State, Error_Line, ERROR_MESSAGE, ERROR_PROCEDURE, DateOfError, FranchiseId, IpAddress, jsonData, Mode, UserId)
        -- VALUES (
        --     ERROR_STATE(),
        --     ERROR_LINE(),
        --     ERROR_MESSAGE(),
        --     ERROR_PROCEDURE(),
        --     GETDATE(),
        --     @FranchiseId,
        --     @IP,
        --     @json,
        --     @Mode,
        --     @UserId
        -- );

		SET @output = JSON_QUERY((select 0 as ID, 400 as StatusCode, ERROR_MESSAGE() as response FOR JSON PATH, WITHOUT_ARRAY_WRAPPER));
    END CATCH
END
