"""Arranque para la entrega y la defensa: sin modo debug y con la liberacion automatica activa."""
import os
import threading

from waitress import serve

from app import app, finalizar_vencidas_periodicamente


def main():
    if not os.environ.get("SECRET_KEY"):
        raise SystemExit("Falta SECRET_KEY en el archivo .env")
    if os.environ.get("CODIGOS_EN_CONSOLA") == "1":
        print("AVISO: CODIGOS_EN_CONSOLA=1. Los codigos se imprimen aqui y NO se envian por correo.")

    app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")

    # Libera por si sola las reservas vencidas y marca las no presentadas (cada 30 s)
    threading.Thread(target=finalizar_vencidas_periodicamente, daemon=True).start()

    host = os.environ.get("HOST", "127.0.0.1")
    puerto = int(os.environ.get("PORT", "5000"))
    print(f"MiCubiculo en http://{host}:{puerto}  (Ctrl+C para detener)")
    serve(app, host=host, port=puerto, threads=8)


if __name__ == "__main__":
    main()