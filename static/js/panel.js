const $ = (id) => document.getElementById(id);
const filas = $("filas");
const avisoError = $("aviso-error");
const modal = new bootstrap.Modal($("modal-reservas"));
const ETIQUETAS = { disponible: "Disponible", ocupado: "Ocupado", por_vencer: "Por vencer", urgente: "Urgente" };

let cubiculoAbierto = null;   // cubículo cuya ventana está abierta

function hora(textoIso) {
  return textoIso.substring(11, 16);
}

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;   // textContent: nunca insertamos HTML ajeno
  return e;
}

function crearEtiqueta(nivel) {
  const e = el("span", "etiqueta e-" + nivel);
  e.append(el("i", "punto p-" + nivel), " " + ETIQUETAS[nivel]);
  return e;
}

function celda(...hijos) {
  const td = document.createElement("td");
  td.append(...hijos);
  return td;
}

// ---------- Tabla del panel ----------
function crearFila(c) {
  const libre = c.estado === "disponible";
  const tr = document.createElement("tr");

  const tdNumero = celda(el("span", "numero-fila", String(c.numero)));
  if (c.tipo === "especial") tdNumero.appendChild(el("span", "insignia-grupos ms-2", "7+"));

  let tdResp, tdPersonas, tdHorario;
  if (libre) {
    tdResp = celda("—");
    tdPersonas = celda("—");
    tdHorario = celda(c.proxima_reserva ? "Próxima " + hora(c.proxima_reserva) : "—");
  } else {
    tdResp = celda(el("div", "", c.responsable_nombre), el("small", "text-secondary", c.responsable_matricula));
    tdPersonas = celda(String(c.cantidad_integrantes));
    tdHorario = celda(hora(c.hora_inicio) + " – " + hora(c.hora_fin));
  }

  // Acciones: ver todas las reservas y, si está libre, registrar
  const acciones = el("div", "d-flex gap-2 justify-content-end flex-wrap");
  const ver = el("button", "btn btn-accion btn-accion-rojo", "Reservas (" + c.pendientes + ")");
  ver.type = "button";
  ver.addEventListener("click", () => abrirReservas(c));
  acciones.appendChild(ver);
  const tdAccion = celda(acciones);
  tdAccion.className = "text-end";

  tr.append(tdNumero, celda(crearEtiqueta(c.nivel)), tdResp, tdPersonas, tdHorario, tdAccion);
  return tr;
}

async function cargar() {
  try {
    const respuesta = await fetch("/api/panel");
    if (respuesta.status === 401) { window.location.href = "/personal"; return; }
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "Error");

    filas.replaceChildren(...datos.cubiculos.map(crearFila));
    $("n-libres").textContent = datos.resumen.libres;
    $("n-ocupados").textContent = datos.resumen.ocupados;
    $("n-por-vencer").textContent = datos.resumen.por_vencer;

    const ahora = new Date().toTimeString().substring(0, 5);
    $("subtitulo").textContent = "Estado actual de los 10 cubículos · " + ahora;
    avisoError.classList.add("d-none");
  } catch (error) {
    console.error(error);
    avisoError.textContent = "No pudimos actualizar el panel. Reintentando...";
    avisoError.classList.remove("d-none");
  }
}

