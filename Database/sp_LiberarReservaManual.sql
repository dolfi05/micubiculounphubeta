CREATE PROCEDURE sp_LiberarReservaManual
    @id_reserva INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Actualiza el estado y ajusta la hora de fin al momento exacto de la liberación
    UPDATE RESERVA
    SET 
        estado = 'finalizada', 
        hora_fin = GETDATE()
    WHERE 
        id_reserva = @id_reserva AND estado = 'activa';
        
    SELECT 'Cubículo liberado exitosamente' AS mensaje;
END;
GO