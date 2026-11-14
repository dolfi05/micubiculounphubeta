const $ = (id) => document.getElementById(id);

let items = [];        // una entrada por reserva, con referencias a su tarjeta
let pendiente = null;  // reserva que se quiere cancelar
let ultimaCarga = 0;

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

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;   // textContent: nunca insertamos HTML ajeno
  return e;
}

// proxima: aún no empieza · por_entregar: ya empezó pero el personal no confirmó la entrega
// en_curso: entrega confirmada · finalizada · no_presentado
function tipoDe(r) {
  if (r.estado === "no_presentado") return "no_presentado";
  if (r.estado !== "activa") return "finalizada";
  if (r.segundos_restantes === null) return "proxima";
  return r.entrega_confirmada ? "en_curso" : "por_entregar";
}

const esPasada = (tipo) => tipo === "finalizada" || tipo === "no_presentado";

const CLASES = {
  en_curso: "e-disponible", por_entregar: "e-por_vencer", proxima: "e-por_vencer",
  finalizada: "e-ocupado", no_presentado: "e-urgente",
};
const TEXTOS = {
  en_curso: "En curso", por_entregar: "Pendiente de entrega", proxima: "Próxima",
  finalizada: "Finalizada", no_presentado: "Cancelada: no se presentó",
};

// ---------- Una tarjeta por reserva ----------
function crearTarjeta(r) {
  const tipo = tipoDe(r);
  const item = {
    r, tipo,
    restante: r.segundos_restantes,
    falta: r.segundos_para_inicio,
    limite: r.segundos_limite_entrega,
    duracion: Math.max(1, (new Date(r.hora_fin) - new Date(r.hora_inicio)) / 1000),
  };

  const tarjeta = el("div", "tarjeta-reserva" + (esPasada(tipo) ? " tarjeta-reserva-pasada" : ""));

  // Cabecera: número, etiqueta de estado y tipo
  const cabecera = el("div", "d-flex justify-content-between align-items-center flex-wrap gap-2");
  const izquierda = el("div", "d-flex align-items-center gap-3 flex-wrap");
  izquierda.appendChild(el("span", "cubiculo-numero", String(r.numero)));
  izquierda.appendChild(el("span", "etiqueta " + CLASES[tipo], TEXTOS[tipo]));
  if (r.tipo === "especial") izquierda.appendChild(el("span", "insignia-grupos", "Grupos 7+"));
  cabecera.appendChild(izquierda);
  cabecera.appendChild(el("div", "fw-semibold", hora(r.hora_inicio) + " – " + hora(r.hora_fin)));
  tarjeta.appendChild(cabecera);

  // Reloj (todo menos las ya pasadas)
  if (!esPasada(tipo)) {
    const bloque = el("div", "text-center my-3");
    const etiqueta = { en_curso: "TIEMPO RESTANTE", por_entregar: "SE CANCELA EN", proxima: "EMPIEZA EN" }[tipo];
    bloque.appendChild(el("div", "etiqueta-mayus", etiqueta));
    item.reloj = el("div", "reloj-chico");
    bloque.appendChild(item.reloj);
    if (tipo === "en_curso") {
      const barra = el("div", "barra-progreso");
      item.relleno = el("div", "barra-relleno");
      barra.appendChild(item.relleno);
      bloque.appendChild(barra);
    }
    tarjeta.appendChild(bloque);
  }

  // Estado de la entrega de carnés y llave
  const limite = horaDesplazada(r.hora_inicio, 10);
  if (tipo === "proxima") {
    tarjeta.appendChild(el("div", "aviso-entrega mb-3",
      "Recoge la llave y entrega los carnés en el mostrador entre las " +
      horaDesplazada(r.hora_inicio, -10) + " y las " + limite +
      ". Si el personal no confirma la entrega a tiempo, la reserva se cancelará automáticamente."));
  } else if (tipo === "por_entregar") {
    tarjeta.appendChild(el("div", "aviso-entrega mb-3",
      "El personal aún no confirmó la entrega. Acércate al mostrador con los carnés de todos los " +
      "integrantes antes de las " + limite + " o la reserva se cancelará. Hasta entonces no puedes usar el cubículo."));
  } else if (tipo === "en_curso") {
    tarjeta.appendChild(el("div", "aviso-entrega aviso-entrega-ok mb-3",
      "✓ Carnés y llave entregados a las " + hora(r.entrega_hora)));
  } else if (tipo === "no_presentado") {
    tarjeta.appendChild(el("div", "aviso-entrega aviso-entrega-mal mb-3",
      "Esta reserva se canceló automáticamente porque no se recogieron la llave y los carnés antes de las " +
      limite + ". El cubículo quedó libre para otras personas."));
  }

  // Integrantes
  tarjeta.appendChild(el("div", "text-secondary small mb-1",
    "Integrantes (" + r.cantidad_integrantes + ")"));
  const lista = el("ul", "lista-integrantes mb-0");
  for (const i of r.integrantes) {
    const li = el("li");
    li.appendChild(el("span", "", i.nombre + (i.es_responsable ? " · responsable" : "")));
    li.appendChild(el("span", "text-secondary", i.matricula));
    lista.appendChild(li);
  }
  tarjeta.appendChild(lista);

  // Cancelar: solo si la reserva sigue activa y eres el responsable
  if (!esPasada(tipo) && r.es_responsable) {
    const boton = el("button", "btn btn-rojo btn-sm mt-3", "Cancelar reserva");
    boton.type = "button";
    boton.addEventListener("click", () => abrirCancelar(item));
    tarjeta.appendChild(boton);
  }

  item.tarjeta = tarjeta;
  pintar(item);
  return item;
}

