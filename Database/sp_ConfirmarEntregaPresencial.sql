USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_ConfirmarEntregaPresencial
    @id_reserva  INT,
    @id_personal INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Registrada por el personal con el grupo presente: la entrega queda confirmada
    UPDATE RESERVA
    SET entrega_confirmada = 1,
        entrega_hora = GETDATE(),
        entrega_por = @id_personal
    WHERE id_reserva = @id_reserva
      AND estado = 'activa'
      AND entrega_confirmada = 0;
END;
GO