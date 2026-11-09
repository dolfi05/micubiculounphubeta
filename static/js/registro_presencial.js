const MATRICULA_VALIDA = /^\d{2}-\d{4}$/;   // formato 24-0302
const MAXIMO = 15;
const $ = (id) => document.getElementById(id);

const cajaErrores = $("caja-errores");
const listaErrores = $("lista-errores");
const selectorHora = $("hora");
const botonRegistrar = $("boton-registrar");

let libres = [];      // cubículos disponibles ahora
let cubiculo = null;  // el elegido
let horas = [];
let cantidad = 2;
let otros = [];       // integrantes 2..n
let campos = [];

function hora(textoIso) {
  return textoIso.substring(11, 16);
}

function mostrarErrores(lista) {
  listaErrores.replaceChildren();
  for (const mensaje of lista) {
    const li = document.createElement("li");
    li.textContent = mensaje;   // textContent: nunca insertamos HTML ajeno
    listaErrores.appendChild(li);
  }
  cajaErrores.classList.remove("d-none");
  cajaErrores.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function marcar(input, aviso, mensaje) {
  input.classList.add("campo-error");
  aviso.textContent = mensaje;
}

function limpiarErrores() {
  cajaErrores.classList.add("d-none");
  listaErrores.replaceChildren();
  const fijos = [["resp-nombre", "err-resp-nombre"], ["resp-matricula", "err-resp-matricula"]];
  for (const [i, a] of fijos) { $(i).classList.remove("campo-error"); $(a).textContent = ""; }
  for (const c of campos) {
    for (const [input, aviso] of [[c.nombre, c.errNombre], [c.matricula, c.errMatricula]]) {
      input.classList.remove("campo-error");
      aviso.textContent = "";
    }
  }
}

// ---------- Cubículos libres ----------
function dibujarCubiculos() {
  const caja = $("cubiculos-libres");
  caja.replaceChildren();
  $("sin-cubiculos").classList.toggle("d-none", libres.length > 0);
  for (const c of libres) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "chip-cubiculo" + (cubiculo && cubiculo.id_cubiculo === c.id_cubiculo ? " chip-activo" : "");
    boton.textContent = c.numero;
    if (c.tipo === "especial") {
      const insignia = document.createElement("span");
      insignia.className = "insignia-grupos ms-2";
      insignia.textContent = "7+";
      boton.appendChild(insignia);
    }
    boton.addEventListener("click", () => elegirCubiculo(c));
    caja.appendChild(boton);
  }
}

async function elegirCubiculo(c) {
  cubiculo = c;
  dibujarCubiculos();
  $("resumen-numero").textContent = c.numero;
  $("resumen-tipo").textContent = c.tipo === "especial" ? "Cubículo para grupos" : "Cubículo estándar";
  $("texto-minimo").textContent = "Mínimo " + c.capacidad_minima + " personas en este cubículo.";
  cantidad = Math.max(c.capacidad_minima, 2);
  actualizarCantidad();

  selectorHora.replaceChildren();
  horas = [];
  try {
    const r = await fetch("/api/cubiculos/" + c.id_cubiculo + "/horas");
    horas = r.ok ? await r.json() : [];
  } catch (e) { horas = []; }

  for (const h of horas) {
    const opcion = document.createElement("option");
    opcion.value = h.es_ahora ? "ahora" : h.hora_inicio;
    opcion.textContent = h.etiqueta + "  –  termina " + hora(h.hora_fin);
    selectorHora.appendChild(opcion);
  }
  const sinHoras = horas.length === 0;
  selectorHora.disabled = sinHoras;
  botonRegistrar.disabled = sinHoras;
  $("sin-horas").classList.toggle("d-none", !sinHoras);
  actualizarResumen();
}

function actualizarResumen() {
  const h = horas.find((x) => (x.es_ahora ? "ahora" : x.hora_inicio) === selectorHora.value);
  $("resumen-inicio").textContent = h ? hora(h.hora_inicio) : "–";
  $("resumen-fin").textContent = h ? hora(h.hora_fin) : "–";
}
selectorHora.addEventListener("change", actualizarResumen);

// ---------- Integrantes ----------
function crearCampo(placeholder, valor, alCambiar, largo) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "form-control";
  input.placeholder = placeholder;
  input.value = valor;
  input.maxLength = largo;
  input.addEventListener("input", () => alCambiar(input.value));
  const aviso = document.createElement("div");
  aviso.className = "texto-error";
  return [input, aviso];
}

function dibujarIntegrantes() {
  const caja = $("integrantes");
  caja.replaceChildren();
  campos = [];

  while (otros.length < cantidad - 1) otros.push({ nombre: "", matricula: "" });
  otros.length = Math.max(cantidad - 1, 0);

  otros.forEach((datos, i) => {
    const bloque = document.createElement("div");
    bloque.className = "mb-3";
    const etiqueta = document.createElement("div");
    etiqueta.className = "form-label";
    etiqueta.textContent = "Integrante " + (i + 2);

    const fila = document.createElement("div");
    fila.className = "row g-2";
    const c1 = document.createElement("div"); c1.className = "col-md-6";
    const c2 = document.createElement("div"); c2.className = "col-md-6";
    const [inN, erN] = crearCampo("Nombre completo", datos.nombre, (v) => (datos.nombre = v), 100);
    const [inM, erM] = crearCampo("Ej. 24-0302", datos.matricula, (v) => (datos.matricula = v), 20);
    c1.append(inN, erN);
    c2.append(inM, erM);
    fila.append(c1, c2);
    bloque.append(etiqueta, fila);
    caja.appendChild(bloque);
    campos.push({ nombre: inN, matricula: inM, errNombre: erN, errMatricula: erM });
  });
}

