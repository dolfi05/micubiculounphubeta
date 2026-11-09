USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_HorasOcupadas
    @id_cubiculo INT,
    @ahora       DATETIME = NULL   -- SOLO PARA PRUEBAS
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @t DATETIME = ISNULL(@ahora, GETDATE());
    DECLARE @hoy DATETIME = DATEADD(DAY, DATEDIFF(DAY, 0, @t), 0);

    IF NOT EXISTS (SELECT 1 FROM CUBICULO WHERE id_cubiculo = @id_cubiculo)
        THROW 50030, 'El cubiculo indicado no existe.', 1;

    -- Reservas activas de hoy que todavia no terminaron, sin datos personales
    SELECT hora_inicio, hora_fin
    FROM RESERVA
    WHERE id_cubiculo = @id_cubiculo
      AND estado = 'activa'
      AND hora_fin > @t
      AND hora_inicio < DATEADD(DAY, 1, @hoy)
    ORDER BY hora_inicio;
END;
GO