USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_FinalizarVencidas
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE RESERVA
    SET estado = 'finalizada'
    WHERE estado = 'activa' AND hora_fin <= GETDATE();
END;
GO