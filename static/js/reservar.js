const numero = Number(document.getElementById("datos-pagina").dataset.numero);
const MATRICULA_VALIDA = /^\d{2}-\d{4}$/;   // formato 24-0302
const MAXIMO = 15;

const cajaErrores = document.getElementById("caja-errores");
const listaErrores = document.getElementById("lista-errores");
const selectorHora = document.getElementById("hora");
const botonConfirmar = document.getElementById("boton-confirmar");

let cubiculo = null;
let yo = null;
let cantidad = 1;
let otros = [];    // datos escritos de los integrantes 2..n
let campos = [];   // referencias a los inputs, para marcar errores

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

function ocultarErrores() {
  cajaErrores.classList.add("d-none");
  listaErrores.replaceChildren();
  for (const c of campos) {
    for (const [input, aviso] of [[c.nombre, c.errNombre], [c.matricula, c.errMatricula]]) {
      input.classList.remove("campo-error");
      aviso.textContent = "";
    }
  }
}

function marcar(input, aviso, mensaje) {
  input.classList.add("campo-error");
  aviso.textContent = mensaje;
}

// ---------- Resumen verde ----------
function actualizarResumen() {
  const v = selectorHora.value;
  document.getElementById("resumen-inicio").textContent = v || "–";
  document.getElementById("resumen-fin").textContent = sumarDosHoras(v);
}

// ---------- Integrantes ----------
function crearCampo(placeholder, valor, alCambiar) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "form-control";
  input.placeholder = placeholder;
  input.value = valor;
  input.maxLength = 100;
  input.addEventListener("input", () => alCambiar(input.value));
  const aviso = document.createElement("div");
  aviso.className = "texto-error";
  return [input, aviso];
}

function dibujarIntegrantes() {
  const contenedor = document.getElementById("integrantes");
  contenedor.replaceChildren();
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
    const colNombre = document.createElement("div");
    colNombre.className = "col-md-6";
    const colMatricula = document.createElement("div");
    colMatricula.className = "col-md-6";

    const [inNombre, errNombre] = crearCampo("Nombre completo", datos.nombre, (v) => (datos.nombre = v));
    const [inMatricula, errMatricula] = crearCampo("Ej. 24-0302", datos.matricula, (v) => (datos.matricula = v));
    inMatricula.maxLength = 20;

    colNombre.append(inNombre, errNombre);
    colMatricula.append(inMatricula, errMatricula);
    fila.append(colNombre, colMatricula);
    bloque.append(etiqueta, fila);
    contenedor.appendChild(bloque);

    campos.push({ nombre: inNombre, matricula: inMatricula, errNombre, errMatricula });
  });
}

function actualizarCantidad() {
  document.getElementById("cantidad").textContent = cantidad;
  const faltan = cubiculo.capacidad_minima - cantidad;
  document.getElementById("aviso-minimo").textContent =
    faltan > 0 ? "Faltan " + faltan + " personas para llegar al mínimo de " + cubiculo.capacidad_minima + "." : "";
  dibujarIntegrantes();
}

document.getElementById("menos").addEventListener("click", () => {
  if (cantidad > 1) { cantidad--; actualizarCantidad(); }
});
document.getElementById("mas").addEventListener("click", () => {
  if (cantidad < MAXIMO) { cantidad++; actualizarCantidad(); }
});
selectorHora.addEventListener("change", actualizarResumen);
selectorHora.addEventListener("input", actualizarResumen);

