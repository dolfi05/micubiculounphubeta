-- Crear la base de datos
CREATE DATABASE MiCubiculoDB;
GO

-- Usar la base de datos recién creada
USE MiCubiculoDB;
GO

-- 1. Tabla PERSONAL (Para el inicio de sesión de la biblioteca)[cite: 21]
CREATE TABLE PERSONAL (
    id_personal INT IDENTITY(1,1) PRIMARY KEY,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL
);

-- 2. Tabla CUBICULO
CREATE TABLE CUBICULO (
    id_cubiculo INT IDENTITY(1,1) PRIMARY KEY,
    numero INT UNIQUE NOT NULL CHECK (numero BETWEEN 1 AND 10),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('estandar', 'especial')),
    capacidad_minima INT NOT NULL CHECK (capacidad_minima IN (2, 7))
);

-- 3. Tabla ESTUDIANTE[cite: 20]
CREATE TABLE ESTUDIANTE (
    id_estudiante INT IDENTITY(1,1) PRIMARY KEY,
    matricula VARCHAR(10) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL
);

-- 4. Tabla RESERVA[cite: 21]
CREATE TABLE RESERVA (
    id_reserva INT IDENTITY(1,1) PRIMARY KEY,
    id_cubiculo INT NOT NULL FOREIGN KEY REFERENCES CUBICULO(id_cubiculo),
    cantidad_integrantes INT NOT NULL,
    hora_inicio DATETIME NOT NULL,
    hora_fin DATETIME NOT NULL,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('activa', 'finalizada'))
);

-- 5. Tabla RESERVA_ESTUDIANTE (Relación muchos a muchos)[cite: 21]
CREATE TABLE RESERVA_ESTUDIANTE (
    id_reserva INT NOT NULL FOREIGN KEY REFERENCES RESERVA(id_reserva),
    id_estudiante INT NOT NULL FOREIGN KEY REFERENCES ESTUDIANTE(id_estudiante),
    es_responsable BIT NOT NULL,
    PRIMARY KEY (id_reserva, id_estudiante)
);
GO