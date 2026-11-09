USE MiCubiculoDB;
GO

CREATE OR ALTER PROCEDURE sp_RegistrarReserva
    @id_cubiculo      INT,
    @json_integrantes NVARCHAR(MAX),   -- '[{"matricula":"24-0302","nombre":"Ana Perez","resp":1}, ...]'
    @hora_inicio      DATETIME = NULL, -- NULL significa "Ahora"; si no, una hora en punto de hoy
    @ahora            DATETIME = NULL  -- SOLO PARA PRUEBAS: simula la hora actual
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    -- Protege contra choques cuando dos personas reservan a la vez
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

    BEGIN TRY
        ------------------------------------------------------------------
        -- A. Calcular la hora y el horario de la biblioteca
        ------------------------------------------------------------------
        DECLARE @ahora_min DATETIME = DATEADD(MINUTE, DATEDIFF(MINUTE, 0, ISNULL(@ahora, GETDATE())), 0);
        DECLARE @hoy       DATETIME = DATEADD(DAY, DATEDIFF(DAY, 0, @ahora_min), 0);
                DECLARE @inicio    DATETIME = DATEADD(MINUTE, DATEDIFF(MINUTE, 0, ISNULL(@hora_inicio, @ahora_min)), 0);
        DECLARE @fin       DATETIME = DATEADD(HOUR, 2, @inicio);   -- bloque fijo de 2 horas
        DECLARE @dia       DATETIME = DATEADD(DAY, DATEDIFF(DAY, 0, @inicio), 0);
        -- 1900-01-01 fue lunes, asi que 0 = lunes ... 5 = sabado, 6 = domingo (sin depender del idioma)
        DECLARE @dia_semana INT = DATEDIFF(DAY, 0, @inicio) % 7;
        DECLARE @apertura  DATETIME = DATEADD(HOUR, 8, @dia);
        DECLARE @cierre    DATETIME = CASE WHEN @dia_semana <= 4 THEN DATEADD(HOUR, 21, @dia)
                                           WHEN @dia_semana = 5  THEN DATEADD(HOUR, 15, @dia)
                                           ELSE NULL END;

        ------------------------------------------------------------------
        -- B. Leer el JSON a una tabla en memoria
        ------------------------------------------------------------------
        IF @json_integrantes IS NULL OR ISJSON(@json_integrantes) = 0
           OR LEFT(LTRIM(@json_integrantes), 1) <> '['
            THROW 50010, 'Los datos de los integrantes no son validos.', 1;

        DECLARE @Integrantes TABLE (
            posicion INT, matricula NVARCHAR(100), nombre NVARCHAR(200), es_responsable BIT);

        INSERT INTO @Integrantes (posicion, matricula, nombre, es_responsable)
        SELECT CAST(j.[key] AS INT) + 1,
               LTRIM(RTRIM(p.matricula)),
               LTRIM(RTRIM(p.nombre)),
               ISNULL(p.resp, 0)
        FROM OPENJSON(@json_integrantes) AS j
        CROSS APPLY OPENJSON(j.value) WITH (
            matricula NVARCHAR(100) '$.matricula',
            nombre    NVARCHAR(200) '$.nombre',
            resp      BIT           '$.resp') AS p;

        ------------------------------------------------------------------
        -- C. Validaciones de datos (se juntan TODOS los errores)
        ------------------------------------------------------------------
        DECLARE @errores TABLE (id INT IDENTITY(1,1), mensaje NVARCHAR(300));
        DECLARE @cantidad INT = (SELECT COUNT(*) FROM @Integrantes);
        DECLARE @capacidad INT, @numero INT;

        SELECT @capacidad = capacidad_minima, @numero = numero
        FROM CUBICULO WHERE id_cubiculo = @id_cubiculo;

        IF @capacidad IS NULL
            INSERT INTO @errores (mensaje) VALUES (N'El cubiculo indicado no existe.');


        IF @dia <> @hoy
            INSERT INTO @errores (mensaje) VALUES (N'Solo se puede reservar para el dia de hoy.');
        ELSE IF @dia_semana = 6
            INSERT INTO @errores (mensaje) VALUES (N'La biblioteca esta cerrada los domingos.');
        ELSE IF @inicio < @apertura OR @fin > @cierre
            INSERT INTO @errores (mensaje) VALUES
                                (N'El bloque de 2 horas debe terminar antes del cierre. Ultimo inicio: 19:00 de lunes a viernes y 13:00 los sabados (la biblioteca abre a las 8:00 y cierra a las 21:00, sabados a las 15:00).');

                IF @dia = @hoy AND @inicio < DATEADD(MINUTE, -5, @ahora_min)
            INSERT INTO @errores (mensaje) VALUES (N'Esa hora ya paso. Puedes empezar desde 5 minutos antes de la hora actual.');
        -- Integrantes
        IF @cantidad = 0
            INSERT INTO @errores (mensaje) VALUES (N'Debes indicar al menos un integrante.');

        INSERT INTO @errores (mensaje)
        SELECT N'Falta la matricula del integrante ' + CAST(posicion AS NVARCHAR(10)) + N'.'
        FROM @Integrantes WHERE ISNULL(matricula, '') = '' ORDER BY posicion;

        INSERT INTO @errores (mensaje)
        SELECT N'La matricula del integrante ' + CAST(posicion AS NVARCHAR(10)) + N' no es valida (formato 24-0302).'
        FROM @Integrantes
        WHERE matricula <> '' AND matricula NOT LIKE '[0-9][0-9]-[0-9][0-9][0-9][0-9]'
        ORDER BY posicion;

        INSERT INTO @errores (mensaje)
        SELECT N'Falta el nombre del integrante ' + CAST(posicion AS NVARCHAR(10)) + N'.'
        FROM @Integrantes WHERE ISNULL(nombre, '') = '' ORDER BY posicion;

        INSERT INTO @errores (mensaje)
        SELECT N'El nombre del integrante ' + CAST(posicion AS NVARCHAR(10)) + N' es demasiado largo (maximo 100).'
        FROM @Integrantes WHERE LEN(nombre) > 100 ORDER BY posicion;

        INSERT INTO @errores (mensaje)
        SELECT N'La matricula ' + matricula + N' esta repetida.'
        FROM @Integrantes
        WHERE matricula LIKE '[0-9][0-9]-[0-9][0-9][0-9][0-9]'
        GROUP BY matricula HAVING COUNT(*) > 1;

        IF @cantidad > 0 AND (SELECT COUNT(*) FROM @Integrantes WHERE es_responsable = 1) <> 1
            INSERT INTO @errores (mensaje) VALUES (N'Debe haber exactamente un responsable.');

        IF @capacidad IS NOT NULL AND @cantidad < @capacidad
            INSERT INTO @errores (mensaje) VALUES
                (N'El cubiculo ' + CAST(@numero AS NVARCHAR(10)) + N' requiere al menos '
                 + CAST(@capacidad AS NVARCHAR(10)) + N' personas. El grupo tiene '
                 + CAST(@cantidad AS NVARCHAR(10)) + N'.');

        DECLARE @msg NVARCHAR(2000) =
            (SELECT STRING_AGG(mensaje, N' | ') WITHIN GROUP (ORDER BY id) FROM @errores);
        IF @msg IS NOT NULL
            THROW 50010, @msg, 1;

        ------------------------------------------------------------------
        -- D. Transaccion: choques de horario y guardado
        ------------------------------------------------------------------
        BEGIN TRANSACTION;

        IF EXISTS (
            SELECT 1 FROM RESERVA
            WHERE id_cubiculo = @id_cubiculo AND estado = 'activa'
              AND hora_inicio < @fin AND hora_fin > @inicio)
            THROW 50002, 'El cubiculo ya esta reservado en este horario.', 1;

        DECLARE @ocupados NVARCHAR(500) = (
            SELECT STRING_AGG(i.matricula, N', ') FROM @Integrantes i
            WHERE EXISTS (
                SELECT 1 FROM RESERVA r
                JOIN RESERVA_ESTUDIANTE re ON re.id_reserva = r.id_reserva
                JOIN ESTUDIANTE e ON e.id_estudiante = re.id_estudiante
                WHERE e.matricula = i.matricula AND r.estado = 'activa'
                  AND r.hora_inicio < @fin AND r.hora_fin > @inicio));
        IF @ocupados IS NOT NULL
        BEGIN
            DECLARE @msg_ocupados NVARCHAR(600) =
                N'Ya tienen otra reserva en ese horario: ' + @ocupados + N'.';
            THROW 50003, @msg_ocupados, 1;
        END

        -- Crear los estudiantes que no existan (si ya existen se conserva su nombre)
        INSERT INTO ESTUDIANTE (matricula, nombre)
        SELECT i.matricula, i.nombre FROM @Integrantes i
        WHERE NOT EXISTS (SELECT 1 FROM ESTUDIANTE e WHERE e.matricula = i.matricula);

        INSERT INTO RESERVA (id_cubiculo, cantidad_integrantes, hora_inicio, hora_fin, estado)
        VALUES (@id_cubiculo, @cantidad, @inicio, @fin, 'activa');

        DECLARE @nuevo_id_reserva INT = SCOPE_IDENTITY();

        INSERT INTO RESERVA_ESTUDIANTE (id_reserva, id_estudiante, es_responsable)
        SELECT @nuevo_id_reserva, e.id_estudiante, i.es_responsable
        FROM @Integrantes i
        JOIN ESTUDIANTE e ON e.matricula = i.matricula;

        COMMIT TRANSACTION;

        SELECT @nuevo_id_reserva AS id_reserva, 'Reserva exitosa' AS mensaje,
               @inicio AS hora_inicio, @fin AS hora_fin;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO