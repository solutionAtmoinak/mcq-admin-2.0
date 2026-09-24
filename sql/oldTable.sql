CREATE TABLE [dbo].[TblMasterMCQ4Question] (
    [MCQQuestionId]       BIGINT          IDENTITY (1, 1) NOT NULL,
    [MCQSectionId]        BIGINT          NOT NULL,
    [MCQPassageId]        BIGINT          NULL,
    [MCQQuestion]         NVARCHAR (MAX)  NOT NULL,
    [MCQQuestionTag]      NVARCHAR (MAX)  NULL,
    [MCQQuestionType]     NVARCHAR (MAX)  NULL,
    [MCQQuestionMarks]    DECIMAL (5, 2)  CONSTRAINT [DF__tmp_ms_xx__MCQQu__56B3DD81] DEFAULT ((1)) NULL,
    [MCQNegativeMarks]    DECIMAL (5, 2)  CONSTRAINT [DF__tmp_ms_xx__MCQNe__57A801BA] DEFAULT ((0)) NULL,
    [MCQPartialCorrect]   DECIMAL (5, 2)  CONSTRAINT [DF__tmp_ms_xx__MCQPa__589C25F3] DEFAULT ((0)) NULL,
    [MCQPartialIncorrect] DECIMAL (5, 2)  CONSTRAINT [DF__tmp_ms_xx__MCQPa__59904A2C] DEFAULT ((0)) NULL,
    [MCQOptionRandom]     BIT             CONSTRAINT [DF__tmp_ms_xx__MCQOp__5A846E65] DEFAULT ((1)) NULL,
    [SortedOrder]         INT             NOT NULL,
    [AnswerLinkType]      BIGINT          NULL,
    [AnswerLink]          NVARCHAR (1000) NULL,
    [AnswerExplanation]   NVARCHAR (MAX)  NULL,
    [DocumentId]          BIGINT          NULL,
    [IsMultipleCorrect]   BIT             NULL,
    [IsActive]            BIT             CONSTRAINT [DF__tmp_ms_xx__IsAct__5B78929E] DEFAULT ((1)) NOT NULL,
    [CreatedBy]           NVARCHAR (450)  NOT NULL,
    [ModifiedBy]          NVARCHAR (450)  NULL,
    [CreatedOn]           DATETIME        CONSTRAINT [DF__tmp_ms_xx__Creat__5C6CB6D7] DEFAULT (getdate()) NOT NULL,
    [ModifiedOn]          DATETIME        NULL,
    [CreatedIP]           VARCHAR (20)    NOT NULL,
    [ModifiedIP]          VARCHAR (20)    NULL,
    [IsDeleted]           BIT             CONSTRAINT [DF__tmp_ms_xx__IsDel__5D60DB10] DEFAULT ((0)) NOT NULL,
    [FranchiseId]         BIGINT          NULL,
    [AnswerDocumentId]    BIGINT          NULL,
    [QuestionLink]        NVARCHAR (1000) NULL,
    CONSTRAINT [PK__tmp_ms_x__BCAE095274636691] PRIMARY KEY CLUSTERED ([MCQQuestionId] ASC) WITH (FILLFACTOR = 80),
    CONSTRAINT [FK__TblMaster__Docum__5E54FF49] FOREIGN KEY ([DocumentId]) REFERENCES [dbo].[TblDocumentDetails] ([DocumentId]),
    CONSTRAINT [FK__TblMaster__MCQPa__603D47BB] FOREIGN KEY ([MCQPassageId]) REFERENCES [dbo].[TblMasterMCQ5PassageDetail] ([MCQPassageId]),
    CONSTRAINT [FK__TblMaster__MCQSe__5F492382] FOREIGN KEY ([MCQSectionId]) REFERENCES [dbo].[TblMasterMCQ3Section] ([MCQSectionId])
);


GO
CREATE NONCLUSTERED INDEX [IX_dbo_TblMasterMCQ4Question_IsDeletedFranchiseId]
    ON [dbo].[TblMasterMCQ4Question]([IsDeleted] ASC, [FranchiseId] ASC) WITH (FILLFACTOR = 80);


GO
CREATE NONCLUSTERED INDEX [IX_dbo_TblMasterMCQ4Question_MCQSectionIdFranchiseId]
    ON [dbo].[TblMasterMCQ4Question]([MCQSectionId] ASC, [FranchiseId] ASC) WITH (FILLFACTOR = 80);

CREATE TABLE [dbo].[TblMasterMCQ5PassageDetail] (
    [MCQPassageId]    BIGINT          IDENTITY (1, 1) NOT NULL,
    [PassageDetails]  NVARCHAR (MAX)  NOT NULL,
    [PassageLinkType] BIGINT          NULL,
    [PassageLink]     NVARCHAR (1000) NULL,
    [DocumentId]      BIGINT          NULL,
    PRIMARY KEY CLUSTERED ([MCQPassageId] ASC),
    CONSTRAINT [FK_TblMasterMCQ4PassageDetail_DocumentId] FOREIGN KEY ([DocumentId]) REFERENCES [dbo].[TblDocumentDetails] ([DocumentId])
);

CREATE TABLE [dbo].[TblMasterMCQ6SetAnswerOption] (
    [MCQOptionId]             BIGINT         IDENTITY (1, 1) NOT NULL,
    [MCQQuestionId]           BIGINT         NOT NULL,
    [MCQOption]               NVARCHAR (MAX) NOT NULL,
    [MCQOptionDocumentId]     BIGINT         NULL,
    [MCQPartialCorrectMarks]  DECIMAL (5, 2) NULL,
    [MCQPartialNegativeMarks] DECIMAL (5, 2) NULL,
    PRIMARY KEY CLUSTERED ([MCQOptionId] ASC),
    CONSTRAINT [FK__TblMaster__MCQQu__61316BF4] FOREIGN KEY ([MCQQuestionId]) REFERENCES [dbo].[TblMasterMCQ4Question] ([MCQQuestionId])
);


GO
CREATE NONCLUSTERED INDEX [IX_dbo_TblMasterMCQ6SetAnswerOption_MCQQuestionId]
    ON [dbo].[TblMasterMCQ6SetAnswerOption]([MCQQuestionId] ASC);

CREATE TABLE [dbo].[TblMasterMCQ7SetCorrectAnswer] (
    [MCQQuestionId] BIGINT NOT NULL,
    [MCQOptionId]   BIGINT NOT NULL,
    PRIMARY KEY CLUSTERED ([MCQQuestionId] ASC, [MCQOptionId] ASC) WITH (FILLFACTOR = 80),
    FOREIGN KEY ([MCQOptionId]) REFERENCES [dbo].[TblMasterMCQ6SetAnswerOption] ([MCQOptionId]),
    CONSTRAINT [FK__TblMaster__MCQQu__6225902D] FOREIGN KEY ([MCQQuestionId]) REFERENCES [dbo].[TblMasterMCQ4Question] ([MCQQuestionId])
);

CREATE TABLE [dbo].[TblMasterMCQ9QuestionTags] (
    [QuestionTagId] BIGINT         IDENTITY (1, 1) NOT NULL,
    [TagName]       NVARCHAR (200) NOT NULL,
    [QuestionId]    BIGINT         NOT NULL,
    [IsDeleted]     BIT            CONSTRAINT [DEFAULT_TblMasterMCQ9QuestionTags_IsDeleted] DEFAULT ((0)) NOT NULL,
    CONSTRAINT [PK_TblMasterMCQ9QuestionTags] PRIMARY KEY NONCLUSTERED ([QuestionTagId] ASC) WITH (FILLFACTOR = 80)
);
