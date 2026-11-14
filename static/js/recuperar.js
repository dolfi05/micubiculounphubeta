const datos = { correo: "", codigo: "" };

function mostrarPaso(n) {
  for (const i of [1, 2, 3]) {
    $("paso-" + i).classList.toggle("d-none", i !== n);
    $("punto-" + i).classList.toggle("activo", i <= n);
  }
  ocultarErrores("caja-errores");
}

$("codigo").addEventListener("input", () => soloDigitos($("codigo")));

async function pedirCodigo(boton, textoBoton) {
  boton.disabled = true;
  boton.textContent = "Enviando...";
  const r = await enviarJson("/api/recuperar/solicitar", { correo: datos.correo });
  boton.disabled = false;
  boton.textContent = textoBoton;
  return r;
}

// ---------- Paso 1 ----------
$("paso-1").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ocultarErrores("caja-errores");

  datos.correo = $("correo").value.trim().toLowerCase();
  if (!matriculaDelCorreo(datos.correo)) {
    mostrarErrores("caja-errores", ["Usa tu correo institucional, por ejemplo da20-0099@unphu.edu.do."]);
    return;
  }
  const r = await pedirCodigo($("boton-1"), "Enviar código");
  if (!r.ok) { mostrarErrores("caja-errores", erroresDe(r.datos)); return; }

  $("texto-correo").textContent = datos.correo;
  mostrarPaso(2);
  iniciarEspera($("reenviar"), 60, "Reenviar código");
  $("codigo").focus();
});

// ---------- Paso 2 ----------
$("paso-2").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ocultarErrores("caja-errores");

  const codigo = $("codigo").value.trim();
  if (!/^\d{6}$/.test(codigo)) { mostrarErrores("caja-errores", ["El código tiene 6 dígitos."]); return; }

  const boton = $("boton-2");
  boton.disabled = true;
  boton.textContent = "Verificando...";
  const r = await enviarJson("/api/recuperar/verificar", { correo: datos.correo, codigo });
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

// ---------- Paso 3 ----------
$("paso-3").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  ocultarErrores("caja-errores");

  const contrasena = $("contrasena").value;
  const repetir = $("repetir").value;
  const problema = errorContrasena(contrasena, repetir);
  if (problema) { mostrarErrores("caja-errores", [problema]); return; }

  const boton = $("boton-3");
  boton.disabled = true;
  boton.textContent = "Guardando...";
  const r = await enviarJson("/api/recuperar/cambiar", { ...datos, contrasena, repetir });

  if (r.ok) {
    for (const i of [1, 2, 3]) $("paso-" + i).classList.add("d-none");
    document.querySelector(".pasos").classList.add("d-none");
    $("pie").classList.add("d-none");
    $("listo").classList.remove("d-none");
    return;
  }
  mostrarErrores("caja-errores", erroresDe(r.datos));
  boton.disabled = false;
  boton.textContent = "Guardar contraseña";
});