function actualizarCantidad() {
  $("cantidad").textContent = cantidad;
  const minimo = cubiculo ? cubiculo.capacidad_minima : 2;
  const faltan = minimo - cantidad;
  $("aviso-minimo").textContent =
    faltan > 0 ? "Faltan " + faltan + " personas para llegar al mínimo de " + minimo + "." : "";
  dibujarIntegrantes();
}

$("menos").addEventListener("click", () => { if (cantidad > 1) { cantidad--; actualizarCantidad(); } });
$("mas").addEventListener("click", () => { if (cantidad < MAXIMO) { cantidad++; actualizarCantidad(); } });

// ---------- Validación en el navegador (el servidor la repite) ----------
function validar() {
  const errores = [];
  if (!cubiculo) {
    errores.push("Elige un cubículo libre.");
  } else {
    if (horas.length === 0) errores.push("No hay horas disponibles hoy para este cubículo.");
    if (cantidad < cubiculo.capacidad_minima) {
      errores.push("El cubículo " + cubiculo.numero + " requiere al menos " + cubiculo.capacidad_minima +
                   " personas. El grupo tiene " + cantidad + ".");
    }
  }

  const nombre = $("resp-nombre").value.trim();
  const matricula = $("resp-matricula").value.trim();
  const vistas = new Set();

  if (!nombre) {
    errores.push("Falta el nombre del responsable.");
    marcar($("resp-nombre"), $("err-resp-nombre"), "Escribe el nombre del responsable.");
  }
  if (!matricula) {
    errores.push("Falta la matrícula del responsable.");
    marcar($("resp-matricula"), $("err-resp-matricula"), "Escribe la matrícula del responsable.");
  } else if (!MATRICULA_VALIDA.test(matricula)) {
    errores.push("La matrícula del responsable no es válida.");
    marcar($("resp-matricula"), $("err-resp-matricula"), "Esta matrícula no es válida. Usa el formato 24-0302.");
  } else {
    vistas.add(matricula);
  }

  otros.forEach((d, i) => {
    const n = i + 2;
    const c = campos[i];
    const nom = d.nombre.trim();
    const mat = d.matricula.trim();
    if (!nom) {
      errores.push("Falta el nombre del integrante " + n + ".");
      marcar(c.nombre, c.errNombre, "Escribe el nombre de este integrante.");
    }
    if (!mat) {
      errores.push("Falta la matrícula del integrante " + n + ".");
      marcar(c.matricula, c.errMatricula, "Escribe la matrícula de este integrante.");
    } else if (!MATRICULA_VALIDA.test(mat)) {
      errores.push("La matrícula del integrante " + n + " no es válida.");
      marcar(c.matricula, c.errMatricula, "Esta matrícula no es válida. Usa el formato 24-0302.");
    } else if (vistas.has(mat)) {
      errores.push("La matrícula " + mat + " está repetida.");
      marcar(c.matricula, c.errMatricula, "Esta matrícula ya está en el grupo.");
    } else {
      vistas.add(mat);
    }
  });
  return errores;
}

// ---------- Enviar ----------
$("form-presencial").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limpiarErrores();

  const errores = validar();
  if (errores.length > 0) { mostrarErrores(errores); return; }

  botonRegistrar.disabled = true;
  botonRegistrar.textContent = "Registrando...";

  const integrantes = [
    { nombre: $("resp-nombre").value.trim(), matricula: $("resp-matricula").value.trim() },
    ...otros.map((d) => ({ nombre: d.nombre.trim(), matricula: d.matricula.trim() })),
  ];

  try {
    const respuesta = await fetch("/api/reservas/presencial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_cubiculo: cubiculo.id_cubiculo,
        hora_inicio: selectorHora.value,
        cantidad: cantidad,
        integrantes: integrantes,
      }),
    });
    if (respuesta.status === 401) { window.location.href = "/personal"; return; }
    const datos = await respuesta.json().catch(() => ({}));

    if (respuesta.ok) { window.location.href = "/panel"; return; }
    mostrarErrores(datos.errores || [datos.error || "No se pudo registrar la reserva."]);
    if (datos.tipo === "cubiculo_ocupado") await cargarLibres();   // refresca los libres
  } catch (error) {
    mostrarErrores(["No pudimos conectar con el servidor. Intenta de nuevo."]);
  } finally {
    botonRegistrar.disabled = horas.length === 0;
    botonRegistrar.textContent = "Registrar reserva";
  }
});

// ---------- Arranque ----------
async function cargarLibres() {
  const r = await fetch("/api/cubiculos");
  if (r.status === 401) { window.location.href = "/personal"; return; }
  libres = (await r.json()).filter((c) => c.estado === "disponible");
  if (cubiculo && !libres.some((c) => c.id_cubiculo === cubiculo.id_cubiculo)) cubiculo = null;
  dibujarCubiculos();
}

async function iniciar() {
  try {
    await cargarLibres();
    actualizarCantidad();
    const pedido = Number(new URLSearchParams(window.location.search).get("cubiculo"));
    const inicial = libres.find((c) => c.numero === pedido);
    if (inicial) await elegirCubiculo(inicial);
    else botonRegistrar.disabled = false;
  } catch (error) {
    mostrarErrores(["No pudimos cargar los cubículos. Recarga la página."]);
  }
}

iniciar();