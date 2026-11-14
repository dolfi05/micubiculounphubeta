// Selector de hora con ventana desplegable (horas y minutos de 5 en 5).
// Se engancha al campo <input id="hora"> y usa window.horasOcupadas (lo llena hora_libre.js).
(function () {
  const PASO = 5;
  const MINUTOS = Array.from({ length: 60 / PASO }, (_, i) => i * PASO);
  const dos = (n) => String(n).padStart(2, "0");

  // Horario: null = cerrado (domingo)
  function limites() {
    const dia = new Date().getDay();   // 0 = domingo, 6 = sábado
    if (dia === 0) return null;
    return { primera: 8, ultima: dia === 6 ? 13 : 19 };   // último inicio permitido
  }

  function momento(h, m) {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  // Devuelve null si se puede elegir, o el motivo por el que no
  function estado(h, m) {
    const lim = limites();
    if (!lim) return "cerrado";
    if (h < lim.primera || h > lim.ultima || (h === lim.ultima && m > 0)) return "fuera de horario";
    const inicio = momento(h, m);
    if (inicio < new Date(Date.now() - 5 * 60000)) return "hora pasada";
    const fin = new Date(inicio.getTime() + 2 * 3600000);
    for (const o of window.horasOcupadas || []) {
      if (o.ini < fin && o.fin > inicio) return "ocupado";
    }
    return null;
  }

  function activar(input) {
    input.type = "text";
    input.readOnly = true;
    input.placeholder = "Elige la hora";
    input.autocomplete = "off";
    input.classList.add("selector-hora-entrada");

    const caja = document.createElement("div");
    caja.className = "selector-hora-caja";
    input.parentNode.insertBefore(caja, input);
    caja.appendChild(input);

    const panel = document.createElement("div");
    panel.className = "selector-hora-panel d-none";
    caja.appendChild(panel);

    function valorActual() {
      const m = /^(\d{2}):(\d{2})$/.exec(input.value);
      return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
    }

    function elegir(h, m, cerrar) {
      input.value = dos(h) + ":" + dos(m);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (cerrar) panel.classList.add("d-none");
      else dibujar();
    }

    function boton(texto, clase, desactivado, motivo, alClic) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sh-opcion " + clase;
      b.textContent = texto;
      b.disabled = !!desactivado;
      if (desactivado && motivo) b.title = motivo;
      b.addEventListener("click", alClic);
      return b;
    }

    function columna(titulo, botones) {
      const col = document.createElement("div");
      const t = document.createElement("div");
      t.className = "sh-titulo";
      t.textContent = titulo;
      const lista = document.createElement("div");
      lista.className = "sh-lista";
      lista.append(...botones);
      col.append(t, lista);
      return [col, lista];
    }

    function dibujar() {
      panel.replaceChildren();
      const lim = limites();
      if (!lim) {
        const aviso = document.createElement("div");
        aviso.className = "sh-nota";
        aviso.textContent = "La biblioteca está cerrada hoy.";
        panel.appendChild(aviso);
        return;
      }

      const actual = valorActual();
      const ahora = new Date();

      // Botón "Ahora"
      const motivoAhora = estado(ahora.getHours(), ahora.getMinutes());
      const bAhora = boton("Ahora (" + dos(ahora.getHours()) + ":" + dos(ahora.getMinutes()) + ")",
        "sh-ahora", motivoAhora !== null, motivoAhora,
        () => elegir(ahora.getHours(), ahora.getMinutes(), true));
      panel.appendChild(bAhora);

      // Columna de horas
      const horas = [];
      for (let h = lim.primera; h <= lim.ultima; h++) {
        const hayLibre = MINUTOS.some((m) => estado(h, m) === null);
        horas.push(boton(dos(h), actual && actual.h === h ? "activa" : "", !hayLibre,
          "sin horarios libres", () => {
            // Mantiene los minutos si siguen siendo válidos; si no, usa el primero libre
            const minuto = actual && estado(h, actual.m) === null
              ? actual.m : MINUTOS.find((m) => estado(h, m) === null);
            elegir(h, minuto, false);
          }));
      }

      // Columna de minutos (de la hora elegida, o de la primera hora del día)
      const horaBase = actual ? actual.h : lim.primera;
      const minutos = MINUTOS.map((m) => {
        const motivo = estado(horaBase, m);
        return boton(dos(m), actual && actual.h === horaBase && actual.m === m ? "activa" : "",
          motivo !== null, motivo, () => elegir(horaBase, m, true));
      });

      const columnas = document.createElement("div");
      columnas.className = "sh-columnas";
      const [colH, listaH] = columna("HORA", horas);
      const [colM, listaM] = columna("MINUTOS", minutos);
      columnas.append(colH, colM);
      panel.appendChild(columnas);

      const nota = document.createElement("div");
      nota.className = "sh-nota";
      nota.textContent = "Las opciones tachadas ya pasaron, están ocupadas o fuera de horario.";
      panel.appendChild(nota);

      // Deja a la vista la hora elegida
      for (const lista of [listaH, listaM]) {
        const activa = lista.querySelector(".activa");
        if (activa) lista.scrollTop = Math.max(0, activa.offsetTop - 60);
      }
    }

    function abrir() {
      dibujar();
      panel.classList.remove("d-none");
    }

    input.addEventListener("click", () => {
      if (panel.classList.contains("d-none")) abrir();
      else panel.classList.add("d-none");
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
      if (e.key === "Escape") panel.classList.add("d-none");
    });
    document.addEventListener("click", (e) => {
      if (!caja.contains(e.target)) panel.classList.add("d-none");
    });
  }

  // Primera hora elegible a partir de ahora (la hora exacta de ahora si está libre)
  window.primeraHoraLibre = function () {
    const lim = limites();
    if (!lim) return null;
    const ahora = new Date();
    if (estado(ahora.getHours(), ahora.getMinutes()) === null) {
      return dos(ahora.getHours()) + ":" + dos(ahora.getMinutes());
    }
    for (let h = lim.primera; h <= lim.ultima; h++) {
      for (const m of MINUTOS) {
        if (estado(h, m) === null) return dos(h) + ":" + dos(m);
      }
    }
    return null;
  };

  const campo = document.getElementById("hora");
  if (campo) activar(campo);
})();