CREATE PROCEDURE sp_ValidarPersonal
    @usuario VARCHAR(50),
    @contrasena VARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT id_personal, usuario, nombre
    FROM PERSONAL
    WHERE usuario = @usuario AND contrasena_hash = @contrasena;
    -- Nota: En la beta usaremos un hash simulado o texto directo configurado en la data semilla.
END;
GO