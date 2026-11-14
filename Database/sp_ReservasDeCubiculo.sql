USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_ReservasDeCubiculo
    @id_cubiculo INT,
    @ahora       DATETIME = NULL   -- SOLO PARA PRUEBAS
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @t DATETIME = ISNULL(@ahora, GETDATE());
    DECLARE @hoy DATETIME = DATEADD(DAY, DATEDIFF(DAY, 0, @t), 0);

    IF NOT EXISTS (SELECT 1 FROM CUBICULO WHERE id_cubiculo = @id_cubiculo)
        THROW 50030, 'El cubiculo indicado no existe.', 1;

    -- Auto-liberacion (RF-04): siempre con la hora real
    UPDATE RESERVA SET estado = 'finalizada'
    WHERE estado = 'activa' AND hora_fin <= GETDATE();

    DECLARE @del TABLE (id_reserva INT PRIMARY KEY);
    INSERT INTO @del (id_reserva)
    SELECT id_reserva FROM RESERVA
    WHERE id_cubiculo = @id_cubiculo
      AND (estado = 'activa' OR hora_inicio >= @hoy);

    -- Primer resultado: reservas en orden cronologico
    SELECT r.id_reserva, r.estado, r.hora_inicio, r.hora_fin, r.cantidad_integrantes,
           CASE WHEN r.estado = 'activa' AND r.hora_inicio <= @t
                THEN DATEDIFF(SECOND, @t, r.hora_fin) END AS segundos_restantes,
           CASE WHEN r.estado = 'activa' AND r.hora_inicio > @t
                THEN DATEDIFF(SECOND, @t, r.hora_inicio) END AS segundos_para_inicio,
           r.entrega_confirmada,
           r.entrega_hora,
           CASE WHEN r.estado = 'activa' AND r.entrega_confirmada = 0
                 AND r.hora_fin > @t
                 AND @t >= DATEADD(MINUTE, -10, r.hora_inicio)
                THEN 1 ELSE 0 END AS puede_confirmar
    FROM @del d
    JOIN RESERVA r ON r.id_reserva = d.id_reserva
    ORDER BY r.hora_inicio;

    -- Segundo resultado: integrantes (responsable primero)
    SELECT re.id_reserva, e.matricula, e.nombre, re.es_responsable
    FROM RESERVA_ESTUDIANTE re
    JOIN @del d ON d.id_reserva = re.id_reserva
    JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante
    ORDER BY re.id_reserva, re.es_responsable DESC, e.nombre;
END;
GO