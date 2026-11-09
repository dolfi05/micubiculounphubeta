USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_LiberarReservaManual
    @id_reserva INT
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

    -- Finaliza y ajusta la hora de fin al momento exacto de la liberacion.
    -- La condicion estado = 'activa' evita liberar dos veces si dos personas pulsan a la vez.
    UPDATE RESERVA
    SET estado = 'finalizada',
                hora_fin = CASE WHEN GETDATE() > hora_inicio AND GETDATE() < hora_fin
                        THEN GETDATE() ELSE hora_fin END
    WHERE id_reserva = @id_reserva AND estado = 'activa';

    IF @@ROWCOUNT = 0
        THROW 50021, 'La reserva ya estaba finalizada.', 1;

    SELECT 'Cubiculo liberado exitosamente' AS mensaje, @numero AS numero_cubiculo;
END;
GO