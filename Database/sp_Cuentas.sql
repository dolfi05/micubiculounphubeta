USE MiCubiculoDB;
GO

-- Antes de enviar un correo: la matricula o el correo no deben tener ya una cuenta
CREATE OR ALTER PROCEDURE sp_ComprobarRegistro
    @matricula VARCHAR(10),
    @correo    VARCHAR(120)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM ESTUDIANTE WHERE matricula = @matricula AND contrasena_hash IS NOT NULL)
        THROW 50044, 'Ya existe una cuenta con esa matricula. Inicia sesion.', 1;
    IF EXISTS (SELECT 1 FROM ESTUDIANTE WHERE correo = @correo AND matricula <> @matricula)
        THROW 50043, 'Ese correo ya esta registrado con otra matricula.', 1;
    SELECT 1 AS ok;
END;
GO

-- Guarda un codigo nuevo (solo su hash). Invalida los anteriores.
CREATE OR ALTER PROCEDURE sp_SolicitarCodigo
    @correo      VARCHAR(120),
    @proposito   VARCHAR(20),
    @codigo_hash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM CODIGO_VERIFICACION
               WHERE correo = @correo AND proposito = @proposito
                 AND creado > DATEADD(SECOND, -60, GETDATE()))
        THROW 50040, 'Espera un minuto antes de pedir otro codigo.', 1;

    IF (SELECT COUNT(*) FROM CODIGO_VERIFICACION
        WHERE correo = @correo AND creado > DATEADD(HOUR, -1, GETDATE())) >= 5
        THROW 50040, 'Pediste demasiados codigos. Intenta de nuevo en una hora.', 1;

    UPDATE CODIGO_VERIFICACION SET usado = 1
    WHERE correo = @correo AND proposito = @proposito AND usado = 0;

    INSERT INTO CODIGO_VERIFICACION (correo, proposito, codigo_hash, expira)
    VALUES (@correo, @proposito, @codigo_hash, DATEADD(MINUTE, 10, GETDATE()));

    SELECT 1 AS ok;
END;
GO

-- Revisa un codigo y cuenta los intentos fallidos. Devuelve: ok, invalido, vencido o bloqueado
CREATE OR ALTER PROCEDURE sp_VerificarCodigo
    @correo      VARCHAR(120),
    @proposito   VARCHAR(20),
    @codigo_hash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @id INT, @hash CHAR(64), @expira DATETIME, @intentos INT;

    SELECT TOP 1 @id = id_codigo, @hash = codigo_hash, @expira = expira, @intentos = intentos
    FROM CODIGO_VERIFICACION
    WHERE correo = @correo AND proposito = @proposito AND usado = 0
    ORDER BY id_codigo DESC;

    IF @id IS NULL        BEGIN SELECT 'invalido'  AS estado; RETURN; END
    IF @expira < GETDATE() BEGIN SELECT 'vencido'   AS estado; RETURN; END
    IF @intentos >= 5     BEGIN SELECT 'bloqueado' AS estado; RETURN; END

    IF @hash <> @codigo_hash
    BEGIN
        UPDATE CODIGO_VERIFICACION SET intentos = intentos + 1 WHERE id_codigo = @id;
        SELECT CASE WHEN @intentos + 1 >= 5 THEN 'bloqueado' ELSE 'invalido' END AS estado;
        RETURN;
    END

    SELECT 'ok' AS estado;
END;
GO

-- Crea la cuenta (o la enlaza a un estudiante ya existente) y consume el codigo
CREATE OR ALTER PROCEDURE sp_CrearCuenta
    @nombre          VARCHAR(100),
    @matricula       VARCHAR(10),
    @correo          VARCHAR(120),
    @contrasena_hash VARCHAR(255),
    @codigo_hash     CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @id_codigo INT = (
            SELECT TOP 1 id_codigo FROM CODIGO_VERIFICACION WITH (UPDLOCK)
            WHERE correo = @correo AND proposito = 'registro' AND usado = 0
              AND expira > GETDATE() AND intentos < 5 AND codigo_hash = @codigo_hash
            ORDER BY id_codigo DESC);
        IF @id_codigo IS NULL
            THROW 50041, 'El codigo no es valido o ya vencio.', 1;

        IF EXISTS (SELECT 1 FROM ESTUDIANTE WHERE matricula = @matricula AND contrasena_hash IS NOT NULL)
            THROW 50044, 'Ya existe una cuenta con esa matricula. Inicia sesion.', 1;
        IF EXISTS (SELECT 1 FROM ESTUDIANTE WHERE correo = @correo AND matricula <> @matricula)
            THROW 50043, 'Ese correo ya esta registrado con otra matricula.', 1;

        IF EXISTS (SELECT 1 FROM ESTUDIANTE WHERE matricula = @matricula)
            UPDATE ESTUDIANTE
            SET nombre = @nombre, correo = @correo, contrasena_hash = @contrasena_hash,
                fecha_registro = GETDATE()
            WHERE matricula = @matricula;
        ELSE
            INSERT INTO ESTUDIANTE (matricula, nombre, correo, contrasena_hash, fecha_registro)
            VALUES (@matricula, @nombre, @correo, @contrasena_hash, GETDATE());

        UPDATE CODIGO_VERIFICACION SET usado = 1 WHERE id_codigo = @id_codigo;

        COMMIT TRANSACTION;
        SELECT id_estudiante, nombre, matricula FROM ESTUDIANTE WHERE matricula = @matricula;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- Busca una cuenta por matricula o correo (solo cuentas con contrasena)
CREATE OR ALTER PROCEDURE sp_ObtenerCuenta
    @identificador VARCHAR(120)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT id_estudiante, matricula, nombre, correo, contrasena_hash
    FROM ESTUDIANTE
    WHERE contrasena_hash IS NOT NULL
      AND (matricula = @identificador OR correo = @identificador);
END;
GO

-- Cambia la contrasena con un codigo de recuperacion
CREATE OR ALTER PROCEDURE sp_CambiarContrasena
    @correo          VARCHAR(120),
    @contrasena_hash VARCHAR(255),
    @codigo_hash     CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @id_codigo INT = (
            SELECT TOP 1 id_codigo FROM CODIGO_VERIFICACION WITH (UPDLOCK)
            WHERE correo = @correo AND proposito = 'recuperacion' AND usado = 0
              AND expira > GETDATE() AND intentos < 5 AND codigo_hash = @codigo_hash
            ORDER BY id_codigo DESC);
        IF @id_codigo IS NULL
            THROW 50041, 'El codigo no es valido o ya vencio.', 1;

        UPDATE ESTUDIANTE SET contrasena_hash = @contrasena_hash
        WHERE correo = @correo AND contrasena_hash IS NOT NULL;
        IF @@ROWCOUNT = 0
            THROW 50045, 'No existe una cuenta con ese correo.', 1;

        UPDATE CODIGO_VERIFICACION SET usado = 1 WHERE id_codigo = @id_codigo;

        COMMIT TRANSACTION;
        SELECT 'ok' AS estado;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO