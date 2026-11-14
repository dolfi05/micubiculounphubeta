USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_MarcarNoPresentados
AS
BEGIN
    SET NOCOUNT ON;

    -- Tolerancia: 10 minutos despues del inicio sin entrega confirmada
    UPDATE RESERVA
    SET estado = 'no_presentado'
    WHERE estado = 'activa'
      AND entrega_confirmada = 0
      AND GETDATE() >= DATEADD(MINUTE, 10, hora_inicio);
END;
GO