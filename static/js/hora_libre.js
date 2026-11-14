// Funciones compartidas por reservar y registro presencial.
function dos(n) { return String(n).padStart(2, "0"); }

function horaActualTexto() {
  const d = new Date();
  return dos(d.getHours()) + ":" + dos(d.getMinutes());
}

function fechaHoyTexto() {
  const d = new Date();
  return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate());
}

// "14:35" -> "2026-11-09T14:35:00" (hoy), o null si esta vacio o es invalido
function inicioIso(valor) {
  if (!/^\d{2}:\d{2}$/.test(valor || "")) return null;
  return fechaHoyTexto() + "T" + valor + ":00";
}

// Suma 2 horas a "HH:MM" y devuelve "HH:MM" (o "–" si no hay hora)
function sumarDosHoras(valor) {
  if (!/^\d{2}:\d{2}$/.test(valor || "")) return "–";
  const [h, m] = valor.split(":").map(Number);
  return dos((h + 2) % 24) + ":" + dos(m);
}

// Dibuja la lista de horas ocupadas y las guarda para el selector de hora
async function cargarOcupadas(idCubiculo, contenedor) {
  contenedor.replaceChildren();
  window.horasOcupadas = [];
  try {
    const r = await fetch("/api/cubiculos/" + idCubiculo + "/ocupadas");
    const lista = r.ok ? await r.json() : [];
    window.horasOcupadas = lista.map((o) => ({ ini: new Date(o.hora_inicio), fin: new Date(o.hora_fin) }));
    if (lista.length === 0) {
      contenedor.textContent = "Este cubículo no tiene reservas pendientes hoy.";
      return;
    }
    const titulo = document.createElement("div");
    titulo.className = "fw-semibold small mb-1";
    titulo.textContent = "Horas ya ocupadas hoy:";
    contenedor.appendChild(titulo);
    for (const o of lista) {
      const fila = document.createElement("div");
      fila.className = "small";
      fila.textContent = o.hora_inicio.substring(11, 16) + " – " + o.hora_fin.substring(11, 16);
      contenedor.appendChild(fila);
    }
  } catch (e) {
    contenedor.textContent = "No se pudieron cargar las horas ocupadas.";
  }
}