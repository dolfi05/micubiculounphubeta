const $ = (id) => document.getElementById(id);
const vistas = ["vista-ninguna", "vista-activa", "vista-termino"];

let reserva = null;
let restante = null;   // segundos que faltan para terminar (si ya empezó)
let faltaInicio = null; // segundos que faltan para empezar (si es futura)
let duracionTotal = 7200;
let temporizador = null;

function hora(textoIso) {
  return textoIso.substring(11, 16);
}

function formato(segundos) {
  const s = Math.max(0, segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n) => String(n).padStart(2, "0");
  return h > 0 ? h + ":" + dos(m) + ":" + dos(seg) : dos(m) + ":" + dos(seg);
}

function mostrar(vista) {
  $("estado-cargando").classList.add("d-none");
  for (const v of vistas) $(v).classList.toggle("d-none", v !== vista);
}

// ---------- Aviso de 10 minutos: una sola vez por reserva ----------
function claveAviso() {
  return "aviso10-" + reserva.id_reserva;
}

function yaAvisado() {
  try { return localStorage.getItem(claveAviso()) === "1"; } catch (e) { return false; }
}

function marcarAvisado() {
  try { localStorage.setItem(claveAviso(), "1"); } catch (e) { /* sin almacenamiento: se ignora */ }
}

function revisarAviso() {
  if (restante === null || restante <= 0 || restante > 600) return;
  $("reloj").classList.add("reloj-rojo");
  $("barra").classList.add("barra-roja");
  $("boton-entendido-caja").classList.remove("d-none");
  if (!yaAvisado()) {
    $("aviso-10-texto").textContent =
      "Tu bloque en el cubículo " + reserva.numero + " termina a las " + hora(reserva.hora_fin) +
      ". Guarda tus cosas: el cubículo se liberará automáticamente.";
    $("aviso-10").classList.remove("d-none");
    marcarAvisado();   // ya se mostró: no vuelve a salir si recargas
  }
}

$("boton-entendido").addEventListener("click", () => $("aviso-10").classList.add("d-none"));

// ---------- Dibujo ----------
function pintar() {
  if (restante !== null) {
    $("reloj").textContent = formato(restante);
    $("barra").style.width = Math.min(100, Math.max(0, (restante / duracionTotal) * 100)) + "%";
    revisarAviso();
  } else if (faltaInicio !== null) {
    $("reloj").textContent = formato(faltaInicio);
  }
}

function tic() {
  if (restante !== null) {
    restante--;
    if (restante <= 0) { cargar(); return; }   // terminó: pedir el estado real
  } else if (faltaInicio !== null) {
    faltaInicio--;
    if (faltaInicio <= 0) { cargar(); return; }
  }
  pintar();
}

async function cargar() {
  try {
    const respuesta = await fetch("/api/mi-reserva");
    if (respuesta.status === 401) { window.location.href = "/"; return; }
    const datos = await respuesta.json();
    reserva = datos.reserva;

    if (!reserva) { mostrar("vista-ninguna"); return; }

    const horario = hora(reserva.hora_inicio) + " – " + hora(reserva.hora_fin);

    if (reserva.estado !== "activa") {
      $("t-cubiculo").textContent = "Cubículo " + reserva.numero;
      $("t-horario").textContent = horario;
      $("t-cantidad").textContent = reserva.cantidad_integrantes;
      $("termino-texto").textContent = "El cubículo " + reserva.numero + " ya quedó disponible para otras personas.";
      mostrar("vista-termino");
      return;
    }

    $("d-numero").textContent = reserva.numero;
    $("d-horario").textContent = horario;
    $("d-cantidad").textContent = reserva.cantidad_integrantes;
    duracionTotal = Math.max(
      1, (new Date(reserva.hora_fin) - new Date(reserva.hora_inicio)) / 1000);

    if (reserva.segundos_restantes !== null) {
      restante = reserva.segundos_restantes;    // ya empezó: cuenta regresiva
      faltaInicio = null;
      $("etiqueta-tiempo").textContent = "TIEMPO RESTANTE";
      $("reloj-unidad").textContent = restante >= 3600 ? "horas : minutos : segundos" : "minutos : segundos";
    } else {
      // Reserva futura: segundos hasta que empiece, calculados con las horas del servidor
      restante = null;
      faltaInicio = Math.max(
        1, Math.round((new Date(reserva.hora_inicio) - new Date(reserva.hora_fin)) / 1000) + duracionTotal);
      $("etiqueta-tiempo").textContent = "TU BLOQUE EMPIEZA A LAS " + hora(reserva.hora_inicio);
      $("reloj-unidad").textContent = "tiempo para que empiece";
      $("barra").style.width = "0%";
    }
    mostrar("vista-activa");
    pintar();
  } catch (error) {
    $("estado-cargando").textContent = "No pudimos cargar tu reserva. Reintentando...";
    $("estado-cargando").classList.remove("d-none");
  }
}

cargar();
temporizador = setInterval(tic, 1000);
setInterval(cargar, 30000);   // corrige desvíos y detecta cuándo termina