USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_ValidarPersonal
    @usuario VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    -- Devuelve el hash guardado. La comparacion con la contrasena la hace Flask.
    SELECT id_personal, usuario, nombre, contrasena_hash
    FROM PERSONAL
    WHERE usuario = @usuario;
END;
GO