// ---------- Ventana con todas las reservas del cubículo ----------
function tarjetaReserva(r) {
    const tipo = r.estado === "no_presentado" ? "no_presentado"
    : r.estado !== "activa" ? "finalizada"
    : (r.segundos_restantes !== null ? "en_curso" : "proxima");
  const texto = { en_curso: "En curso", proxima: "Próxima", finalizada: "Terminada",
                  no_presentado: "No se presentó" }[tipo];
  const clase = { en_curso: "e-disponible", proxima: "e-por_vencer", finalizada: "e-ocupado",
                  no_presentado: "e-urgente" }[tipo];
  const responsable = r.integrantes.find((i) => i.es_responsable);

  const tarjeta = el("div", "reserva-panel reserva-" + tipo);

  const cabecera = el("div", "d-flex justify-content-between align-items-center flex-wrap gap-2");
  cabecera.appendChild(el("div", "fuente-titulo fs-5 fw-bold", hora(r.hora_inicio) + " – " + hora(r.hora_fin)));
  cabecera.appendChild(el("span", "etiqueta " + clase, texto));
  tarjeta.appendChild(cabecera);

  const datos = el("div", "text-secondary small mt-1");
  datos.textContent = (responsable ? "Responsable: " + responsable.nombre + " (" + responsable.matricula + ")" : "") +
    " · " + r.cantidad_integrantes + " personas";
  if (tipo === "en_curso") datos.textContent += " · termina en " + Math.ceil(r.segundos_restantes / 60) + " min";
  if (tipo === "proxima") datos.textContent += " · empieza en " + Math.ceil(r.segundos_para_inicio / 60) + " min";
  tarjeta.appendChild(datos);

  // Grupo completo (elemento nativo desplegable)
  const detalle = el("details", "mt-2");
  detalle.appendChild(el("summary", "fw-semibold small", "Ver grupo (" + r.integrantes.length + ")"));
  const lista = el("ul", "lista-integrantes mb-0 mt-2");
  for (const i of r.integrantes) {
    const li = el("li");
    li.appendChild(el("span", "", i.nombre + (i.es_responsable ? " · responsable" : "")));
    li.appendChild(el("span", "text-secondary", i.matricula));
    lista.appendChild(li);
  }
  detalle.appendChild(lista);
  tarjeta.appendChild(detalle);

    // Entrega de carnés y llave
  if (r.entrega_confirmada) {
    tarjeta.appendChild(el("div", "entrega-ok mt-3",
      "✓ Carnés y llave entregados a las " + hora(r.entrega_hora)));
    } else if (tipo === "finalizada" || tipo === "no_presentado") {
    tarjeta.appendChild(el("div", "entrega-espera mt-3", "Entrega no registrada."));
  } else if (r.puede_confirmar) {
    const textoEntrega = "Confirmar entrega de carnés y llave";
    const botonEntrega = el("button", "btn btn-verde btn-sm mt-3 me-2", textoEntrega);
    botonEntrega.type = "button";
    let temporizadorEntrega = null;
    botonEntrega.addEventListener("click", () => {
      if (botonEntrega.dataset.confirmar !== "1") {
        botonEntrega.dataset.confirmar = "1";
        botonEntrega.textContent = "¿Carnés y llave entregados? Pulsa de nuevo";
        temporizadorEntrega = setTimeout(() => {
          botonEntrega.dataset.confirmar = "";
          botonEntrega.textContent = textoEntrega;
        }, 4000);
        return;
      }
      clearTimeout(temporizadorEntrega);
      confirmarEntrega(r.id_reserva, botonEntrega);
    });
    tarjeta.appendChild(botonEntrega);
  } else {
    const faltan = Math.max(1, Math.ceil((r.segundos_para_inicio - 600) / 60));
    tarjeta.appendChild(el("div", "entrega-espera mt-3",
      "La entrega se habilita 10 minutos antes del inicio (en " + faltan + " min)."));
  }

  // Liberar o cancelar: confirmación en dos pasos
    if (tipo === "en_curso" || tipo === "proxima") {
    const textoBoton = tipo === "en_curso" ? "Liberar cubículo" : "Cancelar reserva";
    const boton = el("button", "btn btn-rojo btn-sm mt-3", textoBoton);
    boton.type = "button";
    let temporizador = null;
    boton.addEventListener("click", () => {
      if (boton.dataset.confirmar !== "1") {
        boton.dataset.confirmar = "1";
        boton.textContent = "¿Seguro? Pulsa de nuevo para confirmar";
        temporizador = setTimeout(() => {
          boton.dataset.confirmar = "";
          boton.textContent = textoBoton;
        }, 4000);
        return;
      }
      clearTimeout(temporizador);
      liberar(r.id_reserva, boton);
    });
    tarjeta.appendChild(boton);
  }
  return tarjeta;
}

async function cargarReservas() {
  if (!cubiculoAbierto) return;
  try {
    const respuesta = await fetch("/api/cubiculos/" + cubiculoAbierto.id_cubiculo + "/reservas");
    if (respuesta.status === 401) { window.location.href = "/personal"; return; }
    const reservas = await respuesta.json();
    if (!respuesta.ok) throw new Error(reservas.error || "Error");

    if (reservas.length === 0) {
      $("m-lista").replaceChildren(el("div", "text-secondary text-center py-3",
        "Este cubículo no tiene reservas hoy."));
    } else {
      $("m-lista").replaceChildren(...reservas.map(tarjetaReserva));
    }
  } catch (error) {
    console.error(error);
    $("m-lista").replaceChildren(el("div", "text-secondary text-center py-3",
      "No se pudieron cargar las reservas."));
  }
}

function abrirReservas(c) {
  cubiculoAbierto = c;
  $("m-error").classList.add("d-none");
  $("m-numero").textContent = c.numero;
  const etiqueta = $("m-estado");
  etiqueta.className = "etiqueta e-" + c.nivel;
  etiqueta.textContent = ETIQUETAS[c.nivel];
  $("m-lista").replaceChildren(el("div", "text-secondary text-center py-3", "Cargando..."));
  modal.show();
  cargarReservas();
}

async function liberar(idReserva, boton) {
  const cajaError = $("m-error");
  cajaError.classList.add("d-none");
  boton.disabled = true;
  try {
    const respuesta = await fetch("/api/reservas/" + idReserva + "/liberar", { method: "POST" });
    if (respuesta.status === 401) { window.location.href = "/personal"; return; }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      cajaError.textContent = datos.error || "No se pudo liberar la reserva.";
      cajaError.classList.remove("d-none");
    }
  } catch (error) {
    cajaError.textContent = "No pudimos conectar con el servidor.";
    cajaError.classList.remove("d-none");
  }
  await Promise.all([cargarReservas(), cargar()]);   // actualiza la ventana y el panel
}

async function confirmarEntrega(idReserva, boton) {
  const cajaError = $("m-error");
  cajaError.classList.add("d-none");
  boton.disabled = true;
  try {
    const respuesta = await fetch("/api/reservas/" + idReserva + "/entrega", { method: "POST" });
    if (respuesta.status === 401) { window.location.href = "/personal"; return; }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      cajaError.textContent = datos.error || "No se pudo confirmar la entrega.";
      cajaError.classList.remove("d-none");
    }
  } catch (error) {
    console.error(error);
    cajaError.textContent = "No pudimos conectar con el servidor.";
    cajaError.classList.remove("d-none");
  }
  await cargarReservas();   // refleja el cambio en la ventana
}

$("modal-reservas").addEventListener("hidden.bs.modal", () => { cubiculoAbierto = null; });

cargar();
setInterval(cargar, 15000);
setInterval(cargarReservas, 15000);   // solo actúa si la ventana está abierta