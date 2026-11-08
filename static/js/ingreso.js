const MATRICULA_VALIDA = /^\d{2}-\d{4}$/;   // formato 24-0302

const form = document.getElementById("form-ingreso");
const boton = document.getElementById("boton-ingresar");
const cajaErrores = document.getElementById("caja-errores");
const listaErrores = document.getElementById("lista-errores");

function limpiar() {
  for (const campo of ["nombre", "matricula"]) {
    document.getElementById(campo).classList.remove("campo-error");
    document.getElementById("error-" + campo).textContent = "";
  }
  cajaErrores.classList.add("d-none");
  listaErrores.innerHTML = "";
}

function marcar(campo, mensaje) {
  document.getElementById(campo).classList.add("campo-error");
  document.getElementById("error-" + campo).textContent = mensaje;
}

function mostrarErrorGeneral(texto) {
  // El servidor puede mandar varios errores separados por " | "
  for (const mensaje of texto.split(" | ")) {
    const li = document.createElement("li");
    li.textContent = mensaje;   // textContent evita que se inserte HTML ajeno
    listaErrores.appendChild(li);
  }
  cajaErrores.classList.remove("d-none");
}

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();   // evita que el navegador recargue la página
  limpiar();

  const nombre = document.getElementById("nombre").value.trim();
  const matricula = document.getElementById("matricula").value.trim();

  // Validación en el frontend (el backend y SQL la repiten)
  let hayError = false;
  if (!nombre) {
    marcar("nombre", "Escribe tu nombre completo.");
    hayError = true;
  }
  if (!matricula) {
    marcar("matricula", "Escribe tu matrícula.");
    hayError = true;
  } else if (!MATRICULA_VALIDA.test(matricula)) {
    marcar("matricula", "La matrícula no es válida. Usa el formato 24-0302.");
    hayError = true;
  }
  if (hayError) return;

  boton.disabled = true;
  boton.textContent = "Ingresando...";

  try {
    const respuesta = await fetch("/api/ingreso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, matricula }),
    });
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mostrarErrorGeneral(datos.error || "No se pudo ingresar. Intenta de nuevo.");
      return;
    }
    window.location.href = "/disponibilidad";   // esta pantalla se crea en la Parte 7B
  } catch (error) {
    mostrarErrorGeneral("No pudimos conectar con el servidor. Intenta de nuevo.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Ingresar";
  }
});