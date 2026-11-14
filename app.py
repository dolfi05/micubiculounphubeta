import hashlib
import hmac
import json
import os
import secrets
import re
import time
import threading
from datetime import datetime
from functools import wraps

import pyodbc
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_connection
from correo import ErrorCorreo, enviar_codigo

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
    texto = re.sub(r"^(\[[^\]]*\]\s*)+", "", texto)                       # quita [42000] [Microsoft]...
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
    """Dice quien tiene la sesion abierta (lo usa el frontend)."""
    if "personal" in session:
        return jsonify({"rol": "personal", **session["personal"]}), 200
    if "estudiante" in session:
        return jsonify({"rol": "estudiante", **session["estudiante"]}), 200
    return jsonify({"rol": None}), 200







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
# Utilidades de reservas
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
    if not valor_hora:
        raise ValueError("Escribe la hora de inicio.")
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
# Disponibilidad (estudiante y personal)
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
# Reservas del estudiante
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

@app.route("/api/mis-reservas", methods=["GET"])
@estudiante_requerido
def mis_reservas():
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "EXEC sp_ReservasDeEstudiante @matricula = ?", (session["estudiante"]["matricula"],)
        )
        filas = cursor.fetchall()
        cursor.nextset()   # pasa al segundo resultado: los integrantes
        miembros = cursor.fetchall()
        conn.commit()      # guarda la auto-liberacion de reservas vencidas
    finally:
        conn.close()

    por_reserva = {}
    for m in miembros:
        por_reserva.setdefault(m.id_reserva, []).append({
            "matricula": m.matricula,
            "nombre": m.nombre,
            "es_responsable": bool(m.es_responsable),
        })

    reservas = [{
        "id_reserva": f.id_reserva,
        "numero": f.numero,
        "tipo": f.tipo,
        "estado": f.estado,
        "hora_inicio": iso(f.hora_inicio),
        "hora_fin": iso(f.hora_fin),
        "cantidad_integrantes": f.cantidad_integrantes,
        "es_responsable": bool(f.es_responsable),
        "segundos_restantes": f.segundos_restantes,
        "segundos_para_inicio": f.segundos_para_inicio,
        "integrantes": por_reserva.get(f.id_reserva, []),
    } for f in filas]
    return jsonify(reservas), 200


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
# Panel del personal (todas protegidas)
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
        "pendientes": f.pendientes,
    } for f in filas]
    resumen = {
        "libres": sum(1 for c in cubiculos if c["estado"] == "disponible"),
        "ocupados": sum(1 for c in cubiculos if c["estado"] == "ocupado"),
        "por_vencer": sum(1 for c in cubiculos if c["nivel"] in ("por_vencer", "urgente")),
    }
    return jsonify({"resumen": resumen, "cubiculos": cubiculos}), 200

@app.route("/api/cubiculos/<int:id_cubiculo>/reservas", methods=["GET"])
@personal_requerido
def reservas_de_cubiculo(id_cubiculo):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("EXEC sp_ReservasDeCubiculo @id_cubiculo = ?", (id_cubiculo,))
        filas = cursor.fetchall()
        cursor.nextset()   # pasa al segundo resultado: los integrantes
        miembros = cursor.fetchall()
        conn.commit()      # guarda la auto-liberacion de reservas vencidas
    except pyodbc.Error as error:
        conn.rollback()
        if codigo_error_sql(error) == 50030:
            return jsonify({"error": limpiar_error_sql(error)}), 404
        raise
    finally:
        conn.close()

    por_reserva = {}
    for m in miembros:
        por_reserva.setdefault(m.id_reserva, []).append({
            "matricula": m.matricula,
            "nombre": m.nombre,
            "es_responsable": bool(m.es_responsable),
        })

    return jsonify([{
        "id_reserva": f.id_reserva,
        "estado": f.estado,
        "hora_inicio": iso(f.hora_inicio),
        "hora_fin": iso(f.hora_fin),
        "cantidad_integrantes": f.cantidad_integrantes,
        "segundos_restantes": f.segundos_restantes,
        "segundos_para_inicio": f.segundos_para_inicio,
        "entrega_confirmada": bool(f.entrega_confirmada),
        "entrega_hora": iso(f.entrega_hora),
        "puede_confirmar": bool(f.puede_confirmar),
        "integrantes": por_reserva.get(f.id_reserva, []),
    } for f in filas]), 200

