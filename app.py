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
        cursor.execute("EXEC sp_ConsultarDisponibilidad")
        filas = cursor.fetchall()
        
        cubiculos = [{"id_cubiculo": f.id_cubiculo, "numero": f.numero, "tipo": f.tipo, 
        "capacidad_minima": f.capacidad_minima, "estado": f.estado, 
        "se_libera_a": f.se_libera_a.strftime('%Y-%m-%d %H:%M:%S') if f.se_libera_a else None} for f in filas]
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
    id_cubiculo = data.get('id_cubiculo')
    hora_inicio = data.get('hora_inicio')
    integrantes = data.get('integrantes')
    
    if not all([id_cubiculo, hora_inicio, integrantes]):
        return jsonify({"error": "Faltan datos obligatorios para la reserva."}), 400
        
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("EXEC sp_RegistrarReserva @id_cubiculo=?, @hora_inicio=?, @json_integrantes=?", 
        (id_cubiculo, hora_inicio, json.dumps(integrantes)))
        row = cursor.fetchone()
        conn.commit()
        return jsonify({"mensaje": row.mensaje, "id_reserva": row.id_reserva}), 201
    except pyodbc.Error as e:
        conn.rollback()
        error_sql = e.args[1]
        mensaje_limpio = error_sql.split(']')[[-1]].strip() if ']' in error_sql else error_sql
        return jsonify({"error": mensaje_limpio}), 400
    finally:
        if conn: conn.close()

# ==========================================
# ENDPOINT 3: Inicio de Sesión del Personal (RF-07)
# ==========================================
@app.route('/api/login', methods=['POST'])
def login_personal():
    data = request.json
    usuario = data.get('usuario')
    contrasena = data.get('contrasena')

    if not usuario or not contrasena:
        return jsonify({"error": "Usuario y contraseña son requeridos"}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("EXEC sp_ValidarPersonal @usuario=?, @contrasena=?", (usuario, contrasena))
        row = cursor.fetchone()
        
        if row:
            return jsonify({"id_personal": row.id_personal, "usuario": row.usuario, "nombre": row.nombre}), 200
        else:
            return jsonify({"error": "Credenciales inválidas"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

# ==========================================
# ENDPOINT 4: Liberación Manual de Cubículo (RF-06)
# ==========================================
@app.route('/api/reservas/<int:id_reserva>/liberar', methods=['POST'])
def liberar_reserva(id_reserva):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("EXEC sp_LiberarReservaManual @id_reserva=?", (id_reserva,))
        row = cursor.fetchone()
        conn.commit()
        return jsonify({"mensaje": row.mensaje if row else "Operación procesada"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn: conn.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)