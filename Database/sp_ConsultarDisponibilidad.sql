CREATE PROCEDURE sp_ConsultarDisponibilidad
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. "Auto-liberación": Actualizar a finalizadas las reservas cuyo tiempo ya pasó (RF-04)
    UPDATE RESERVA
    SET estado = 'finalizada'
    WHERE estado = 'activa' AND hora_fin <= GETDATE();

    -- 2. Devolver la disponibilidad en tiempo real (RF-01)
    SELECT 
        c.id_cubiculo,
        c.numero, 
        c.tipo,
        c.capacidad_minima,
        ISNULL(r.estado, 'disponible') AS estado,
        r.hora_fin AS se_libera_a
    FROM CUBICULO c
    LEFT JOIN RESERVA r ON c.id_cubiculo = r.id_cubiculo AND r.estado = 'activa'
    ORDER BY c.numero;
END;
GO