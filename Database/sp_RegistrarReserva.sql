DROP PROCEDURE IF EXISTS sp_RegistrarReserva;
GO

CREATE PROCEDURE sp_RegistrarReserva
    @id_cubiculo INT,
    @hora_inicio DATETIME,
    @json_integrantes NVARCHAR(MAX) -- Recibe algo como: '[{"id": 1, "resp": 1}, {"id": 2, "resp": 0}]'
AS
BEGIN
    SET NOCOUNT ON;
    
    -- El escudo máximo contra registros fantasmas y choques de concurrencia
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE; 

    BEGIN TRY
        BEGIN TRANSACTION;

        -- La duración obligatoria es de 2 horas exactas[cite: 3]
        DECLARE @hora_fin DATETIME = DATEADD(HOUR, 2, @hora_inicio);
        
        -- 1. Desempaquetar el JSON en una tabla temporal en memoria
        SELECT 
            id_estudiante = CAST(JSON_VALUE(value, '$.id') AS INT), 
            es_responsable = CAST(JSON_VALUE(value, '$.resp') AS BIT)
        INTO #Integrantes
        FROM OPENJSON(@json_integrantes);

        DECLARE @cantidad_integrantes INT = (SELECT COUNT(*) FROM #Integrantes);
        DECLARE @capacidad INT = (SELECT capacidad_minima FROM CUBICULO WHERE id_cubiculo = @id_cubiculo);

        -- 2. Validar mínimo de personas (Regla institucional)[cite: 3, 20]
        IF @cantidad_integrantes < @capacidad
            THROW 50001, 'El grupo no cumple con la capacidad mínima exigida para este cubículo.', 1;

        -- 3. Validar solapamiento del CUBÍCULO (Range Lock aplicado aquí)
        IF EXISTS (
            SELECT 1 FROM RESERVA 
            WHERE id_cubiculo = @id_cubiculo AND estado = 'activa'
            AND (hora_inicio < @hora_fin AND hora_fin > @hora_inicio)
        )
            THROW 50002, 'El cubículo ya está reservado en este horario.', 1;

        -- 4. Validar solapamiento de CUALQUIER integrante (Blindaje del equipo completo)
        IF EXISTS (
            SELECT 1 FROM RESERVA r
            JOIN RESERVA_ESTUDIANTE re ON r.id_reserva = re.id_reserva
            JOIN #Integrantes i ON re.id_estudiante = i.id_estudiante
            WHERE r.estado = 'activa'
            AND (r.hora_inicio < @hora_fin AND r.hora_fin > @hora_inicio)
        )
            THROW 50003, 'Uno o más integrantes del grupo ya tienen una reserva activa en este horario.', 1;

        -- 5. Insertar la reserva principal
        INSERT INTO RESERVA (id_cubiculo, cantidad_integrantes, hora_inicio, hora_fin, estado)
        VALUES (@id_cubiculo, @cantidad_integrantes, @hora_inicio, @hora_fin, 'activa');

        DECLARE @nuevo_id_reserva INT = SCOPE_IDENTITY();

        -- 6. Insertar a TODOS los integrantes de un solo golpe
        INSERT INTO RESERVA_ESTUDIANTE (id_reserva, id_estudiante, es_responsable)
        SELECT @nuevo_id_reserva, id_estudiante, es_responsable
        FROM #Integrantes;

        COMMIT TRANSACTION;
        
        SELECT @nuevo_id_reserva AS id_reserva, 'Reserva exitosa' AS mensaje;
        
    END TRY
    BEGIN CATCH
        -- Limpieza absoluta si cualquier validación falla o hay un deadlock
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW; 
    END CATCH
END;
GO