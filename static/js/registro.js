const datos = { nombre: "", matricula: "", correo: "", codigo: "" };

function mostrarPaso(n) {
  for (const i of [1, 2, 3]) {
    $("paso-" + i).classList.toggle("d-none", i !== n);
    $("punto-" + i).classList.toggle("activo", i <= n);
  }
  ocultarErrores("caja-errores");
}

// Autorrelleno y formato de la matrícula
$("correo").addEventListener("input", () => {
  const m = matriculaDelCorreo($("correo").value);
  if (m) $("matricula").value = m;
});
$("matricula").addEventListener("input", () => formatearMatricula($("matricula")));
$("codigo").addEventListener("input", () => soloDigitos($("codigo")));

// ---------- Paso 1: pedir el código ----------
async function pedirCodigo(boton, textoBoton) {
  boton.disabled = true;
  boton.textContent = "Enviando...";
  const r = await enviarJson("/api/registro/solicitar", {
    nombre: datos.nombre, matricula: datos.matricula, correo: datos.correo,
  });
  boton.disabled = false;
  boton.textContent = textoBoton;
  return r;
}

$("paso-1").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ocultarErrores("caja-errores");

  datos.nombre = $("nombre").value.trim();
  datos.correo = $("correo").value.trim().toLowerCase();
  datos.matricula = $("matricula").value.trim();

  const errores = [];
  if (!datos.nombre) errores.push("Escribe tu nombre completo.");
  if (!/^\d{2}-\d{4}$/.test(datos.matricula)) errores.push("La matrícula no es válida. Usa el formato 24-0302.");
  const deCorreo = matriculaDelCorreo(datos.correo);
  if (!deCorreo) errores.push("Usa tu correo institucional, por ejemplo da20-0099@unphu.edu.do.");
  else if (deCorreo !== datos.matricula) errores.push("La matrícula del correo no coincide con la matrícula escrita.");
  if (errores.length > 0) { mostrarErrores("caja-errores", errores); return; }

  const r = await pedirCodigo($("boton-1"), "Enviar código");
  if (!r.ok) { mostrarErrores("caja-errores", erroresDe(r.datos)); return; }

  $("texto-correo").textContent = datos.correo;
  mostrarPaso(2);
  iniciarEspera($("reenviar"), 60, "Reenviar código");
  $("codigo").focus();
});

// ---------- Paso 2: verificar el código ----------
$("paso-2").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ocultarErrores("caja-errores");

  const codigo = $("codigo").value.trim();
  if (!/^\d{6}$/.test(codigo)) { mostrarErrores("caja-errores", ["El código tiene 6 dígitos."]); return; }

  const boton = $("boton-2");
  boton.disabled = true;
  boton.textContent = "Verificando...";
  const r = await enviarJson("/api/registro/verificar", { correo: datos.correo, codigo });
  boton.disabled = false;
  boton.textContent = "Verificar código";

  if (!r.ok) { mostrarErrores("caja-errores", erroresDe(r.datos)); return; }
  datos.codigo = codigo;
  mostrarPaso(3);
  $("contrasena").focus();
});

$("reenviar").addEventListener("click", async () => {
  ocultarErrores("caja-errores");
  const r = await pedirCodigo($("reenviar"), "Reenviar código");
  if (!r.ok) {
    mostrarErrores("caja-errores", erroresDe(r.datos));
    $("reenviar").disabled = false;
    return;
  }
  $("codigo").value = "";
  iniciarEspera($("reenviar"), 60, "Reenviar código");
});

$("volver-1").addEventListener("click", () => mostrarPaso(1));

// ---------- Paso 3: crear la contraseña y la cuenta ----------
$("paso-3").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ocultarErrores("caja-errores");

  const contrasena = $("contrasena").value;
  const repetir = $("repetir").value;
  const problema = errorContrasena(contrasena, repetir);
  if (problema) { mostrarErrores("caja-errores", [problema]); return; }

  const boton = $("boton-3");
  boton.disabled = true;
  boton.textContent = "Creando cuenta...";
  const r = await enviarJson("/api/registro/completar", { ...datos, contrasena, repetir });

  if (r.ok) {
    window.location.href = "/disponibilidad";   // ya quedó con la sesión iniciada
    return;
  }
  mostrarErrores("caja-errores", erroresDe(r.datos));
  boton.disabled = false;
  boton.textContent = "Crear cuenta";
});