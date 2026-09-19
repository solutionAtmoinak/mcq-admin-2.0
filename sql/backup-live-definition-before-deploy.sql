-- =============================================
-- Author:		<Author, DbTeam>
-- Create date: <Create Date, 2024-03-10 13:09:25.567>
-- Description:	<Description, storage purpose>
-- =============================================

Create   PROCEDURE [dbo].[spMcqTeacherService]
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
