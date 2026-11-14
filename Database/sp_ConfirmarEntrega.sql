USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_ConfirmarEntrega
    @id_reserva  INT,
    @id_personal INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ahora DATETIME = GETDATE();

    -- Un solo UPDATE valida y escribe: no hay carrera entre dos confirmaciones
    UPDATE RESERVA
    SET entrega_confirmada = 1,
        entrega_hora = @ahora,
        entrega_por = @id_personal
    WHERE id_reserva = @id_reserva
      AND estado = 'activa'
      AND hora_fin > @ahora
      AND entrega_confirmada = 0
      AND @ahora >= DATEADD(MINUTE, -10, hora_inicio);

    IF @@ROWCOUNT = 1 RETURN;

    -- No se actualizó nada: averiguar el motivo para informarlo
    DECLARE @estado VARCHAR(20), @ini DATETIME, @fin DATETIME, @conf BIT;
    SELECT @estado = estado, @ini = hora_inicio, @fin = hora_fin, @conf = entrega_confirmada
    FROM RESERVA WHERE id_reserva = @id_reserva;

    IF @estado IS NULL
        THROW 50020, 'La reserva no existe.', 1;
    IF @estado <> 'activa' OR @fin <= @ahora
        THROW 50021, 'La reserva ya finalizo.', 1;
    IF @conf = 1
        THROW 50051, 'La entrega de esta reserva ya fue confirmada.', 1;

    DECLARE @msg NVARCHAR(200) =
        'Todavia no se puede confirmar: la entrega se habilita 10 minutos antes del inicio (a las '
        + CONVERT(VARCHAR(5), DATEADD(MINUTE, -10, @ini), 108) + ').';
    THROW 50050, @msg, 1;
END;
GO