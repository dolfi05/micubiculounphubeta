const numero = Number(new URLSearchParams(window.location.search).get("cubiculo"));

async function cargar() {
  try {
    const respuesta = await fetch("/api/cubiculos");
    if (respuesta.status === 401) { window.location.href = "/"; return; }
    const lista = await respuesta.json();
    const c = lista.find((x) => x.numero === numero);

    document.getElementById("k-numero").textContent = Number.isInteger(numero) && numero > 0 ? numero : "";
    document.getElementById("k-mensaje").textContent =
      "Alguien tomó el cubículo " + numero + " en este bloque mientras llenabas el formulario. Tu reserva no se guardó.";
    document.getElementById("k-estado").textContent =
      c && c.estado === "ocupado"
        ? "Ocupado · se libera a las " + c.se_libera_a.substring(11, 16)
        : "Reservado en ese horario";

    const contenedor = document.getElementById("k-libres");
    const libres = lista.filter((x) => x.estado === "disponible");
    if (libres.length === 0) {
      contenedor.textContent = "Ahora mismo no hay cubículos libres.";
    }
    for (const l of libres) {
      const enlace = document.createElement("a");
      enlace.className = "chip-cubiculo";
      enlace.href = "/reservar/" + l.numero;
      enlace.textContent = l.numero;
      contenedor.appendChild(enlace);
    }
  } catch (error) {
    document.getElementById("k-mensaje").textContent =
      "No pudimos actualizar la información. Vuelve a la disponibilidad.";
  }
}

cargar();