// Compartido por todas las pantallas del estudiante.
const CLAVE_AVISO = "aviso10-";
const TOLERANCIA_ENTREGA_MIN = 10;   // debe coincidir con sp_MarcarNoPresentados
let sesionValida = false;

// Hora "HH:mm" de una fecha ISO desplazada algunos minutos (también hacia atrás)
function horaDesplazada(textoIso, minutos) {
  const d = new Date(textoIso);
  d.setMinutes(d.getMinutes() + minutos);
  return d.toTimeString().substring(0, 5);
}

function horaLimiteEntrega(r) {
  return horaDesplazada(r.hora_inicio, TOLERANCIA_ENTREGA_MIN);
}

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
    revisarAvisos();
  } catch (error) {
    window.location.href = "/";
  }
}

document.getElementById("boton-salir").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

// ---------- Avisos: una sola vez por reserva, en cualquier pantalla ----------
function yaVisto(clave) {
  try { return localStorage.getItem(clave) === "1"; } catch (e) { return false; }
}

function marcarVisto(clave) {
  try { localStorage.setItem(clave, "1"); } catch (e) { /* sin almacenamiento: se ignora */ }
}

function mostrarAviso(aviso) {
  const caja = document.createElement("div");
  caja.className = "aviso-flotante";
  caja.setAttribute("role", "alert");

  const texto = document.createElement("div");
  const titulo = document.createElement("strong");
  titulo.className = "fuente-titulo";
  titulo.textContent = aviso.titulo;
  const detalle = document.createElement("p");
  detalle.className = "mb-0";
  detalle.textContent = aviso.detalle;
  texto.append(titulo, detalle);

  const acciones = document.createElement("div");
  acciones.className = "d-flex gap-2 flex-shrink-0";
  if (window.location.pathname !== "/mi-reserva") {
    const ver = document.createElement("a");
    ver.href = "/mi-reserva";
    ver.className = "btn btn-verde btn-sm";
    ver.textContent = "Ver mis reservas";
    acciones.appendChild(ver);
  }
  const cerrar = document.createElement("button");
  cerrar.type = "button";
  cerrar.className = "btn btn-salir btn-sm";
  cerrar.textContent = "Entendido";
  cerrar.addEventListener("click", () => {
    marcarVisto(aviso.clave);   // solo ahora se considera visto
    caja.remove();
  });
  acciones.appendChild(cerrar);

  caja.append(texto, acciones);
  document.body.appendChild(caja);
}

// Devuelve el aviso más importante que falte por mostrar, o null
function elegirAviso(reservas) {
  const hi = (r) => r.hora_inicio.substring(11, 16);
  const hf = (r) => r.hora_fin.substring(11, 16);

  // 1) Reserva cancelada por no recoger la llave y los carnés
  const noPresentada = reservas.find((x) =>
    x.estado === "no_presentado" && !yaVisto("nopres-" + x.id_reserva + "-" + x.hora_inicio));
  if (noPresentada) {
    return {
      clave: "nopres-" + noPresentada.id_reserva + "-" + noPresentada.hora_inicio,
      titulo: "Tu reserva fue cancelada",
      detalle: "Tu reserva del cubículo " + noPresentada.numero + " (" + hi(noPresentada) + " – " +
        hf(noPresentada) + ") se canceló porque no se recogieron la llave y los carnés antes de las " +
        horaLimiteEntrega(noPresentada) + ". Puedes hacer una nueva reserva si el cubículo sigue libre.",
    };
  }

  // 2) Ya es hora de recoger la llave: desde 10 minutos antes del inicio
  const porRecoger = reservas.find((x) =>
    x.estado === "activa" && !x.entrega_confirmada &&
    x.segundos_limite_entrega !== null && x.segundos_limite_entrega > 0 &&
    (x.segundos_para_inicio === null || x.segundos_para_inicio <= 600) &&
    !yaVisto("recoger-" + x.id_reserva + "-" + x.hora_inicio));
  if (porRecoger) {
    return {
      clave: "recoger-" + porRecoger.id_reserva + "-" + porRecoger.hora_inicio,
      titulo: "Recoge la llave y entrega los carnés",
      detalle: "Tu reserva del cubículo " + porRecoger.numero + " empieza a las " + hi(porRecoger) +
        ". Pasa por el mostrador antes de las " + horaLimiteEntrega(porRecoger) +
        " para que el personal confirme la entrega de la llave y los carnés. Si no, la reserva se cancelará automáticamente.",
    };
  }

  // 3) Faltan 10 minutos para que termine el bloque (RF-05)
  const porTerminar = reservas.find((x) =>
    x.estado === "activa" && x.entrega_confirmada && x.segundos_restantes !== null &&
    x.segundos_restantes > 0 && x.segundos_restantes <= 600 &&
    !yaVisto(CLAVE_AVISO + x.id_reserva + "-" + x.hora_fin));
  if (porTerminar) {
    return {
      clave: CLAVE_AVISO + porTerminar.id_reserva + "-" + porTerminar.hora_fin,
      titulo: "Faltan 10 minutos",
      detalle: "Tu bloque en el cubículo " + porTerminar.numero + " termina a las " + hf(porTerminar) +
        ". Guarda tus cosas: el cubículo se liberará automáticamente.",
    };
  }
  return null;
}

async function revisarAvisos() {
  if (!sesionValida) return;
  if (document.querySelector(".aviso-flotante")) return;   // ya hay uno en pantalla
  try {
    const respuesta = await fetch("/api/mis-reservas");
    if (!respuesta.ok) return;
    const aviso = elegirAviso(await respuesta.json());
    if (aviso) mostrarAviso(aviso);
  } catch (error) { /* se reintenta en la próxima revisión */ }
}

setInterval(revisarAvisos, 15000);   // revisa cada 15 segundos

cargarSesion();