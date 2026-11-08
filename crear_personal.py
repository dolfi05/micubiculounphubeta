import getpass

from werkzeug.security import generate_password_hash

from db import get_connection

usuario = input("Usuario: ").strip()
nombre = input("Nombre completo: ").strip()
contrasena = getpass.getpass("Contrasena (no se vera al escribir): ")
repetir = getpass.getpass("Repite la contrasena: ")

if not usuario or not nombre or not contrasena:
    raise SystemExit("Todos los campos son obligatorios.")
if contrasena != repetir:
    raise SystemExit("Las contrasenas no coinciden.")

hash_real = generate_password_hash(contrasena)

conn = get_connection()
cursor = conn.cursor()
cursor.execute("SELECT 1 FROM PERSONAL WHERE usuario = ?", (usuario,))
if cursor.fetchone():
    cursor.execute(
        "UPDATE PERSONAL SET contrasena_hash = ?, nombre = ? WHERE usuario = ?",
        (hash_real, nombre, usuario),
    )
    print("Usuario actualizado.")
else:
    cursor.execute(
        "INSERT INTO PERSONAL (usuario, contrasena_hash, nombre) VALUES (?, ?, ?)",
        (usuario, hash_real, nombre),
    )
    print("Usuario creado.")
conn.commit()
conn.close()