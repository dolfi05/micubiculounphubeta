import os

import pyodbc
from dotenv import load_dotenv

load_dotenv()  # lee el archivo .env


def get_connection():
    """Abre una conexion a SQL Server usando los datos del .env."""
    driver = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={os.getenv('DB_SERVER')};"
        f"DATABASE={os.getenv('DB_NAME')};"
        "Trusted_Connection=yes;"
        "TrustServerCertificate=yes;"
    )
    return pyodbc.connect(conn_str)