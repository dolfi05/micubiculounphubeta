-- Insertar los 10 cubículos (El #8 es especial para 7+ personas)[cite: 3]
INSERT INTO CUBICULO (numero, tipo, capacidad_minima) VALUES 
(1, 'estandar', 2), (2, 'estandar', 2), (3, 'estandar', 2), 
(4, 'estandar', 2), (5, 'estandar', 2), (6, 'estandar', 2), 
(7, 'estandar', 2), (8, 'especial', 7), (9, 'estandar', 2), 
(10, 'estandar', 2);

-- Insertar personal de prueba[cite: 21]
INSERT INTO PERSONAL (usuario, contrasena_hash, nombre) VALUES 
('admin_biblio', 'hash_simulado_123', 'Nadia Disla (Coordinadora)'),
('tecnico_1', 'hash_simulado_456', 'Técnico de Turno');

-- Insertar estudiantes ficticios[cite: 20]
INSERT INTO ESTUDIANTE (matricula, nombre) VALUES 
('24-0509', 'Stacy Alcántara'),
('24-0081', 'Dolfi Alvarez'),
('25-0681', 'Emil Dirocie'),
('26-0001', 'Estudiante Ficticio 1'),
('26-0002', 'Estudiante Ficticio 2'),
('26-0003', 'Estudiante Ficticio 3'),
('26-0004', 'Estudiante Ficticio 4'),
('26-0005', 'Estudiante Ficticio 5');

-- Insertar una reserva ACTIVA en el cubículo 1 (Estándar, 2 personas)[cite: 21]
-- Nota: Usamos GETDATE() para que la hora de inicio sea el momento actual y dure 2 horas
INSERT INTO RESERVA (id_cubiculo, cantidad_integrantes, hora_inicio, hora_fin, estado) 
VALUES (1, 2, GETDATE(), DATEADD(HOUR, 2, GETDATE()), 'activa');

-- Asignar estudiantes a esa reserva (Stacy como responsable, Dolfi como acompañante)[cite: 21]
INSERT INTO RESERVA_ESTUDIANTE (id_reserva, id_estudiante, es_responsable) VALUES 
(1, 1, 1), -- ID 1 es Stacy (Responsable)
(1, 2, 0); -- ID 2 es Dolfi (Acompañante)

-- Insertar una reserva FINALIZADA en el cubículo 8 (Especial, 7 personas)[cite: 21]
INSERT INTO RESERVA (id_cubiculo, cantidad_integrantes, hora_inicio, hora_fin, estado) 
VALUES (8, 7, DATEADD(HOUR, -4, GETDATE()), DATEADD(HOUR, -2, GETDATE()), 'finalizada');
GO