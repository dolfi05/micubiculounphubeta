const filas = document.getElementById("filas");
const avisoError = document.getElementById("aviso-error");
const modal = new bootstrap.Modal(document.getElementById("modal-reserva"));
const ETIQUETAS = { disponible: "Disponible", ocupado: "Ocupado", por_vencer: "Por vencer", urgente: "Urgente" };

let reservaAbierta = null;   // id de la reserva que se ve en la ventana

function hora(textoIso) {
  return textoIso.substring(11, 16);
}

function crearEtiqueta(nivel) {
  const e = document.createElement("span");
  e.className = "etiqueta e-" + nivel;
  const punto = document.createElement("i");
  punto.className = "punto p-" + nivel;
  e.append(punto, " " + ETIQUETAS[nivel]);
  return e;
}

function celda(...hijos) {
  const td = document.createElement("td");
  td.append(...hijos);
  return td;
}

function crearFila(c) {
  const libre = c.estado === "disponible";
  const tr = document.createElement("tr");

  const numero = document.createElement("span");
  numero.className = "numero-fila";
  numero.textContent = c.numero;
  const tdNumero = celda(numero);
  if (c.tipo === "especial") {
    const insignia = document.createElement("span");
    insignia.className = "insignia-grupos ms-2";
    insignia.textContent = "7+";
    tdNumero.appendChild(insignia);
  }

  let tdResp, tdPersonas, tdHorario;
  if (libre) {
    tdResp = celda("—");
    tdPersonas = celda("—");
    tdHorario = celda(c.proxima_reserva ? "Próxima " + hora(c.proxima_reserva) : "—");
  } else {
    const nombre = document.createElement("div");
    nombre.textContent = c.responsable_nombre;
    const matricula = document.createElement("small");
    matricula.className = "text-secondary";
    matricula.textContent = c.responsable_matricula;
    tdResp = celda(nombre, matricula);
    tdPersonas = celda(String(c.cantidad_integrantes));
    tdHorario = celda(hora(c.hora_inicio) + " – " + hora(c.hora_fin));
  }

  const accion = document.createElement(libre ? "a" : "button");
  if (libre) {
    accion.className = "btn btn-accion btn-accion-verde";
    accion.href = "/registro-presencial?cubiculo=" + c.numero;
    accion.textContent = "Registrar";
  } else {
    accion.type = "button";
    accion.className = "btn btn-accion btn-accion-rojo";
    accion.textContent = "Ver / liberar";
    accion.addEventListener("click", () => abrirReserva(c));
  }
  const tdAccion = celda(accion);
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
    document.getElementById("n-libres").textContent = datos.resumen.libres;
    document.getElementById("n-ocupados").textContent = datos.resumen.ocupados;
    document.getElementById("n-por-vencer").textContent = datos.resumen.por_vencer;

    const ahora = new Date().toTimeString().substring(0, 5);
    document.getElementById("subtitulo").textContent = "Estado actual de los 10 cubículos · " + ahora;
    avisoError.classList.add("d-none");
  } catch (error) {
    avisoError.textContent = "No pudimos actualizar el panel. Reintentando...";
    avisoError.classList.remove("d-none");
  }
}

// ---------- Ventana "Ver / liberar" ----------
async function abrirReserva(c) {
  reservaAbierta = c.id_reserva;
  document.getElementById("m-error").classList.add("d-none");
  document.getElementById("m-numero").textContent = c.numero;
  const etiqueta = document.getElementById("m-estado");
  etiqueta.className = "etiqueta e-" + c.nivel;
  etiqueta.textContent = ETIQUETAS[c.nivel] + " · libera " + hora(c.hora_fin);
  document.getElementById("m-responsable").textContent = c.responsable_nombre + " · " + c.responsable_matricula;
  document.getElementById("m-horario").textContent = hora(c.hora_inicio) + " – " + hora(c.hora_fin);
  document.getElementById("m-personas").textContent = c.cantidad_integrantes;
  document.getElementById("m-matriculas").textContent = "Cargando...";
  modal.show();

  try {
    const respuesta = await fetch("/api/reservas/" + c.id_reserva);
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error);
    document.getElementById("m-matriculas").textContent =
      datos.integrantes.map((i) => i.matricula).join(" · ");
  } catch (error) {
    document.getElementById("m-matriculas").textContent = "No se pudieron cargar las matrículas.";
  }
}

document.getElementById("m-liberar").addEventListener("click", async () => {
  const boton = document.getElementById("m-liberar");
  const cajaError = document.getElementById("m-error");
  boton.disabled = true;
  boton.textContent = "Liberando...";
  try {
    const respuesta = await fetch("/api/reservas/" + reservaAbierta + "/liberar", { method: "POST" });
    if (respuesta.status === 401) { window.location.href = "/personal"; return; }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      cajaError.textContent = datos.error || "No se pudo liberar el cubículo.";
      cajaError.classList.remove("d-none");
      return;
    }
    modal.hide();
    await cargar();   // el panel se actualiza de inmediato
  } catch (error) {
    cajaError.textContent = "No pudimos conectar con el servidor.";
    cajaError.classList.remove("d-none");
  } finally {
    boton.disabled = false;
    boton.textContent = "Liberar cubículo";
  }
});

cargar();
setInterval(cargar, 15000);