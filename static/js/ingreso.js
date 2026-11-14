$("form-login").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ocultarErrores("caja-errores");

  const identificador = $("identificador").value.trim();
  const contrasena = $("contrasena").value;

  const errores = [];
  if (!identificador) errores.push("Escribe tu matrícula o correo institucional.");
  if (!contrasena) errores.push("Escribe tu contraseña.");
  if (errores.length > 0) { mostrarErrores("caja-errores", errores); return; }

  const boton = $("boton-ingresar");
  boton.disabled = true;
  boton.textContent = "Entrando...";

  const r = await enviarJson("/api/login-estudiante", { identificador, contrasena });
  if (r.ok) {
    window.location.href = "/disponibilidad";
    return;
  }
  mostrarErrores("caja-errores", erroresDe(r.datos));
  boton.disabled = false;
  boton.textContent = "Iniciar sesión";
});