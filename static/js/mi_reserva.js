const $ = (id) => document.getElementById(id);

let items = [];        // una entrada por reserva, con referencias a su tarjeta
let pendiente = null;  // reserva que se quiere cancelar

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

// ---------- Una tarjeta por reserva ----------
function crearTarjeta(r) {
  const tipo = r.estado !== "activa" ? "finalizada"
    : (r.segundos_restantes !== null ? "en_curso" : "proxima");
  const item = {
    r, tipo,
    restante: r.segundos_restantes,
    falta: r.segundos_para_inicio,
    duracion: Math.max(1, (new Date(r.hora_fin) - new Date(r.hora_inicio)) / 1000),
  };

  const tarjeta = el("div", "tarjeta-reserva" + (tipo === "finalizada" ? " tarjeta-reserva-pasada" : ""));

  // Cabecera: número, etiqueta de estado y tipo
  const cabecera = el("div", "d-flex justify-content-between align-items-center flex-wrap gap-2");
  const izquierda = el("div", "d-flex align-items-center gap-3");
  izquierda.appendChild(el("span", "cubiculo-numero", String(r.numero)));
  const clase = { en_curso: "e-disponible", proxima: "e-por_vencer", finalizada: "e-ocupado" }[tipo];
  const texto = { en_curso: "En curso", proxima: "Próxima", finalizada: "Finalizada" }[tipo];
  izquierda.appendChild(el("span", "etiqueta " + clase, texto));
  if (r.tipo === "especial") izquierda.appendChild(el("span", "insignia-grupos", "Grupos 7+"));
  cabecera.appendChild(izquierda);
  cabecera.appendChild(el("div", "fw-semibold", hora(r.hora_inicio) + " – " + hora(r.hora_fin)));
  tarjeta.appendChild(cabecera);

  // Reloj (solo en curso o próxima)
  if (tipo !== "finalizada") {
    const bloque = el("div", "text-center my-3");
    bloque.appendChild(el("div", "etiqueta-mayus",
      tipo === "en_curso" ? "TIEMPO RESTANTE" : "EMPIEZA EN"));
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
  if (tipo !== "finalizada" && r.es_responsable) {
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
    } else if (item.tipo === "proxima") {
      item.falta--;
      if (item.falta <= 0) recargar = true;
    }
    pintar(item);
  }
  if (recargar) cargar();   // alguna empezó o terminó: pedir el estado real
}

// ---------- Carga ----------
async function cargar() {
  try {
    const respuesta = await fetch("/api/mis-reservas");
    if (respuesta.status === 401) { window.location.href = "/"; return; }
    const reservas = await respuesta.json();
    if (!respuesta.ok) throw new Error(reservas.error || "Error");

    items = reservas.map(crearTarjeta);
    const activas = items.filter((i) => i.tipo !== "finalizada");
    const terminadas = items.filter((i) => i.tipo === "finalizada");

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