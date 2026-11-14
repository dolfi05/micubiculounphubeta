function hora(textoIso) {
  return textoIso.substring(11, 16);
}

async function cargar() {
  try {
    const id = Number(new URLSearchParams(window.location.search).get("id"));
    const respuesta = await fetch("/api/mis-reservas");
    if (respuesta.status === 401) { window.location.href = "/"; return; }
    const reservas = await respuesta.json();
    const r = reservas.find((x) => x.id_reserva === id) || reservas.find((x) => x.estado === "activa");
    if (!r) { window.location.href = "/disponibilidad"; return; }

    document.getElementById("c-numero").textContent = r.numero;
    document.getElementById("c-tipo").textContent =
      r.tipo === "especial" ? "Cubículo para grupos" : "Cubículo estándar";
    document.getElementById("c-inicio").textContent = hora(r.hora_inicio);
    document.getElementById("c-fin").textContent = hora(r.hora_fin);
    document.getElementById("c-titulo-integrantes").textContent = "Integrantes (" + r.integrantes.length + ")";

    const lista = document.getElementById("c-integrantes");
    for (const i of r.integrantes) {
      const li = document.createElement("li");
      const nombre = document.createElement("span");
      nombre.textContent = i.nombre + (i.es_responsable ? " · responsable" : "");
      const matricula = document.createElement("span");
      matricula.className = "text-secondary";
      matricula.textContent = i.matricula;
      li.append(nombre, matricula);
      lista.appendChild(li);
    }

    // Aviso: recoger la llave y entregar los carnés en la ventana de tiempo
    const texto = document.getElementById("texto-confirmacion");
    if (r.entrega_confirmada) {
      texto.textContent = "Tu reserva está registrada y la entrega de la llave ya fue confirmada.";
    } else {
      texto.textContent = "Tu reserva quedó registrada. Falta recoger la llave y entregar los carnés.";
      const aviso = document.createElement("div");
      aviso.className = "aviso-entrega mt-3 mb-4";      aviso.textContent =
        "Importante: recoge la llave y entrega los carnés en el mostrador entre las " +
        horaDesplazada(r.hora_inicio, -10) + " y las " + horaDesplazada(r.hora_inicio, 10) +
        ". Hasta que el personal confirme la entrega no puedes usar el cubículo, y si no se confirma " +
        "a tiempo, la reserva se cancelará automáticamente.";
      texto.insertAdjacentElement("afterend", aviso);
    }
    document.getElementById("tarjeta").classList.remove("d-none");
    document.getElementById("c-aviso").classList.remove("d-none");
  } catch (error) {
    console.error(error);
    document.getElementById("texto-confirmacion").textContent =
      "No pudimos cargar los datos de tu reserva. Revisa la sección Mis reservas.";
  }
}

cargar();