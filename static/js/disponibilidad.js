const cuadricula = document.getElementById("cuadricula");
const avisoError = document.getElementById("aviso-error");

const ETIQUETAS = {
  disponible: "Disponible",
  ocupado: "Ocupado",
  por_vencer: "Por vencer",
  urgente: "Urgente",
};

function hora(textoIso) {
  // "2026-11-09T10:00:00" -> "10:00"
  return textoIso.substring(11, 16);
}

function crearTarjeta(c) {
  const libre = c.estado === "disponible";
  const nivel = c.nivel;

  const col = document.createElement("div");
  col.className = "col";

  const tarjeta = document.createElement("div");
  tarjeta.className = "cubiculo n-" + nivel;

  const cabecera = document.createElement("div");
  cabecera.className = "d-flex justify-content-between align-items-start";
  const numero = document.createElement("div");
  numero.className = "cubiculo-numero";
  numero.textContent = c.numero;
  cabecera.appendChild(numero);
  if (c.tipo === "especial") {
    const insignia = document.createElement("span");
    insignia.className = "insignia-grupos";
    insignia.textContent = "Grupos 7+";
    cabecera.appendChild(insignia);
  }

  const estado = document.createElement("span");
  estado.className = "etiqueta e-" + nivel;
  const punto = document.createElement("i");
  punto.className = "punto p-" + nivel;
  estado.appendChild(punto);
  estado.append(" " + ETIQUETAS[nivel]);

  const detalle = document.createElement("p");
  detalle.className = "cubiculo-detalle";
  detalle.textContent = libre
    ? "Para " + c.capacidad_minima + " o más personas"
    : "Se libera a las " + hora(c.se_libera_a);

  tarjeta.append(cabecera, estado, detalle);

  if (c.proxima_reserva) {
    const proxima = document.createElement("p");
    proxima.className = "cubiculo-proxima";
    proxima.textContent = "Próxima reserva: " + hora(c.proxima_reserva);
    tarjeta.appendChild(proxima);
  }

  // Siempre se puede reservar: si está ocupado ahora, se elige otro horario
  const enlace = document.createElement("a");
  enlace.className = libre ? "btn btn-verde w-100" : "btn btn-otro-horario w-100";
  enlace.href = "/reservar/" + c.numero;
  enlace.textContent = libre ? "Reservar" : "Reservar en otro horario";
  tarjeta.appendChild(enlace);

  col.appendChild(tarjeta);
  return col;
}

async function cargar() {
  try {
    const respuesta = await fetch("/api/cubiculos");
    if (respuesta.status === 401) {
      window.location.href = "/";
      return;
    }
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || "Error");

    cuadricula.replaceChildren(...datos.map(crearTarjeta));

    const libres = datos.filter((c) => c.estado === "disponible").length;
    document.getElementById("cuenta-libres").textContent = libres;
    document.getElementById("cuenta-ocupados").textContent = datos.length - libres;

    const ahora = new Date().toTimeString().substring(0, 5);
    document.getElementById("subtitulo").textContent =
      "Elige un cubículo y reserva un bloque de 2 horas (" + ahora + ").";
    avisoError.classList.add("d-none");
  } catch (error) {
    console.error(error);
    avisoError.textContent = "No pudimos actualizar la disponibilidad. Reintentando...";
    avisoError.classList.remove("d-none");
  }
}

cargar();
setInterval(cargar, 15000);   // se actualiza solo cada 15 segundos