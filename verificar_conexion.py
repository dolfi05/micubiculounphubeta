from db import get_connection

conn = get_connection()
cursor = conn.cursor()
cursor.execute("SELECT DB_NAME() AS base, (SELECT COUNT(*) FROM CUBICULO) AS cubiculos")
fila = cursor.fetchone()
print(f"Conectado a {fila.base}. Cubiculos encontrados: {fila.cubiculos}")
conn.close()