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
- `sqlcmd` (viene con SSMS o con las utilidades de línea de comandos de SQL Server)

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

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar_bd.ps1 -Datos
```

Este script crea la base si no existe, aplica las migraciones e instala todos los procedimientos almacenados. Si la base ya existe, conserva sus datos.

- Con `-Datos` también carga estudiantes y reservas de prueba.
- Con `-Unir` no instala nada: genera `Database/Instalacion_Completa.sql`, un único archivo para quien solo tenga SSMS y no `sqlcmd`.

Para comprobar la conexión: `python verificar_conexion.py`.

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
instalar_bd.ps1        instalación de la base de datos
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