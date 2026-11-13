USE MiCubiculoDB;
GO

IF COL_LENGTH('ESTUDIANTE', 'correo') IS NULL
    ALTER TABLE ESTUDIANTE ADD correo VARCHAR(120) NULL;
IF COL_LENGTH('ESTUDIANTE', 'contrasena_hash') IS NULL
    ALTER TABLE ESTUDIANTE ADD contrasena_hash VARCHAR(255) NULL;
IF COL_LENGTH('ESTUDIANTE', 'fecha_registro') IS NULL
    ALTER TABLE ESTUDIANTE ADD fecha_registro DATETIME NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ESTUDIANTE_correo' AND object_id = OBJECT_ID('ESTUDIANTE'))
    CREATE UNIQUE INDEX UX_ESTUDIANTE_correo ON ESTUDIANTE(correo) WHERE correo IS NOT NULL;
GO

IF OBJECT_ID('CODIGO_VERIFICACION') IS NULL
BEGIN
    CREATE TABLE CODIGO_VERIFICACION (
        id_codigo   INT IDENTITY(1,1) PRIMARY KEY,
        correo      VARCHAR(120) NOT NULL,
        proposito   VARCHAR(20)  NOT NULL CHECK (proposito IN ('registro', 'recuperacion')),
        codigo_hash CHAR(64)     NOT NULL,
        creado      DATETIME     NOT NULL DEFAULT GETDATE(),
        expira      DATETIME     NOT NULL,
        intentos    INT          NOT NULL DEFAULT 0,
        usado       BIT          NOT NULL DEFAULT 0
    );
    CREATE INDEX IX_CODIGO_correo ON CODIGO_VERIFICACION(correo, proposito);
END
GO