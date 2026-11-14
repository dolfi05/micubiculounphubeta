# Instala la base de datos de MiCubiculo en el orden correcto.
#   .\instalar_bd.ps1          crea la base si no existe y aplica migraciones y procedimientos
#   .\instalar_bd.ps1 -Datos   ademas carga los datos de prueba (Inyeccion_Prueba.sql)
#   .\instalar_bd.ps1 -Unir    no ejecuta nada: genera Database\Instalacion_Completa.sql con todo junto
param(
    [switch]$Datos,
    [switch]$Unir
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

# --- Lee el .env ---
if (-not (Test-Path ".env")) { throw "No existe el archivo .env en la carpeta del proyecto." }
$conf = @{}
foreach ($linea in Get-Content ".env") {
    $l = $linea.Trim()
    if ($l -eq "" -or $l.StartsWith("#")) { continue }
    $i = $l.IndexOf("=")
    if ($i -gt 0) { $conf[$l.Substring(0, $i).Trim()] = $l.Substring($i + 1).Trim().Trim('"').Trim("'") }
}
$servidor = $conf["DB_SERVER"]
$base = $conf["DB_NAME"]
if (-not $servidor -or -not $base) { throw "Faltan DB_SERVER o DB_NAME en el archivo .env" }

# sqlcmd no siempre entiende "." como equipo local
if ($servidor -eq ".") { $servidor = "localhost" }
elseif ($servidor.StartsWith(".\")) { $servidor = "localhost" + $servidor.Substring(1) }

# --- Reune los archivos SQL en el orden de instalacion ---
$dir = Join-Path (Get-Location) "Database"
$creacion = Get-ChildItem $dir -Recurse -Filter "DB_Creaci*.sql" | Select-Object -First 1
if (-not $creacion) { throw "No se encontro DB_Creacion.sql dentro de la carpeta Database." }

$migraciones = foreach ($nombre in @("Migracion_Cuentas.sql", "Migracion_Entrega.sql", "Migracion_NoPresentado.sql")) {
    $f = Get-ChildItem $dir -Recurse -Filter $nombre | Select-Object -First 1
    if (-not $f) { throw "Falta el archivo $nombre en la carpeta Database." }
    $f
}
$procedimientos = Get-ChildItem $dir -Recurse -Filter "sp_*.sql" | Sort-Object Name
$datosSql = Get-ChildItem $dir -Recurse -Filter "Inyeccion_Prueba.sql" | Select-Object -First 1

$usados = @($creacion) + @($migraciones) + @($procedimientos)
if ($datosSql) { $usados += $datosSql }
$otros = Get-ChildItem $dir -Recurse -Filter "*.sql" | Where-Object { $usados.FullName -notcontains $_.FullName }

# --- Modo -Unir: un solo archivo ---
if ($Unir) {
    $lista = @($creacion) + @($migraciones) + @($procedimientos)
    if ($Datos -and $datosSql) { $lista += $datosSql }
    $salida = Join-Path $dir "Instalacion_Completa.sql"
    $partes = foreach ($a in $lista) {
        "-- ===== " + $a.Name + " =====`r`n" + (Get-Content $a.FullName -Raw -Encoding UTF8) + "`r`nGO`r`n"
    }
    Set-Content -Path $salida -Value $partes -Encoding UTF8
    Write-Host "Generado: $salida"
    Write-Host "Ejecutenlo en SSMS solo sobre un servidor nuevo (incluye la creacion de la base)."
    exit 0
}

# --- Modo normal: ejecuta con sqlcmd (autenticacion de Windows) ---
if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    throw "No se encontro sqlcmd. Usen .\instalar_bd.ps1 -Unir y ejecuten el archivo generado en SSMS."
}

function Ejecutar($archivo) {
    Write-Host "  -> $($archivo.Name)"
    & sqlcmd -S $servidor -E -C -b -f 65001 -i $archivo.FullName
    if ($LASTEXITCODE -ne 0) { throw "Fallo al ejecutar $($archivo.Name)" }
}

# Comprueba la conexion y si la base ya existe (se guarda toda la salida para mostrar el error real)
$respuesta = & sqlcmd -S $servidor -E -C -h -1 -W -Q "SET NOCOUNT ON; SELECT CASE WHEN DB_ID('$base') IS NULL THEN 0 ELSE 1 END" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "No se pudo conectar a '$servidor'. Detalle de sqlcmd:`n$(($respuesta | ForEach-Object { "$_" }) -join "`n")"
}
$existe = $respuesta | ForEach-Object { "$_".Trim() } | Where-Object { $_ -match '^[01]$' } | Select-Object -First 1

if ($existe -eq "0") {
    Write-Host "Creando la base $base..."
    Ejecutar $creacion
} elseif ($existe -eq "1") {
    Write-Host "La base $base ya existe: no se vuelve a crear (se conservan sus datos)."
} else {
    throw "Respuesta inesperada de sqlcmd:`n$(($respuesta | ForEach-Object { "$_" }) -join "`n")"
}

Write-Host "Migraciones:"
foreach ($m in $migraciones) { Ejecutar $m }

Write-Host "Procedimientos almacenados:"
foreach ($p in $procedimientos) { Ejecutar $p }

if ($Datos) {
    if ($datosSql) {
        Write-Host "Datos de prueba:"
        Ejecutar $datosSql
    } else {
        Write-Warning "No se encontro Inyeccion_Prueba.sql."
    }
}

if ($otros) {
    Write-Host ""
    Write-Host "Estos archivos .sql NO se ejecutaron (revisen si hacen falta):"
    $otros | ForEach-Object { Write-Host "  - $($_.Name)" }
}
Write-Host ""
Write-Host "Base de datos lista."