@app.route("/api/reservas/<int:id_reserva>/entrega", methods=["POST"])
@personal_requerido
def confirmar_entrega(id_reserva):
    sesion = session.get("personal")
    id_personal = sesion.get("id_personal") if isinstance(sesion, dict) else sesion

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "EXEC sp_ConfirmarEntrega @id_reserva = ?, @id_personal = ?",
            (id_reserva, id_personal),
        )
        conn.commit()
    except pyodbc.Error as error:
        conn.rollback()
        codigo = codigo_error_sql(error)
        if codigo == 50020:
            return jsonify({"error": limpiar_error_sql(error)}), 404
        if codigo in (50021, 50050, 50051):
            return jsonify({"error": limpiar_error_sql(error)}), 409
        raise
    finally:
        conn.close()

    return jsonify({"ok": True}), 200

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

def finalizar_vencidas_periodicamente(intervalo=30):
    """Cada 'intervalo' segundos pasa a finalizada toda reserva cuya hora de fin ya paso (RF-04)."""
    while True:
        try:
            conn = get_connection()
            try:
                conn.cursor().execute("EXEC sp_FinalizarVencidas")
                conn.commit()
            finally:
                conn.close()
        except Exception:
            app.logger.exception("No se pudieron finalizar las reservas vencidas")
        time.sleep(intervalo)

# ------------------------------------------------------------------
# Cuentas de estudiantes: registro, login y recuperacion
# ------------------------------------------------------------------
# Correo como da20-0099@unphu.edu.do: el grupo capturado es la matricula
CORREO_INSTITUCIONAL = re.compile(r"^[a-z]+(\d{2}-\d{4})@unphu\.edu\.do$")
HASH_FALSO = generate_password_hash("contrasena-falsa-para-igualar-tiempos")
MENSAJES_CODIGO = {
    "invalido": ("El codigo no es correcto.", 400),
    "vencido": ("El codigo vencio. Pide uno nuevo.", 400),
    "bloqueado": ("Demasiados intentos. Pide un codigo nuevo.", 429),
}


def datos_json():
    return request.get_json(silent=True) or {}


def hash_codigo(correo, proposito, codigo):
    """El codigo nunca se guarda: solo este hash, firmado con la SECRET_KEY."""
    mensaje = f"{correo}|{proposito}|{codigo}".encode()
    return hmac.new(app.secret_key.encode(), mensaje, hashlib.sha256).hexdigest()


def validar_contrasena(contrasena, repetir):
    if len(contrasena) < 8:
        return "La contrasena debe tener al menos 8 caracteres."
    if len(contrasena) > 128:
        return "La contrasena es demasiado larga."
    if not re.search(r"[A-Za-z]", contrasena) or not re.search(r"\d", contrasena):
        return "La contrasena debe tener letras y numeros."
    if contrasena != repetir:
        return "Las contrasenas no coinciden."
    return None


def validar_datos_registro(nombre, matricula, correo):
    errores = []
    if not nombre:
        errores.append("Escribe tu nombre completo.")
    elif len(nombre) > 100:
        errores.append("El nombre es demasiado largo (maximo 100 caracteres).")
    if not MATRICULA_VALIDA.match(matricula):
        errores.append("La matricula no es valida. Usa el formato 24-0302.")
    coincide = CORREO_INSTITUCIONAL.match(correo)
    if not coincide:
        errores.append("Usa tu correo institucional, por ejemplo da20-0099@unphu.edu.do.")
    elif coincide.group(1) != matricula:
        errores.append("La matricula del correo no coincide con la matricula que escribiste.")
    return errores