// ---------- Validación en el navegador (el servidor la repite) ----------
function validar() {
  const errores = [];

  if (!inicioIso(selectorHora.value)) {
    errores.push("Escribe la hora de inicio (por ejemplo 14:35).");
  }
  if (cantidad < cubiculo.capacidad_minima) {
    errores.push("El cubículo " + cubiculo.numero + " requiere al menos " + cubiculo.capacidad_minima +
                 " personas. Tu grupo tiene " + cantidad + ".");
  }

  const vistas = new Map();
  vistas.set(yo.matricula, 1);

  otros.forEach((d, i) => {
    const n = i + 2;
    const c = campos[i];
    const nombre = d.nombre.trim();
    const matricula = d.matricula.trim();

    if (!nombre) {
      errores.push("Falta el nombre del integrante " + n + ".");
      marcar(c.nombre, c.errNombre, "Escribe el nombre de este integrante.");
    }
    if (!matricula) {
      errores.push("Falta la matrícula del integrante " + n + ".");
      marcar(c.matricula, c.errMatricula, "Escribe la matrícula de este integrante.");
    } else if (!MATRICULA_VALIDA.test(matricula)) {
      errores.push("La matrícula del integrante " + n + " no es válida.");
      marcar(c.matricula, c.errMatricula, "Esta matrícula no es válida. Usa el formato 24-0302.");
    } else if (vistas.has(matricula)) {
      errores.push("La matrícula " + matricula + " está repetida.");
      marcar(c.matricula, c.errMatricula, "Esta matrícula ya está en el grupo.");
    } else {
      vistas.set(matricula, n);
    }
  });
  return errores;
}

// ---------- Enviar ----------
document.getElementById("form-reserva").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ocultarErrores();

  const errores = validar();
  if (errores.length > 0) {
    mostrarErrores(errores);
    return;
  }

  botonConfirmar.disabled = true;
  botonConfirmar.textContent = "Reservando...";

  try {
    const respuesta = await fetch("/api/reservas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_cubiculo: cubiculo.id_cubiculo,
        hora_inicio: inicioIso(selectorHora.value),
        cantidad: cantidad,
        integrantes: otros.map((d) => ({ nombre: d.nombre.trim(), matricula: d.matricula.trim() })),
      }),
    });

    if (respuesta.status === 401) { window.location.href = "/"; return; }
    const datos = await respuesta.json().catch(() => ({}));

    if (respuesta.ok) { window.location.href = "/reserva-confirmada"; return; }
    if (datos.tipo === "cubiculo_ocupado") {
      window.location.href = "/reserva-conflicto?cubiculo=" + numero;
      return;
    }
    mostrarErrores(datos.errores || [datos.error || "No se pudo crear la reserva."]);
  } catch (error) {
    mostrarErrores(["No pudimos conectar con el servidor. Intenta de nuevo."]);
  } finally {
    botonConfirmar.disabled = false;
    botonConfirmar.textContent = "Confirmar reserva";
  }
});

// ---------- Arranque ----------
async function iniciar() {
  try {
    const [rSesion, rCubiculos] = await Promise.all([fetch("/api/sesion"), fetch("/api/cubiculos")]);
    const sesion = await rSesion.json();
    if (sesion.rol !== "estudiante") { window.location.href = "/"; return; }
    if (!rCubiculos.ok) throw new Error("cubiculos");

    cubiculo = (await rCubiculos.json()).find((c) => c.numero === numero);
    if (!cubiculo) { window.location.href = "/disponibilidad"; return; }
    yo = sesion;

    document.getElementById("mi-nombre").value = yo.nombre;
    document.getElementById("mi-matricula").value = yo.matricula;
    document.getElementById("resumen-tipo").textContent =
      cubiculo.tipo === "especial" ? "Cubículo para grupos" : "Cubículo estándar";
    document.getElementById("texto-minimo").textContent =
      "Este cubículo requiere mínimo " + cubiculo.capacidad_minima + " personas.";

    selectorHora.value = horaActualTexto();
    cargarOcupadas(cubiculo.id_cubiculo, document.getElementById("ocupadas"));

    cantidad = cubiculo.capacidad_minima;   // empieza en el mínimo permitido
    actualizarResumen();
    actualizarCantidad();
  } catch (error) {
    mostrarErrores(["No pudimos cargar los datos del cubículo. Recarga la página."]);
  }
}

iniciar();