// Compartido por todas las pantallas del estudiante.
const CLAVE_AVISO = "aviso10-";
let sesionValida = false;

async function cargarSesion() {
  try {
    const respuesta = await fetch("/api/sesion");
    const datos = await respuesta.json();
    if (datos.rol !== "estudiante") {
      window.location.href = "/";   // sin ingreso, de vuelta a la pantalla 1
      return;
    }
    document.getElementById("usuario-nombre").textContent = datos.nombre;
    document.getElementById("usuario-matricula").textContent = datos.matricula;
    sesionValida = true;
    revisarAvisoDiezMinutos();
  } catch (error) {
    window.location.href = "/";
  }
}

document.getElementById("boton-salir").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

// ---------- Aviso de 10 minutos (RF-05): una sola vez por reserva, en cualquier pantalla ----------
// La clave incluye la hora de fin, así los datos de prueba con ids repetidos no se confunden.
function claveDe(r) {
  return CLAVE_AVISO + r.id_reserva + "-" + r.hora_fin;
}

function yaAvisado(r) {
  try { return localStorage.getItem(claveDe(r)) === "1"; } catch (e) { return false; }
}

function marcarAvisado(r) {
  try { localStorage.setItem(claveDe(r), "1"); } catch (e) { /* sin almacenamiento: se ignora */ }
}

function mostrarAviso(reserva) {
  const caja = document.createElement("div");
  caja.className = "aviso-flotante";
  caja.setAttribute("role", "alert");

  const texto = document.createElement("div");
  const titulo = document.createElement("strong");
  titulo.className = "fuente-titulo";
  titulo.textContent = "Faltan 10 minutos";
  const detalle = document.createElement("p");
  detalle.className = "mb-0";
  detalle.textContent =
    "Tu bloque en el cubículo " + reserva.numero + " termina a las " +
    reserva.hora_fin.substring(11, 16) + ". Guarda tus cosas: el cubículo se liberará automáticamente.";
  texto.append(titulo, detalle);

  const acciones = document.createElement("div");
  acciones.className = "d-flex gap-2 flex-shrink-0";
  if (window.location.pathname !== "/mi-reserva") {
    const ver = document.createElement("a");
    ver.href = "/mi-reserva";
    ver.className = "btn btn-verde btn-sm";
    ver.textContent = "Ver mi reserva";
    acciones.appendChild(ver);
  }
  const cerrar = document.createElement("button");
  cerrar.type = "button";
  cerrar.className = "btn btn-salir btn-sm";
  cerrar.textContent = "Entendido";
  cerrar.addEventListener("click", () => {
    marcarAvisado(reserva);   // solo ahora se considera visto
    caja.remove();
  });
  acciones.appendChild(cerrar);

  caja.append(texto, acciones);
  document.body.appendChild(caja);
}

async function revisarAvisoDiezMinutos() {
  if (!sesionValida) return;
  if (document.querySelector(".aviso-flotante")) return;   // ya hay uno en pantalla
  try {
    const respuesta = await fetch("/api/mi-reserva");
    if (!respuesta.ok) return;
    const r = (await respuesta.json()).reserva;
    if (!r || r.estado !== "activa" || r.segundos_restantes === null) return;
    if (r.segundos_restantes > 0 && r.segundos_restantes <= 600 && !yaAvisado(r)) {
      mostrarAviso(r);   // se marca como visto al pulsar "Entendido"
    }
  } catch (error) { /* se reintenta en la próxima revisión */ }
}

setInterval(revisarAvisoDiezMinutos, 15000);   // revisa cada 15 segundos

cargarSesion();