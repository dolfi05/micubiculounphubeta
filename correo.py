import os
import smtplib
import ssl
from email.message import EmailMessage


class ErrorCorreo(Exception):
    """No se pudo enviar el correo."""


ASUNTOS = {
    "registro": "Tu código de verificación de MiCubículo",
    "recuperacion": "Código para cambiar tu contraseña de MiCubículo",
}


def enviar_codigo(destino, codigo, proposito):
    # Solo para desarrollo: muestra el codigo en la terminal en vez de enviarlo.
    # Debe quedar en 0 (o no existir) en la entrega final.
    if os.getenv("CODIGOS_EN_CONSOLA") == "1":
        print(f"[DESARROLLO] Codigo para {destino}: {codigo}")
        return

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    puerto = int(os.getenv("SMTP_PORT", "465"))
    usuario = os.getenv("SMTP_USER")
    clave = (os.getenv("SMTP_PASSWORD") or "").replace(" ", "")
    if not usuario or not clave:
        raise ErrorCorreo("Falta configurar SMTP_USER y SMTP_PASSWORD en el archivo .env")

    mensaje = EmailMessage()
    mensaje["Subject"] = ASUNTOS.get(proposito, "Código de MiCubículo")
    mensaje["From"] = os.getenv("SMTP_FROM", usuario)
    mensaje["To"] = destino
    mensaje.set_content(
        f"Hola,\n\nTu código de verificación es: {codigo}\n\n"
        "Vence en 10 minutos. Si no lo pediste tú, ignora este mensaje.\n\n"
        "MiCubículo · Biblioteca UNPHU"
    )

    try:
        with smtplib.SMTP_SSL(host, puerto, context=ssl.create_default_context(), timeout=15) as servidor:
            servidor.login(usuario, clave)
            servidor.send_message(mensaje)
    except (smtplib.SMTPException, OSError) as error:
        raise ErrorCorreo(str(error)) from error