def enviar_nuevo_codigo(correo, proposito):
    codigo = f"{secrets.randbelow(1_000_000):06d}"
    consultar(
        "EXEC sp_SolicitarCodigo @correo = ?, @proposito = ?, @codigo_hash = ?",
        (correo, proposito, hash_codigo(correo, proposito, codigo)),
    )
    enviar_codigo(correo, codigo, proposito)


def revisar_codigo(correo, proposito, codigo):
    """Devuelve None si el codigo es correcto, o una respuesta de error lista para enviar."""
    if not re.fullmatch(r"\d{6}", codigo or ""):
        return jsonify({"error": "El codigo tiene 6 digitos."}), 400
    filas = consultar(
        "EXEC sp_VerificarCodigo @correo = ?, @proposito = ?, @codigo_hash = ?",
        (correo, proposito, hash_codigo(correo, proposito, codigo)),
    )
    estado = filas[0].estado
    if estado == "ok":
        return None
    mensaje, http = MENSAJES_CODIGO.get(estado, MENSAJES_CODIGO["invalido"])
    return jsonify({"error": mensaje}), http


def error_de_cuentas(error):
    estados = {50040: 429, 50041: 400, 50043: 409, 50044: 409, 50045: 404}
    codigo = codigo_error_sql(error)
    if codigo in estados:
        return jsonify({"error": limpiar_error_sql(error)}), estados[codigo]
    raise error


def error_de_correo(error):
    app.logger.error("No se pudo enviar el correo: %s", error)
    return jsonify({"error": "No pudimos enviar el correo. Intenta de nuevo en un momento."}), 502


# ---------- Registro ----------
@app.route("/api/registro/solicitar", methods=["POST"])
def registro_solicitar():
    d = datos_json()
    nombre = (d.get("nombre") or "").strip()
    matricula = (d.get("matricula") or "").strip()
    correo = (d.get("correo") or "").strip().lower()

    errores = validar_datos_registro(nombre, matricula, correo)
    if errores:
        return jsonify({"error": " | ".join(errores), "errores": errores}), 400
    try:
        consultar("EXEC sp_ComprobarRegistro @matricula = ?, @correo = ?", (matricula, correo))
        enviar_nuevo_codigo(correo, "registro")
    except pyodbc.Error as error:
        return error_de_cuentas(error)
    except ErrorCorreo as error:
        return error_de_correo(error)
    return jsonify({"mensaje": "Te enviamos un codigo de 6 digitos a " + correo}), 200


@app.route("/api/registro/verificar", methods=["POST"])
def registro_verificar():
    d = datos_json()
    correo = (d.get("correo") or "").strip().lower()
    rechazo = revisar_codigo(correo, "registro", (d.get("codigo") or "").strip())
    if rechazo:
        return rechazo
    return jsonify({"mensaje": "Codigo correcto."}), 200


@app.route("/api/registro/completar", methods=["POST"])
def registro_completar():
    d = datos_json()
    nombre = (d.get("nombre") or "").strip()
    matricula = (d.get("matricula") or "").strip()
    correo = (d.get("correo") or "").strip().lower()
    codigo = (d.get("codigo") or "").strip()
    contrasena = d.get("contrasena") or ""

    errores = validar_datos_registro(nombre, matricula, correo)
    problema = validar_contrasena(contrasena, d.get("repetir") or "")
    if problema:
        errores.append(problema)
    if errores:
        return jsonify({"error": " | ".join(errores), "errores": errores}), 400

    rechazo = revisar_codigo(correo, "registro", codigo)   # cuenta los intentos fallidos
    if rechazo:
        return rechazo
    try:
        filas = consultar(
            "EXEC sp_CrearCuenta @nombre = ?, @matricula = ?, @correo = ?, "
            "@contrasena_hash = ?, @codigo_hash = ?",
            (nombre, matricula, correo, generate_password_hash(contrasena),
             hash_codigo(correo, "registro", codigo)),
        )
    except pyodbc.Error as error:
        return error_de_cuentas(error)

    cuenta = filas[0]
    session.clear()
    session["estudiante"] = {"nombre": cuenta.nombre, "matricula": cuenta.matricula}
    return jsonify(session["estudiante"]), 201


