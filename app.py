import os
import re
from functools import wraps

import pyodbc
from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
from werkzeug.security import check_password_hash

from db import get_connection

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")
if not app.secret_key:
    raise RuntimeError("Falta SECRET_KEY en el archivo .env")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,   # JavaScript no puede leer la cookie
    SESSION_COOKIE_SAMESITE="Lax",  # evita que otras paginas la envien
)

MATRICULA_VALIDA = re.compile(r"^\d{2}-\d{4}$")  # formato 24-0302


# ------------------------------------------------------------------
# Utilidades
# ------------------------------------------------------------------
def limpiar_error_sql(error):
    """Deja solo el mensaje que escribimos en el THROW de SQL Server."""
    texto = str(error.args[1]) if len(error.args) > 1 else str(error)
    texto = re.sub(r"^(\[[^\]]*\]\s*)+", "", texto)                 # quita [42000] [Microsoft]...
    texto = re.sub(r"\s*\(\d+\)(\s*\(SQLExecDirectW\))?\s*$", "", texto)  # quita (50010) (SQLExecDirectW)
    return texto.strip()


def codigo_error_sql(error):
    """Devuelve el numero del THROW (50002, 50010, 1205...) o None."""
    texto = str(error.args[1]) if len(error.args) > 1 else str(error)
    m = re.search(r"\((\d+)\)(\s*\(SQLExecDirectW\))?\s*$", texto.strip())
    return int(m.group(1)) if m else None


def consultar(sql, params=()):
    """Ejecuta un SELECT o EXEC y devuelve todas las filas."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        return cursor.fetchall()
    finally:
        conn.close()


def personal_requerido(f):
    """Bloquea la ruta si no hay personal con sesion iniciada."""
    @wraps(f)
    def envoltura(*args, **kwargs):
        if "personal" not in session:
            return jsonify({"error": "Debes iniciar sesion como personal."}), 401
        return f(*args, **kwargs)
    return envoltura


def estudiante_requerido(f):
    """Bloquea la ruta si el estudiante no ha ingresado con nombre y matricula."""
    @wraps(f)
    def envoltura(*args, **kwargs):
        if "estudiante" not in session:
            return jsonify({"error": "Ingresa con tu nombre y matricula."}), 401
        return f(*args, **kwargs)
    return envoltura


@app.errorhandler(pyodbc.Error)
def error_de_base_de_datos(error):
    app.logger.exception("Error de base de datos")
    return jsonify({"error": "No se pudo acceder a la base de datos. Intenta de nuevo."}), 500


# ------------------------------------------------------------------
# Sesion
# ------------------------------------------------------------------
@app.route("/api/sesion", methods=["GET"])
def ver_sesion():
    """Dice quien tiene la sesion abierta (lo usara el frontend)."""
    if "personal" in session:
        return jsonify({"rol": "personal", **session["personal"]}), 200
    if "estudiante" in session:
        return jsonify({"rol": "estudiante", **session["estudiante"]}), 200
    return jsonify({"rol": None}), 200


@app.route("/api/ingreso", methods=["POST"])
def ingreso_estudiante():
    """El estudiante entra con nombre y matricula, sin contrasena."""
    datos = request.get_json(silent=True) or {}
    nombre = (datos.get("nombre") or "").strip()
    matricula = (datos.get("matricula") or "").strip()

    errores = []
    if not nombre:
        errores.append("Escribe tu nombre completo.")
    elif len(nombre) > 100:
        errores.append("El nombre es demasiado largo (maximo 100 caracteres).")
    if not matricula:
        errores.append("Escribe tu matricula.")
    elif not MATRICULA_VALIDA.match(matricula):
        errores.append("La matricula no es valida. Usa el formato 24-0302.")
    if errores:
        return jsonify({"error": " | ".join(errores)}), 400

    session.clear()
    session["estudiante"] = {"nombre": nombre, "matricula": matricula}
    return jsonify({"nombre": nombre, "matricula": matricula}), 200


@app.route("/api/login", methods=["POST"])
def login_personal():
    datos = request.get_json(silent=True) or {}
    usuario = (datos.get("usuario") or "").strip()
    contrasena = datos.get("contrasena") or ""

    if not usuario or not contrasena:
        return jsonify({"error": "Usuario y contrasena son requeridos."}), 400

    filas = consultar("EXEC sp_ValidarPersonal @usuario = ?", (usuario,))
    fila = filas[0] if filas else None

    # Mismo mensaje si el usuario no existe o la clave esta mal:
    # asi no se revela cuales usuarios existen.
    if fila is None or not check_password_hash(fila.contrasena_hash, contrasena):
        return jsonify({"error": "Credenciales invalidas. El usuario o la contrasena no son correctos."}), 401

    session.clear()
    session["personal"] = {"id_personal": fila.id_personal, "usuario": fila.usuario, "nombre": fila.nombre}
    return jsonify(session["personal"]), 200


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"mensaje": "Sesion cerrada."}), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)