USE MiCubiculoDB;
GO

IF COL_LENGTH('RESERVA', 'entrega_confirmada') IS NULL
    ALTER TABLE RESERVA ADD entrega_confirmada BIT NOT NULL
        CONSTRAINT DF_RESERVA_entrega DEFAULT 0;
GO

IF COL_LENGTH('RESERVA', 'entrega_hora') IS NULL
    ALTER TABLE RESERVA ADD entrega_hora DATETIME NULL;
GO

IF COL_LENGTH('RESERVA', 'entrega_por') IS NULL
    ALTER TABLE RESERVA ADD entrega_por INT NULL;   -- id del personal que confirmó
GO