# ---------- Login del estudiante ----------
@app.route("/api/login-estudiante", methods=["POST"])
def login_estudiante():
    d = datos_json()
    identificador = (d.get("identificador") or "").strip().lower()
    contrasena = d.get("contrasena") or ""
    if not identificador or not contrasena:
        return jsonify({"error": "Escribe tu matricula o correo y tu contrasena."}), 400

    filas = consultar("EXEC sp_ObtenerCuenta @identificador = ?", (identificador,))
    cuenta = filas[0] if filas else None
    # Se compara siempre contra algun hash para que no se note si la cuenta existe
    correcta = check_password_hash(cuenta.contrasena_hash if cuenta else HASH_FALSO, contrasena)
    if cuenta is None or not correcta:
        return jsonify({"error": "La matricula, el correo o la contrasena no son correctos."}), 401

    session.clear()
    session["estudiante"] = {"nombre": cuenta.nombre, "matricula": cuenta.matricula}
    return jsonify(session["estudiante"]), 200


# ---------- Recuperar contrasena ----------
@app.route("/api/recuperar/solicitar", methods=["POST"])
def recuperar_solicitar():
    correo = (datos_json().get("correo") or "").strip().lower()
    if not CORREO_INSTITUCIONAL.match(correo):
        return jsonify({"error": "Escribe tu correo institucional."}), 400
    try:
        if consultar("EXEC sp_ObtenerCuenta @identificador = ?", (correo,)):
            enviar_nuevo_codigo(correo, "recuperacion")
    except pyodbc.Error as error:
        if codigo_error_sql(error) != 50040:   # el limite de pedidos no revela si hay cuenta
            raise
    except ErrorCorreo as error:
        return error_de_correo(error)
    # Misma respuesta exista o no la cuenta
    return jsonify({"mensaje": "Si el correo tiene una cuenta, te enviamos un codigo de 6 digitos."}), 200


@app.route("/api/recuperar/verificar", methods=["POST"])
def recuperar_verificar():
    d = datos_json()
    correo = (d.get("correo") or "").strip().lower()
    rechazo = revisar_codigo(correo, "recuperacion", (d.get("codigo") or "").strip())
    if rechazo:
        return rechazo
    return jsonify({"mensaje": "Codigo correcto."}), 200


@app.route("/api/recuperar/cambiar", methods=["POST"])
def recuperar_cambiar():
    d = datos_json()
    correo = (d.get("correo") or "").strip().lower()
    codigo = (d.get("codigo") or "").strip()
    contrasena = d.get("contrasena") or ""

    problema = validar_contrasena(contrasena, d.get("repetir") or "")
    if problema:
        return jsonify({"error": problema, "errores": [problema]}), 400
    rechazo = revisar_codigo(correo, "recuperacion", codigo)
    if rechazo:
        return rechazo
    try:
        consultar(
            "EXEC sp_CambiarContrasena @correo = ?, @contrasena_hash = ?, @codigo_hash = ?",
            (correo, generate_password_hash(contrasena), hash_codigo(correo, "recuperacion", codigo)),
        )
    except pyodbc.Error as error:
        return error_de_cuentas(error)
    session.clear()
    return jsonify({"mensaje": "Contrasena actualizada. Ya puedes iniciar sesion."}), 200


# ------------------------------------------------------------------
# Paginas (HTML)
# ------------------------------------------------------------------
@app.route("/")
def pagina_ingreso():
    return render_template("ingreso.html")

@app.route("/registro")
def pagina_registro():
    return render_template("registro.html")


@app.route("/recuperar")
def pagina_recuperar():
    return render_template("recuperar.html")


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
    # Con debug=True Flask crea dos procesos; solo el real lleva WERKZEUG_RUN_MAIN
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        threading.Thread(target=finalizar_vencidas_periodicamente, daemon=True).start()
    app.run(debug=True, port=5000)