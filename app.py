from flask import Flask, jsonify
import pyodbc
import os
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
        conn = pyodbc.connect(conn_str)
        return conn
    except Exception as e:
        print(f"Error de conexión: {e}")
        return None

@app.route('/api/estado', methods=['GET'])
def probar_estado():
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "No se pudo conectar a la base de datos local."}), 500

    conn.close()
    return jsonify({"mensaje": "Backend operativo mediante Windows Authentication."}), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)