function pintar(item) {
  if (item.tipo === "en_curso") {
    item.reloj.textContent = formato(item.restante);
    item.relleno.style.width = Math.min(100, Math.max(0, (item.restante / item.duracion) * 100)) + "%";
    const urgente = item.restante <= 600;   // el aviso en sí lo muestra estudiante.js
    item.reloj.classList.toggle("reloj-rojo", urgente);
    item.relleno.classList.toggle("barra-roja", urgente);
  } else if (item.tipo === "por_entregar") {
    item.reloj.textContent = formato(item.limite);
    item.reloj.classList.toggle("reloj-rojo", item.limite <= 180);
  } else if (item.tipo === "proxima") {
    item.reloj.textContent = formato(item.falta);
  }
}

function tic() {
  let recargar = false;
  for (const item of items) {
    if (item.tipo === "en_curso") {
      item.restante--;
      if (item.restante <= 0) recargar = true;
    } else if (item.tipo === "por_entregar") {
      item.limite--;
      if (item.limite <= 0) recargar = true;
    } else if (item.tipo === "proxima") {
      item.falta--;
      if (item.falta <= 0) recargar = true;
    }
    pintar(item);
  }
  // alguna empezó o terminó: pedir el estado real (sin saturar al servidor)
  if (recargar && Date.now() - ultimaCarga > 5000) cargar();
}

// ---------- Carga ----------
async function cargar() {
  ultimaCarga = Date.now();
  try {
    const respuesta = await fetch("/api/mis-reservas");
    if (respuesta.status === 401) { window.location.href = "/"; return; }
    const reservas = await respuesta.json();
    if (!respuesta.ok) throw new Error(reservas.error || "Error");

    items = reservas.map(crearTarjeta);
    const activas = items.filter((i) => !esPasada(i.tipo));
    const terminadas = items.filter((i) => esPasada(i.tipo));

    $("lista-activas").replaceChildren(...activas.map((i) => i.tarjeta));
    $("lista-terminadas").replaceChildren(...terminadas.map((i) => i.tarjeta));
    $("seccion-activas").classList.toggle("d-none", activas.length === 0);
    $("seccion-terminadas").classList.toggle("d-none", terminadas.length === 0);
    $("sin-activas").classList.toggle("d-none", activas.length > 0);
    $("estado-cargando").classList.add("d-none");
  } catch (error) {
    console.error(error);
    $("estado-cargando").textContent = "No pudimos cargar tus reservas. Reintentando...";
    $("estado-cargando").classList.remove("d-none");
  }
}

// ---------- Cancelar reserva (solo el responsable) ----------
const modalCancelar = new bootstrap.Modal($("modal-cancelar"));

function abrirCancelar(item) {
  pendiente = item;
  const r = item.r;
  $("texto-cancelar").textContent = item.tipo === "proxima"
    ? "Se cancelará tu reserva del cubículo " + r.numero + " de " + hora(r.hora_inicio) + " a " + hora(r.hora_fin) + "."
    : "El cubículo " + r.numero + " se liberará ahora mismo y quedará disponible para otras personas.";
  modalCancelar.show();
}

$("confirmar-cancelar").addEventListener("click", async () => {
  if (!pendiente) return;
  const confirmar = $("confirmar-cancelar");
  const cajaError = $("cancelar-error");
  confirmar.disabled = true;
  confirmar.textContent = "Cancelando...";
  cajaError.classList.add("d-none");
  try {
    const respuesta = await fetch("/api/mi-reserva/cancelar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_reserva: pendiente.r.id_reserva }),
    });
    if (respuesta.status === 401) { window.location.href = "/"; return; }
    const datos = await respuesta.json().catch(() => ({}));
    modalCancelar.hide();
    if (!respuesta.ok) {
      cajaError.textContent = datos.error || "No se pudo cancelar la reserva.";
      cajaError.classList.remove("d-none");
    }
    await cargar();   // la reserva pasa a "Terminadas hoy"
  } catch (error) {
    modalCancelar.hide();
    cajaError.textContent = "No pudimos conectar con el servidor.";
    cajaError.classList.remove("d-none");
  } finally {
    confirmar.disabled = false;
    confirmar.textContent = "Sí, cancelar reserva";
    pendiente = null;
  }
});

cargar();
setInterval(tic, 1000);
setInterval(cargar, 30000);   // corrige desvíos y detecta cambios