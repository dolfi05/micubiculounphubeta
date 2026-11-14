USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_ReservasDeEstudiante
    @matricula VARCHAR(10),
    @ahora     DATETIME = NULL   -- SOLO PARA PRUEBAS
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @t DATETIME = ISNULL(@ahora, GETDATE());
    DECLARE @hoy DATETIME = DATEADD(DAY, DATEDIFF(DAY, 0, @t), 0);

    -- Auto-liberacion (RF-04): siempre con la hora real
    UPDATE RESERVA SET estado = 'finalizada'
    WHERE estado = 'activa' AND hora_fin <= GETDATE();

    -- Reservas del estudiante: todas las activas y las de hoy ya terminadas
    DECLARE @mias TABLE (id_reserva INT PRIMARY KEY);
    INSERT INTO @mias (id_reserva)
    SELECT r.id_reserva
    FROM RESERVA r
    JOIN RESERVA_ESTUDIANTE re ON re.id_reserva = r.id_reserva
    JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante
    WHERE e.matricula = @matricula
      AND (r.estado = 'activa' OR r.hora_inicio >= @hoy);

    -- Primer resultado: las reservas (activas primero, por hora de inicio)
    SELECT r.id_reserva, c.numero, c.tipo, r.estado, r.hora_inicio, r.hora_fin,
           r.cantidad_integrantes, re.es_responsable,
           CASE WHEN r.estado = 'activa' AND r.hora_inicio <= @t
                THEN DATEDIFF(SECOND, @t, r.hora_fin) END AS segundos_restantes,
           CASE WHEN r.estado = 'activa' AND r.hora_inicio > @t
                THEN DATEDIFF(SECOND, @t, r.hora_inicio) END AS segundos_para_inicio
    FROM @mias m
    JOIN RESERVA r ON r.id_reserva = m.id_reserva
    JOIN CUBICULO c ON c.id_cubiculo = r.id_cubiculo
    JOIN RESERVA_ESTUDIANTE re ON re.id_reserva = r.id_reserva
    JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante AND e.matricula = @matricula
    ORDER BY CASE WHEN r.estado = 'activa' THEN 0 ELSE 1 END,
             CASE WHEN r.estado = 'activa' THEN r.hora_inicio END ASC,
             r.hora_fin DESC;

    -- Segundo resultado: integrantes de todas esas reservas (responsable primero)
    SELECT re.id_reserva, e.matricula, e.nombre, re.es_responsable
    FROM RESERVA_ESTUDIANTE re
    JOIN @mias m ON m.id_reserva = re.id_reserva
    JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante
    ORDER BY re.id_reserva, re.es_responsable DESC, e.nombre;
END;
GO