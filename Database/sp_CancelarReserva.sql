USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_CancelarReserva
    @id_reserva INT,
    @matricula  VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @estado VARCHAR(20), @numero INT;

    SELECT @estado = r.estado, @numero = c.numero
    FROM RESERVA r
    JOIN CUBICULO c ON c.id_cubiculo = r.id_cubiculo
    WHERE r.id_reserva = @id_reserva;

    IF @estado IS NULL
        THROW 50020, 'La reserva indicada no existe.', 1;

    IF @estado <> 'activa'
        THROW 50021, 'La reserva ya estaba finalizada.', 1;

    -- Solo el responsable puede cancelar
    IF NOT EXISTS (
        SELECT 1
        FROM RESERVA_ESTUDIANTE re
        JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante
        WHERE re.id_reserva = @id_reserva AND e.matricula = @matricula AND re.es_responsable = 1)
        THROW 50022, 'Solo el responsable de la reserva puede cancelarla.', 1;

    -- Si ya empezo, la hora de fin pasa a ser ahora; si no ha empezado, no se toca
    UPDATE RESERVA
    SET estado = 'finalizada',
        hora_fin = CASE WHEN GETDATE() > hora_inicio AND GETDATE() < hora_fin
                        THEN GETDATE() ELSE hora_fin END
    WHERE id_reserva = @id_reserva AND estado = 'activa';

    IF @@ROWCOUNT = 0
        THROW 50021, 'La reserva ya estaba finalizada.', 1;

    SELECT 'Reserva cancelada' AS mensaje, @numero AS numero_cubiculo;
END;
GO