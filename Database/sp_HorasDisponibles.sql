USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_HorasDisponibles
    @id_cubiculo INT,
    @ahora       DATETIME = NULL   -- SOLO PARA PRUEBAS
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @t DATETIME = DATEADD(MINUTE, DATEDIFF(MINUTE, 0, ISNULL(@ahora, GETDATE())), 0);
    DECLARE @hoy DATETIME = DATEADD(DAY, DATEDIFF(DAY, 0, @t), 0);
    DECLARE @dia_semana INT = DATEDIFF(DAY, 0, @t) % 7;   -- 0 = lunes ... 6 = domingo
    DECLARE @apertura DATETIME = DATEADD(HOUR, 8, @hoy);
    DECLARE @cierre DATETIME = CASE WHEN @dia_semana <= 4 THEN DATEADD(HOUR, 21, @hoy)
                                    WHEN @dia_semana = 5  THEN DATEADD(HOUR, 15, @hoy)
                                    ELSE NULL END;

    IF NOT EXISTS (SELECT 1 FROM CUBICULO WHERE id_cubiculo = @id_cubiculo)
        THROW 50030, 'El cubiculo indicado no existe.', 1;

    IF @cierre IS NULL RETURN;   -- domingo: no hay horas

    ;WITH candidatos AS (
        SELECT CAST(0 AS BIT) AS es_ahora, DATEADD(HOUR, v.n, @hoy) AS hora_inicio
        FROM (VALUES (8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19)) AS v(n)
        UNION ALL
        SELECT CAST(1 AS BIT), @t   -- la opcion "Ahora"
    )
    SELECT c.es_ahora, c.hora_inicio, DATEADD(HOUR, 2, c.hora_inicio) AS hora_fin
    FROM candidatos c
    WHERE c.hora_inicio >= @t
      AND c.hora_inicio >= @apertura
      AND DATEADD(HOUR, 2, c.hora_inicio) <= @cierre
      AND (c.es_ahora = 0 OR @t <> DATEADD(HOUR, DATEDIFF(HOUR, 0, @t), 0))  -- no duplicar si ya es en punto
      AND NOT EXISTS (
            SELECT 1 FROM RESERVA r
            WHERE r.id_cubiculo = @id_cubiculo AND r.estado = 'activa'
              AND r.hora_inicio < DATEADD(HOUR, 2, c.hora_inicio)
              AND r.hora_fin > c.hora_inicio)
    ORDER BY c.hora_inicio, c.es_ahora DESC;
END;
GO