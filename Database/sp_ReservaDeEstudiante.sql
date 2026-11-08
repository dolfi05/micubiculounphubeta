USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_ReservaDeEstudiante
    @matricula VARCHAR(10),
    @ahora     DATETIME = NULL   -- SOLO PARA PRUEBAS
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @t DATETIME = ISNULL(@ahora, GETDATE());

    UPDATE RESERVA
    SET estado = 'finalizada'
    WHERE estado = 'activa' AND hora_fin <= GETDATE();

    -- Prioridad: primero la activa mas cercana; si no hay, la ultima finalizada de hoy
    SELECT TOP 1
        r.id_reserva, c.numero, c.tipo, r.estado, r.hora_inicio, r.hora_fin,
        r.cantidad_integrantes, re.es_responsable,
        CASE WHEN r.estado = 'activa' AND r.hora_inicio <= @t
             THEN DATEDIFF(SECOND, @t, r.hora_fin) END AS segundos_restantes
    FROM RESERVA r
    JOIN RESERVA_ESTUDIANTE re ON re.id_reserva = r.id_reserva
    JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante
    JOIN CUBICULO c ON c.id_cubiculo = r.id_cubiculo
    WHERE e.matricula = @matricula
      AND (r.estado = 'activa' OR CAST(r.hora_inicio AS DATE) = CAST(@t AS DATE))
    ORDER BY CASE WHEN r.estado = 'activa' THEN 0 ELSE 1 END,
             CASE WHEN r.estado = 'activa' THEN r.hora_inicio END ASC,
             r.hora_fin DESC;
END;
GO