import json
import os
import re
import time
from datetime import datetime
from functools import wraps

import pyodbc
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session
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
        filas = cursor.fetchall()
        conn.commit()  # guarda la auto-liberacion de reservas vencidas
        return filas
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

def usuario_requerido(f):
    """Deja pasar a un estudiante que ingreso o a personal con sesion."""
    @wraps(f)
    def envoltura(*args, **kwargs):
        if "personal" not in session and "estudiante" not in session:
            return jsonify({"error": "Debes ingresar primero."}), 401
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

# ------------------------------------------------------------------
# Parte 6B: utilidades
# ------------------------------------------------------------------
def iso(valor):
    """Convierte una fecha a texto como 2026-11-09T10:00:00 (o None)."""
    return valor.isoformat(timespec="seconds") if valor else None


def nivel_de(segundos):
    """Mismos colores de la leyenda: urgente < 10 min, por vencer < 30 min."""
    if segundos is None:
        return "disponible"
    if segundos <= 600:
        return "urgente"
    if segundos <= 1800:
        return "por_vencer"
    return "ocupado"


def leer_datos_reserva(datos):
    """Valida lo basico del cuerpo y devuelve (id_cubiculo, hora_inicio, integrantes)."""
    try:
        id_cubiculo = int(datos.get("id_cubiculo"))
    except (TypeError, ValueError):
        raise ValueError("Falta elegir el cubiculo.")

    valor_hora = datos.get("hora_inicio")
    if valor_hora in (None, "", "ahora"):
        hora_inicio = None  # None significa "Ahora"
    else:
        try:
            hora_inicio = datetime.fromisoformat(str(valor_hora))
        except ValueError:
            raise ValueError("La hora de inicio no tiene un formato valido.")

    lista = datos.get("integrantes")
    if not isinstance(lista, list):
        raise ValueError("Faltan los datos de los integrantes.")

    integrantes = []
    for item in lista:
        item = item if isinstance(item, dict) else {}
        integrantes.append({
            "matricula": str(item.get("matricula") or "").strip(),
            "nombre": str(item.get("nombre") or "").strip(),
        })
    return id_cubiculo, hora_inicio, integrantes


def cantidad_no_coincide(datos, integrantes):
    """RF-03: la cantidad declarada debe coincidir con los integrantes enviados."""
    declarada = datos.get("cantidad")
    if declarada is None:
        return None
    try:
        declarada = int(declarada)
    except (TypeError, ValueError):
        return "La cantidad de integrantes no es valida."
    if declarada != len(integrantes):
        return (f"La cantidad declarada ({declarada}) no coincide con "
                f"las matriculas indicadas ({len(integrantes)}).")
    return None


def guardar_reserva(id_cubiculo, hora_inicio, integrantes):
    """Llama a sp_RegistrarReserva. El primer integrante es el responsable.
    Devuelve (fila, None) si sale bien o (None, (codigo, mensaje)) si hay un error esperado."""
    json_integrantes = json.dumps([
        {"matricula": i["matricula"], "nombre": i["nombre"], "resp": 1 if n == 0 else 0}
        for n, i in enumerate(integrantes)
    ])
    for intento in range(3):
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "EXEC sp_RegistrarReserva @id_cubiculo = ?, @json_integrantes = ?, @hora_inicio = ?",
                (id_cubiculo, json_integrantes, hora_inicio),
            )
            fila = cursor.fetchone()
            conn.commit()
            return fila, None
        except pyodbc.Error as error:
            conn.rollback()
            codigo = codigo_error_sql(error)
            if error.args[0] == "40001" or codigo == 1205:  # deadlock: reintentar
                if intento < 2:
                    time.sleep(0.3)
                    continue
                return None, (1205, "El sistema esta ocupado. Intenta de nuevo.")
            if codigo in (50002, 50003, 50010):
                return None, (codigo, limpiar_error_sql(error))
            raise
        finally:
            conn.close()


