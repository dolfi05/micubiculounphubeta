-- Intentar reservar el cubículo 8 (Especial) con solo 2 personas (requiere 7)[cite: 3]
EXEC sp_RegistrarReserva 
    @id_cubiculo = 8, 
    @hora_inicio = '2026-11-08 14:00:00', 
    @json_integrantes = '[{"id": 1, "resp": 1}, {"id": 2, "resp": 0}]';
-- RESULTADO ESPERADO: Error 50001 (No cumple capacidad).

-- Reservar el cubículo 2 (Estándar) con 2 personas a las 2:00 PM
EXEC sp_RegistrarReserva 
    @id_cubiculo = 2, 
    @hora_inicio = '2026-11-08 14:00:00', 
    @json_integrantes = '[{"id": 3, "resp": 1}, {"id": 4, "resp": 0}]';
-- RESULTADO ESPERADO: Reserva exitosa.

-- Intentar reservar el MISMO cubículo 2 a las 3:00 PM (choca con la reserva de 2 a 4 PM)
EXEC sp_RegistrarReserva 
    @id_cubiculo = 2, 
    @hora_inicio = '2026-11-08 15:00:00', 
    @json_integrantes = '[{"id": 5, "resp": 1}, {"id": 6, "resp": 0}]';
-- RESULTADO ESPERADO: Error 50002 (Cubículo ya reservado).

-- Reservar el cubículo 3 (está libre), pero metiendo al estudiante ID 4 que ya está en el cubículo 2
EXEC sp_RegistrarReserva 
    @id_cubiculo = 3, 
    @hora_inicio = '2026-11-08 14:30:00', 
    @json_integrantes = '[{"id": 7, "resp": 1}, {"id": 4, "resp": 0}]';
-- RESULTADO ESPERADO: Error 50003 (Integrante con reserva activa).