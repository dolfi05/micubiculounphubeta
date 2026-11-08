USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_PanelOcupacion
    @ahora DATETIME = NULL   -- SOLO PARA PRUEBAS
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @t DATETIME = ISNULL(@ahora, GETDATE());

    UPDATE RESERVA
    SET estado = 'finalizada'
    WHERE estado = 'activa' AND hora_fin <= GETDATE();

    SELECT
        c.id_cubiculo,
        c.numero,
        c.tipo,
        c.capacidad_minima,
        CASE WHEN a.id_reserva IS NULL THEN 'disponible' ELSE 'ocupado' END AS estado,
        a.id_reserva,
        a.responsable_nombre,
        a.responsable_matricula,
        a.cantidad_integrantes,
        a.hora_inicio,
        a.hora_fin,
        CASE WHEN a.id_reserva IS NULL THEN NULL
             ELSE DATEDIFF(SECOND, @t, a.hora_fin) END AS segundos_restantes,
        p.hora_inicio AS proxima_reserva
    FROM CUBICULO c
    OUTER APPLY (
        SELECT TOP 1 r.id_reserva, r.cantidad_integrantes, r.hora_inicio, r.hora_fin,
               e.nombre AS responsable_nombre, e.matricula AS responsable_matricula
        FROM RESERVA r
        JOIN RESERVA_ESTUDIANTE re ON re.id_reserva = r.id_reserva AND re.es_responsable = 1
        JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante
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