def respuesta_error_reserva(codigo, mensaje):
    if codigo == 50010:
        return jsonify({"error": mensaje, "errores": mensaje.split(" | "), "tipo": "validacion"}), 400
    if codigo == 50002:
        return jsonify({"error": mensaje, "tipo": "cubiculo_ocupado"}), 409
    if codigo == 50003:
        return jsonify({"error": mensaje, "tipo": "integrante_ocupado"}), 409
    return jsonify({"error": mensaje, "tipo": "reintentar"}), 503


def respuesta_validacion(mensaje):
    return jsonify({"error": mensaje, "errores": [mensaje], "tipo": "validacion"}), 400


def detalle_de_reserva(id_reserva):
    """Lee los dos resultados de sp_DetalleReserva (reserva e integrantes)."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("EXEC sp_DetalleReserva @id_reserva = ?", (id_reserva,))
        r = cursor.fetchone()
        cursor.nextset()  # pasa al segundo resultado
        filas = cursor.fetchall()
    finally:
        conn.close()
    return {
        "id_reserva": r.id_reserva,
        "numero": r.numero,
        "tipo": r.tipo,
        "estado": r.estado,
        "hora_inicio": iso(r.hora_inicio),
        "hora_fin": iso(r.hora_fin),
        "cantidad_integrantes": r.cantidad_integrantes,
        "integrantes": [
            {"matricula": f.matricula, "nombre": f.nombre, "es_responsable": bool(f.es_responsable)}
            for f in filas
        ],
    }


# ------------------------------------------------------------------
# Parte 6B: disponibilidad (estudiante y personal)
# ------------------------------------------------------------------
@app.route("/api/cubiculos", methods=["GET"])
@usuario_requerido
def obtener_disponibilidad():
    filas = consultar("EXEC sp_ConsultarDisponibilidad")
    cubiculos = [{
        "id_cubiculo": f.id_cubiculo,
        "numero": f.numero,
        "tipo": f.tipo,
        "capacidad_minima": f.capacidad_minima,
        "estado": f.estado,
        "nivel": nivel_de(f.segundos_restantes),
        "se_libera_a": iso(f.se_libera_a),
        "segundos_restantes": f.segundos_restantes,
        "proxima_reserva": iso(f.proxima_reserva),
    } for f in filas]
    return jsonify(cubiculos), 200


@app.route("/api/cubiculos/<int:id_cubiculo>/horas", methods=["GET"])
@usuario_requerido
def horas_disponibles(id_cubiculo):
    try:
        filas = consultar("EXEC sp_HorasDisponibles @id_cubiculo = ?", (id_cubiculo,))
    except pyodbc.Error as error:
        if codigo_error_sql(error) == 50030:
            return jsonify({"error": limpiar_error_sql(error)}), 404
        raise
    horas = [{
        "es_ahora": bool(f.es_ahora),
        "hora_inicio": iso(f.hora_inicio),
        "hora_fin": iso(f.hora_fin),
        "etiqueta": ("Ahora (" + f.hora_inicio.strftime("%H:%M") + ")") if f.es_ahora
                    else f.hora_inicio.strftime("%H:%M"),
    } for f in filas]
    return jsonify(horas), 200

@app.route("/api/cubiculos/<int:id_cubiculo>/ocupadas", methods=["GET"])
@usuario_requerido
def horas_ocupadas(id_cubiculo):
    try:
        filas = consultar("EXEC sp_HorasOcupadas @id_cubiculo = ?", (id_cubiculo,))
    except pyodbc.Error as error:
        if codigo_error_sql(error) == 50030:
            return jsonify({"error": limpiar_error_sql(error)}), 404
        raise
    return jsonify([
        {"hora_inicio": iso(f.hora_inicio), "hora_fin": iso(f.hora_fin)} for f in filas
    ]), 200


# ------------------------------------------------------------------
# Parte 6B: reservas del estudiante
# ------------------------------------------------------------------
@app.route("/api/reservas", methods=["POST"])
@estudiante_requerido
def crear_reserva():
    datos = request.get_json(silent=True) or {}
    try:
        id_cubiculo, hora_inicio, otros = leer_datos_reserva(datos)
    except ValueError as error:
        return respuesta_validacion(str(error))

    # El primer integrante (el responsable) es quien ingreso: sale de la sesion
    yo = session["estudiante"]
    integrantes = [{"matricula": yo["matricula"], "nombre": yo["nombre"]}] + otros

    problema = cantidad_no_coincide(datos, integrantes)
    if problema:
        return respuesta_validacion(problema)

    fila, error = guardar_reserva(id_cubiculo, hora_inicio, integrantes)
    if error:
        return respuesta_error_reserva(*error)
    return jsonify({
        "mensaje": fila.mensaje,
        "id_reserva": fila.id_reserva,
        "hora_inicio": iso(fila.hora_inicio),
        "hora_fin": iso(fila.hora_fin),
    }), 201


@app.route("/api/mi-reserva", methods=["GET"])
@estudiante_requerido
def mi_reserva():
    filas = consultar(
        "EXEC sp_ReservaDeEstudiante @matricula = ?", (session["estudiante"]["matricula"],)
    )
    if not filas:
        return jsonify({"reserva": None}), 200
    f = filas[0]
    detalle = detalle_de_reserva(f.id_reserva)
    segundos = f.segundos_restantes
    return jsonify({"reserva": {
        "id_reserva": f.id_reserva,
        "numero": f.numero,
        "tipo": f.tipo,
        "estado": f.estado,
        "hora_inicio": iso(f.hora_inicio),
        "hora_fin": iso(f.hora_fin),
        "cantidad_integrantes": f.cantidad_integrantes,
        "es_responsable": bool(f.es_responsable),
        "segundos_restantes": segundos,
        "aviso_10_min": segundos is not None and 0 < segundos <= 600,
        "integrantes": detalle["integrantes"],
    }}), 200

@app.route("/api/mi-reserva/cancelar", methods=["POST"])
@estudiante_requerido
def cancelar_mi_reserva():
    datos = request.get_json(silent=True) or {}
    try:
        id_reserva = int(datos.get("id_reserva"))
    except (TypeError, ValueError):
        return jsonify({"error": "Falta indicar la reserva."}), 400

    conn = get_connection()
    try:
        cursor = conn.cursor()
        # La matricula sale de la sesion, nunca de lo que envie el navegador
        cursor.execute(
            "EXEC sp_CancelarReserva @id_reserva = ?, @matricula = ?",
            (id_reserva, session["estudiante"]["matricula"]),
        )
        fila = cursor.fetchone()
        conn.commit()
        return jsonify({"mensaje": "Reserva cancelada.",
                        "numero_cubiculo": fila.numero_cubiculo}), 200
    except pyodbc.Error as error:
        conn.rollback()
        codigo = codigo_error_sql(error)
        if codigo == 50020:
            return jsonify({"error": limpiar_error_sql(error)}), 404
        if codigo == 50021:
            return jsonify({"error": limpiar_error_sql(error)}), 409
        if codigo == 50022:
            return jsonify({"error": limpiar_error_sql(error)}), 403
        raise
    finally:
        conn.close()


# ------------------------------------------------------------------
# Parte 6B: panel del personal (todas protegidas)
# ------------------------------------------------------------------
@app.route("/api/panel", methods=["GET"])
@personal_requerido
def panel_ocupacion():
    filas = consultar("EXEC sp_PanelOcupacion")
    cubiculos = [{
        "id_cubiculo": f.id_cubiculo,
        "numero": f.numero,
        "tipo": f.tipo,
        "capacidad_minima": f.capacidad_minima,
        "estado": f.estado,
        "nivel": nivel_de(f.segundos_restantes),
        "id_reserva": f.id_reserva,
        "responsable_nombre": f.responsable_nombre,
        "responsable_matricula": f.responsable_matricula,
        "cantidad_integrantes": f.cantidad_integrantes,
        "hora_inicio": iso(f.hora_inicio),
        "hora_fin": iso(f.hora_fin),
        "segundos_restantes": f.segundos_restantes,
        "proxima_reserva": iso(f.proxima_reserva),
    } for f in filas]
    resumen = {
        "libres": sum(1 for c in cubiculos if c["estado"] == "disponible"),
        "ocupados": sum(1 for c in cubiculos if c["estado"] == "ocupado"),
        "por_vencer": sum(1 for c in cubiculos if c["nivel"] in ("por_vencer", "urgente")),
    }
    return jsonify({"resumen": resumen, "cubiculos": cubiculos}), 200


@app.route("/api/reservas/<int:id_reserva>", methods=["GET"])
@personal_requerido
def ver_reserva(id_reserva):
    try:
        return jsonify(detalle_de_reserva(id_reserva)), 200
    except pyodbc.Error as error:
        if codigo_error_sql(error) == 50020:
            return jsonify({"error": limpiar_error_sql(error)}), 404
        raise


@app.route("/api/reservas/presencial", methods=["POST"])
@personal_requerido
def crear_reserva_presencial():
    datos = request.get_json(silent=True) or {}
    try:
        id_cubiculo, hora_inicio, integrantes = leer_datos_reserva(datos)
    except ValueError as error:
        return respuesta_validacion(str(error))

    # Aqui el primer integrante enviado es el responsable
    problema = cantidad_no_coincide(datos, integrantes)
    if problema:
        return respuesta_validacion(problema)

    fila, error = guardar_reserva(id_cubiculo, hora_inicio, integrantes)
    if error:
        return respuesta_error_reserva(*error)
    return jsonify({
        "mensaje": fila.mensaje,
        "id_reserva": fila.id_reserva,
        "hora_inicio": iso(fila.hora_inicio),
        "hora_fin": iso(fila.hora_fin),
    }), 201


@app.route("/api/reservas/<int:id_reserva>/liberar", methods=["POST"])
@personal_requerido
def liberar_reserva(id_reserva):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("EXEC sp_LiberarReservaManual @id_reserva = ?", (id_reserva,))
        fila = cursor.fetchone()
        conn.commit()
        return jsonify({"mensaje": "Cubiculo liberado exitosamente.",
                        "numero_cubiculo": fila.numero_cubiculo}), 200
    except pyodbc.Error as error:
        conn.rollback()
        codigo = codigo_error_sql(error)
        if codigo == 50020:
            return jsonify({"error": limpiar_error_sql(error)}), 404
        if codigo == 50021:
            return jsonify({"error": limpiar_error_sql(error)}), 409
        raise
    finally:
        conn.close()

# ------------------------------------------------------------------
# Paginas (HTML)
# ------------------------------------------------------------------
@app.route("/")
def pagina_ingreso():
    return render_template("ingreso.html")

@app.route("/disponibilidad")
def pagina_disponibilidad():
    return render_template("disponibilidad.html", seccion="disponibilidad")

@app.route("/reservar/<int:numero>")
def pagina_reservar(numero):
    return render_template("reservar.html", seccion="disponibilidad", numero=numero)


@app.route("/reserva-confirmada")
def pagina_reserva_confirmada():
    return render_template("confirmada.html", seccion="reserva")


@app.route("/reserva-conflicto")
def pagina_reserva_conflicto():
    return render_template("conflicto.html", seccion="disponibilidad")

@app.route("/mi-reserva")
def pagina_mi_reserva():
    return render_template("mi_reserva.html", seccion="reserva")

@app.route("/personal")
def pagina_login_personal():
    return render_template("personal_login.html")


@app.route("/panel")
def pagina_panel():
    return render_template("panel.html", seccion="panel")

@app.route("/registro-presencial")
def pagina_registro_presencial():
    return render_template("registro_presencial.html", seccion="registro")

if __name__ == "__main__":
    app.run(debug=True, port=5000)
