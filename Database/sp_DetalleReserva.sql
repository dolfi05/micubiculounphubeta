USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_DetalleReserva
    @id_reserva INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM RESERVA WHERE id_reserva = @id_reserva)
        THROW 50020, 'La reserva indicada no existe.', 1;

    -- Primer resultado: datos de la reserva
    SELECT r.id_reserva, c.numero, c.tipo, r.estado, r.hora_inicio, r.hora_fin,
           r.cantidad_integrantes
    FROM RESERVA r
    JOIN CUBICULO c ON c.id_cubiculo = r.id_cubiculo
    WHERE r.id_reserva = @id_reserva;

    -- Segundo resultado: integrantes (el responsable primero)
    SELECT e.matricula, e.nombre, re.es_responsable
    FROM RESERVA_ESTUDIANTE re
    JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante
    WHERE re.id_reserva = @id_reserva
    ORDER BY re.es_responsable DESC, e.nombre;
END;
GO