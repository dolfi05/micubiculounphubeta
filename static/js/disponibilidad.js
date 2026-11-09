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
  if (libre) {
    detalle.textContent = "Para " + c.capacidad_minima + " o más personas";
  } else {
    detalle.textContent = "Se libera a las " + hora(c.se_libera_a);
  }

  tarjeta.append(cabecera, estado, detalle);

  if (libre) {
    const enlace = document.createElement("a");
    enlace.className = "btn btn-verde w-100";
    enlace.href = "/reservar/" + c.numero;
    enlace.textContent = "Reservar";
    tarjeta.appendChild(enlace);
  } else {
    const boton = document.createElement("button");
    boton.className = "btn btn-no-disponible w-100";
    boton.disabled = true;
    boton.textContent = "No disponible";
    tarjeta.appendChild(boton);
  }

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
      "Elige uno libre y reserva un bloque de 2 horas (" + ahora + ").";
    avisoError.classList.add("d-none");
  } catch (error) {
    avisoError.textContent = "No pudimos actualizar la disponibilidad. Reintentando...";
    avisoError.classList.remove("d-none");
  }
}

cargar();
setInterval(cargar, 15000);   // se actualiza solo cada 15 segundos