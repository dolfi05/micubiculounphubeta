# MiCubículo

Sistema de reserva de cubículos de estudio para la Biblioteca UNPHU. Hecho con Flask, SQL Server y Bootstrap.

## Qué hace

**Estudiantes**
- Crean su cuenta con nombre, matrícula y correo institucional. Un código enviado al correo verifica el registro.
- Recuperan la contraseña con un código enviado al correo.
- Ven la disponibilidad de los 10 cubículos y reservan eligiendo la hora con un selector (minutos de 1 en 1).
- Un cubículo ocupado puede reservarse en otro horario libre.
- "Mis reservas" muestra todas sus reservas del día; el responsable puede cancelarlas.
- Reciben avisos: recoger la llave (desde 10 minutos antes), faltan 10 minutos para terminar y reserva cancelada por no presentarse.

**Personal de la biblioteca**
- Panel de ocupación con el estado de cada cubículo, actualizado cada 15 segundos.
- Ventana por cubículo con todas sus reservas y el grupo completo, con opción de liberar o cancelar.
- Botón para confirmar la entrega de carnés y llave, disponible desde 10 minutos antes del inicio.
- Registro de reservas presenciales (se consideran con la entrega ya confirmada).

## Reglas del sistema

- Horario: lunes a viernes con último inicio a las 19:00; sábado con último inicio a las 13:00; domingo cerrado.
- Cada reserva dura 2 horas. Una persona no puede estar en dos reservas al mismo tiempo, ni se pueden cruzar dos reservas en un mismo cubículo.
- Los cubículos para grupos (7+ personas) exigen una cantidad mínima de integrantes mayor.
- Liberación automática: al llegar la hora de fin, la reserva pasa a finalizada y el cubículo queda libre.
- No presentado: si 10 minutos después del inicio el personal no confirmó la entrega de carnés y llave, la reserva se cancela sola y el cubículo se libera.

## Requisitos

- Windows con Python 3.10 o superior
- SQL Server (autenticación de Windows) y SSMS
- ODBC Driver 17 o 18 para SQL Server

## Instalación

```powershell
git clone <URL del repositorio>
cd micubiculounphubeta
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Abre `.env` y completa los valores (el archivo nunca se sube a GitHub). `SECRET_KEY` se genera con:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Los códigos de verificación se envían desde una cuenta de Gmail del proyecto. Sus credenciales (`SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`) están solo en el `.env` de quien administra el sistema y no forman parte del repositorio. Quien ejecute el proyecto sin esas credenciales puede poner `CODIGOS_EN_CONSOLA=1` en su `.env`: así el código de verificación aparece en la terminal en lugar de enviarse por correo. Quien quiera enviar correos reales con su propia cuenta de Gmail debe generar una contraseña de aplicación en su cuenta de Google (Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones).

### Base de datos

La base de datos se instala ejecutando los archivos `.sql` de la carpeta `Database/` **desde SQL Server Management Studio (SSMS)**. No se usa ningún script de instalación: así cada archivo se ejecuta con la configuración correcta de SQL Server y los errores se ven al momento.

**Cómo ejecutar cada archivo en SSMS**

1. Abre SSMS y conéctate a tu servidor con autenticación de Windows.
2. Menú `Archivo → Abrir → Archivo...` y elige el `.sql`.
3. Pulsa `F5` (Ejecutar). En la pestaña **Mensajes** debe decir `Commands completed successfully`.
4. Si aparece un error, corrígelo antes de continuar con el siguiente archivo.

**Orden de instalación**

Ejecuta los archivos en este orden, todos dentro de la carpeta `Database/`:

1. `DB_Creacion.sql`: crea la base `MiCubiculoDB` y sus tablas. Solo en un servidor nuevo; si la base ya existe, sáltalo para no perder datos.
2. `Migracion_Cuentas.sql`: cuentas de estudiantes y códigos de verificación.
3. `Migracion_Entrega.sql`: entrega de carnés y llave.
4. `Migracion_NoPresentado.sql`: estado de reserva "no presentado".
5. Todos los `sp_*.sql`: procedimientos almacenados. Se ejecutan uno por uno, en cualquier orden.
6. `Inyeccion_Prueba.sql`: opcional, estudiantes y reservas de prueba.

Cada archivo de procedimientos empieza con `SET QUOTED_IDENTIFIER ON` y usa `CREATE OR ALTER PROCEDURE`, así que se puede volver a ejecutar sin perder datos.

**Reinstalar o actualizar un procedimiento:** abre su `sp_*.sql` y ejecútalo con `F5`. No hace falta tocar la base ni los datos.

**Comprobar que quedó bien.** Esta consulta no debe devolver filas (todos los procedimientos deben tener la opción activa):

```sql
USE MiCubiculoDB;
SELECT OBJECT_NAME(object_id) AS procedimiento
FROM sys.sql_modules
WHERE OBJECT_NAME(object_id) LIKE 'sp[_]%'
  AND uses_quoted_identifier = 0
  AND OBJECT_NAME(object_id) NOT LIKE 'sp[_]%diagram%'
  AND OBJECT_NAME(object_id) <> 'sp_upgraddiagrams';
```

Si la consulta devuelve algún nombre, abre el `.sql` de ese procedimiento y ejecútalo otra vez en SSMS.

Para comprobar la conexión desde Python: `python verificar_conexion.py`.

### Ejecutar

```powershell
python run.py
```

Abre http://127.0.0.1:5000. Para desarrollo con recarga automática se puede usar `python app.py`.

## Estructura

```
app.py                 rutas y lógica del servidor
correo.py              envío de códigos por correo
run.py                 arranque sin modo debug (entrega y defensa)
Database/              creación, migraciones y procedimientos almacenados
templates/             pantallas (Jinja)
static/css, js, img    estilos, scripts e imágenes
```

## Decisiones de diseño

- Toda la lógica de reservas vive en procedimientos almacenados con errores propios (`THROW`). La reserva usa transacción `SERIALIZABLE` con reintento ante deadlock, para evitar dobles reservas simultáneas.
- Las contraseñas se guardan con hash (Werkzeug). Los códigos de verificación se guardan solo como HMAC-SHA256 con la clave del servidor, expiran a los 10 minutos y tienen límite de intentos y de envíos.
- Todas las consultas están parametrizadas y el navegador escribe los datos con `textContent`, sin insertar HTML.
- La liberación automática corre cada 30 segundos y, además, las consultas de estado la aplican al leer.

## Flujo de trabajo del equipo

Una rama por funcionalidad. La persona que escribe sube la rama y abre el Pull Request; la otra lo revisa, aprueba y hace el merge a `main`. El archivo `.env` nunca se versiona.

## Mejoras futuras

- Inicio de sesión con Google.
- Bloqueo temporal de la cuenta tras varios intentos fallidos.
- Aviso por correo cuando una reserva se cancela por no presentarse.
- Gestión de renovaciones
- Lista de espera por orden de llegada
- Reportes de ocupación por cubículo y horario

## Equipo

Stacy Alcántara (24-0509), Dolfi Alvarez (24-0081) y Emil Rafael Dirocie
(25-0681)