USE MiCubiculoDB;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE parent_object_id = OBJECT_ID('RESERVA')
                 AND definition LIKE '%no_presentado%')
BEGIN
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM RESERVA
               WHERE estado NOT IN ('activa', 'finalizada', 'cancelada'))
    BEGIN
        SELECT DISTINCT estado AS estado_no_contemplado
        FROM RESERVA
        WHERE estado NOT IN ('activa', 'finalizada', 'cancelada');
        ROLLBACK TRANSACTION;
        THROW 50099, 'Hay estados en RESERVA que la migracion no conoce. Revisen la tabla de arriba.', 1;
    END

    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql += N'ALTER TABLE RESERVA DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('RESERVA')
      AND definition LIKE '%estado%';
    EXEC sp_executesql @sql;

    ALTER TABLE RESERVA ADD CONSTRAINT CK_RESERVA_estado
        CHECK (estado IN ('activa', 'finalizada', 'cancelada', 'no_presentado'));

    COMMIT TRANSACTION;
END
GO