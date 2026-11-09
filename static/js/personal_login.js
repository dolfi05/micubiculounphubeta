const form = document.getElementById("form-login");
const boton = document.getElementById("boton-entrar");
const cajaErrores = document.getElementById("caja-errores");
const textoError = document.getElementById("texto-error");
const CAMPOS = ["usuario", "contrasena"];

function limpiar() {
  for (const campo of CAMPOS) {
    document.getElementById(campo).classList.remove("campo-error");
    document.getElementById("error-" + campo).textContent = "";
  }
  cajaErrores.classList.add("d-none");
}

function marcar(campo, mensaje) {
  document.getElementById(campo).classList.add("campo-error");
  document.getElementById("error-" + campo).textContent = mensaje;
}

function mostrarFallo(mensaje) {
  textoError.textContent = mensaje;   // textContent: nunca insertamos HTML ajeno
  cajaErrores.classList.remove("d-none");
  boton.textContent = "Intentar de nuevo";
}

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limpiar();

  const usuario = document.getElementById("usuario").value.trim();
  const contrasena = document.getElementById("contrasena").value;

  let hayError = false;
  if (!usuario) { marcar("usuario", "Escribe tu usuario."); hayError = true; }
  if (!contrasena) { marcar("contrasena", "Escribe tu contraseña."); hayError = true; }
  if (hayError) return;

  boton.disabled = true;
  boton.textContent = "Entrando...";

  try {
    const respuesta = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, contrasena }),
    });
    const datos = await respuesta.json().catch(() => ({}));

    if (respuesta.ok) {
      window.location.href = "/panel";
      return;
    }
    if (respuesta.status === 401) {
      marcar("usuario", "");
      marcar("contrasena", "");
      mostrarFallo("El usuario o la contraseña no son correctos. No se pudo iniciar sesión.");
    } else {
      mostrarFallo(datos.error || "No se pudo iniciar sesión. Intenta de nuevo.");
    }
  } catch (error) {
    mostrarFallo("No pudimos conectar con el servidor. Intenta de nuevo.");
  } finally {
    boton.disabled = false;
    if (cajaErrores.classList.contains("d-none")) boton.textContent = "Entrar al panel";
  }
});