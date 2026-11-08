USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_ConsultarDisponibilidad
    @ahora DATETIME = NULL   -- SOLO PARA PRUEBAS
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @t DATETIME = ISNULL(@ahora, GETDATE());

    -- Auto-liberacion (RF-04): siempre con la hora real
    UPDATE RESERVA
    SET estado = 'finalizada'
    WHERE estado = 'activa' AND hora_fin <= GETDATE();

    SELECT
        c.id_cubiculo,
        c.numero,
        c.tipo,
        c.capacidad_minima,
        CASE WHEN a.hora_fin IS NULL THEN 'disponible' ELSE 'ocupado' END AS estado,
        a.hora_fin AS se_libera_a,
        CASE WHEN a.hora_fin IS NULL THEN NULL
             ELSE DATEDIFF(SECOND, @t, a.hora_fin) END AS segundos_restantes,
        p.hora_inicio AS proxima_reserva
    FROM CUBICULO c
    OUTER APPLY (
        SELECT TOP 1 r.hora_fin
        FROM RESERVA r
        WHERE r.id_cubiculo = c.id_cubiculo AND r.estado = 'activa'
          AND r.hora_inicio <= @t AND r.hora_fin > @t
        ORDER BY r.hora_inicio
    ) a
    OUTER APPLY (
        SELECT TOP 1 r.hora_inicio
        FROM RESERVA r
        WHERE r.id_cubiculo = c.id_cubiculo AND r.estado = 'activa'
          AND r.hora_inicio > @t
        ORDER BY r.hora_inicio
    ) p
    ORDER BY c.numero;
END;
GO