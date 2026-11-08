from flask import Flask, jsonify, request
import pyodbc
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

def get_db_connection():
    try:
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={os.getenv('DB_SERVER')};"
            f"DATABASE={os.getenv('DB_NAME')};"
            f"Trusted_Connection=yes;"
        )
        return pyodbc.connect(conn_str)
    except Exception as e:
        print(f"Error de conexión: {e}")
        return None

# ==========================================
# ENDPOINT 1: Consultar Disponibilidad (RF-01 y RF-04)
# ==========================================
@app.route('/api/cubiculos', methods=['GET'])
def obtener_disponibilidad():
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Error de conexión a la base de datos"}), 500
    
    try:
        cursor = conn.cursor()
        # Ejecutamos el SP que limpia reservas vencidas y trae el estado actual
        cursor.execute("EXEC sp_ConsultarDisponibilidad")
        filas = cursor.fetchall()
        
        cubiculos = []
        for fila in filas:
            cubiculos.append({
                "id_cubiculo": fila.id_cubiculo,
                "numero": fila.numero,
                "tipo": fila.tipo,
                "capacidad_minima": fila.capacidad_minima,
                "estado": fila.estado,
                "se_libera_a": fila.se_libera_a.strftime('%Y-%m-%d %H:%M:%S') if fila.se_libera_a else None
            })
            
        return jsonify(cubiculos), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# ==========================================
# ENDPOINT 2: Registrar Reserva (RF-02 y RF-03)
# ==========================================
@app.route('/api/reservas', methods=['POST'])
def registrar_reserva():
    data = request.json
    
    # Extraemos los datos que nos enviará el Frontend
    id_cubiculo = data.get('id_cubiculo')
    hora_inicio = data.get('hora_inicio') # Formato esperado: 'YYYY-MM-DD HH:MM:SS'
    integrantes = data.get('integrantes') # Ejemplo: [{"id": 1, "resp": 1}, {"id": 2, "resp": 0}]
    
    # Validación básica de datos completos (RF-03)
    if not all([id_cubiculo, hora_inicio, integrantes]):
        return jsonify({"error": "Faltan datos obligatorios para la reserva."}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Error de conexión a la base de datos"}), 500
        
    try:
        cursor = conn.cursor()
        # Convertimos la lista de Python a un string JSON para SQL Server
        json_integrantes = json.dumps(integrantes)
        
        # Ejecutamos el SP de reserva
        cursor.execute("""
            EXEC sp_RegistrarReserva 
            @id_cubiculo=?, @hora_inicio=?, @json_integrantes=?
        """, (id_cubiculo, hora_inicio, json_integrantes))
        
        row = cursor.fetchone()
        conn.commit() # ¡Importante! Guardar los cambios físicos
        
        return jsonify({"mensaje": row.mensaje, "id_reserva": row.id_reserva}), 201
        
    except pyodbc.Error as e:
        conn.rollback() # Si algo falla, deshacemos la transacción
        
        # Extraemos el mensaje de error personalizado que lanzamos desde SQL Server (THROW)
        error_sql = e.args[1]
        
        # Limpiamos el texto del error que devuelve pyodbc para que el Frontend lo muestre bonito
        mensaje_limpio = error_sql.split(']')[[-1]].strip() if ']' in error_sql else error_sql
        
        return jsonify({"error": mensaje_limpio}), 400
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)