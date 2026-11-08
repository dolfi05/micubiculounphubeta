USE MiCubiculoDB;
GO

-- 1. Cubiculos (solo se insertan los que falten)
INSERT INTO CUBICULO (numero, tipo, capacidad_minima)
SELECT v.numero, v.tipo, v.capacidad_minima
FROM (VALUES
    (1, 'estandar', 2), (2, 'estandar', 2), (3, 'estandar', 2),
    (4, 'estandar', 2), (5, 'estandar', 2), (6, 'estandar', 2),
    (7, 'estandar', 2), (8, 'especial', 7), (9, 'estandar', 2),
    (10, 'estandar', 2)
) AS v(numero, tipo, capacidad_minima)
WHERE NOT EXISTS (SELECT 1 FROM CUBICULO c WHERE c.numero = v.numero);

-- 2. Personal de prueba (solo si no existe).
--    Los hashes son provisionales: en la Fase 5 los reemplazamos por hashes reales.
INSERT INTO PERSONAL (usuario, contrasena_hash, nombre)
SELECT v.usuario, v.contrasena_hash, v.nombre
FROM (VALUES
    ('admin_biblio', 'hash_simulado_123', 'Nadia Disla (Coordinadora)'),
    ('tecnico_1',    'hash_simulado_456', 'Tecnico de Turno')
) AS v(usuario, contrasena_hash, nombre)
WHERE NOT EXISTS (SELECT 1 FROM PERSONAL p WHERE p.usuario = v.usuario);

-- 3. Limpiar reservas y estudiantes de pruebas anteriores
DELETE FROM RESERVA_ESTUDIANTE;
DELETE FROM RESERVA;
DELETE FROM ESTUDIANTE;
DBCC CHECKIDENT ('RESERVA', RESEED, 0);
DBCC CHECKIDENT ('ESTUDIANTE', RESEED, 0);

-- 4. Estudiantes de prueba (formato NN-NNNN)
INSERT INTO ESTUDIANTE (matricula, nombre) VALUES
('24-0509', 'Stacy Alcantara'),
('24-0081', 'Dolfi Alvarez'),
('25-0681', 'Emil Dirocie'),
('26-0001', 'Estudiante Prueba 1'),
('26-0002', 'Estudiante Prueba 2'),
('26-0003', 'Estudiante Prueba 3'),
('26-0004', 'Estudiante Prueba 4'),
('26-0005', 'Estudiante Prueba 5'),
('26-0006', 'Estudiante Prueba 6'),
('26-0007', 'Estudiante Prueba 7'),
('26-0008', 'Estudiante Prueba 8');

-- 5. Reservas de prueba (horas relativas al momento de ejecutar el script)
DECLARE @ahora DATETIME = GETDATE();
DECLARE @id INT;

-- Cubiculo 1: EN CURSO (empezo hace 20 min). Stacy responsable + Dolfi
INSERT INTO RESERVA (id_cubiculo, cantidad_integrantes, hora_inicio, hora_fin, estado)
SELECT id_cubiculo, 2, DATEADD(MINUTE, -20, @ahora), DATEADD(MINUTE, 100, @ahora), 'activa'
FROM CUBICULO WHERE numero = 1;
SET @id = SCOPE_IDENTITY();
INSERT INTO RESERVA_ESTUDIANTE (id_reserva, id_estudiante, es_responsable)
SELECT @id, id_estudiante, CASE WHEN matricula = '24-0509' THEN 1 ELSE 0 END
FROM ESTUDIANTE WHERE matricula IN ('24-0509', '24-0081');

-- Cubiculo 4: POR VENCER (termina en 25 min)
INSERT INTO RESERVA (id_cubiculo, cantidad_integrantes, hora_inicio, hora_fin, estado)
SELECT id_cubiculo, 2, DATEADD(MINUTE, -95, @ahora), DATEADD(MINUTE, 25, @ahora), 'activa'
FROM CUBICULO WHERE numero = 4;
SET @id = SCOPE_IDENTITY();
INSERT INTO RESERVA_ESTUDIANTE (id_reserva, id_estudiante, es_responsable)
SELECT @id, id_estudiante, CASE WHEN matricula = '26-0001' THEN 1 ELSE 0 END
FROM ESTUDIANTE WHERE matricula IN ('26-0001', '26-0002');

-- Cubiculo 5: FUTURA (empieza en 3 horas)
INSERT INTO RESERVA (id_cubiculo, cantidad_integrantes, hora_inicio, hora_fin, estado)
SELECT id_cubiculo, 2, DATEADD(HOUR, 3, @ahora), DATEADD(HOUR, 5, @ahora), 'activa'
FROM CUBICULO WHERE numero = 5;
SET @id = SCOPE_IDENTITY();
INSERT INTO RESERVA_ESTUDIANTE (id_reserva, id_estudiante, es_responsable)
SELECT @id, id_estudiante, CASE WHEN matricula = '26-0003' THEN 1 ELSE 0 END
FROM ESTUDIANTE WHERE matricula IN ('26-0003', '26-0004');

-- Cubiculo 8: FINALIZADA (hace 4 a 2 horas), 7 integrantes
INSERT INTO RESERVA (id_cubiculo, cantidad_integrantes, hora_inicio, hora_fin, estado)
SELECT id_cubiculo, 7, DATEADD(HOUR, -4, @ahora), DATEADD(HOUR, -2, @ahora), 'finalizada'
FROM CUBICULO WHERE numero = 8;
SET @id = SCOPE_IDENTITY();
INSERT INTO RESERVA_ESTUDIANTE (id_reserva, id_estudiante, es_responsable)
SELECT @id, id_estudiante, CASE WHEN matricula = '26-0004' THEN 1 ELSE 0 END
FROM ESTUDIANTE
WHERE matricula IN ('26-0004','26-0005','26-0006','26-0007','26-0008','24-0509','24-0081');
GO