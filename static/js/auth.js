// Funciones compartidas por login, registro y recuperación.
const $ = (id) => document.getElementById(id);

async function enviarJson(url, cuerpo) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const datos = await r.json().catch(() => ({}));
    return { ok: r.ok, estado: r.status, datos };
  } catch (e) {
    return { ok: false, estado: 0, datos: { error: "No pudimos conectar con el servidor. Intenta de nuevo." } };
  }
}

function erroresDe(datos) {
  if (datos.errores) return datos.errores;
  return datos.error ? datos.error.split(" | ") : ["Ocurrió un error. Intenta de nuevo."];
}

function mostrarErrores(idCaja, mensajes) {
  const caja = $(idCaja);
  const lista = caja.querySelector("ul");
  lista.replaceChildren();
  for (const mensaje of mensajes) {
    const li = document.createElement("li");
    li.textContent = mensaje;   // textContent: nunca insertamos HTML ajeno
    lista.appendChild(li);
  }
  caja.classList.remove("d-none");
}

function ocultarErrores(idCaja) {
  $(idCaja).classList.add("d-none");
}

// 200099 -> 20-0099
function formatearMatricula(input) {
  const digitos = input.value.replace(/\D/g, "").substring(0, 6);
  input.value = digitos.length > 2 ? digitos.substring(0, 2) + "-" + digitos.substring(2) : digitos;
}

// da20-0099@unphu.edu.do -> 20-0099 (o null)
function matriculaDelCorreo(correo) {
  const m = /^[a-z]+(\d{2}-\d{4})@unphu\.edu\.do$/i.exec(correo.trim());
  return m ? m[1] : null;
}

// Solo deja escribir dígitos en el campo del código
function soloDigitos(input) {
  input.value = input.value.replace(/\D/g, "").substring(0, 6);
}

// Deshabilita un botón durante 'segundos' mostrando la cuenta regresiva
function iniciarEspera(boton, segundos, textoNormal) {
  let restante = segundos;
  boton.disabled = true;
  boton.textContent = textoNormal + " (" + restante + ")";
  const reloj = setInterval(() => {
    restante--;
    if (restante <= 0) {
      clearInterval(reloj);
      boton.disabled = false;
      boton.textContent = textoNormal;
    } else {
      boton.textContent = textoNormal + " (" + restante + ")";
    }
  }, 1000);
}

// Casillas "Mostrar contraseña": <input type="checkbox" data-mostrar="campo1,campo2">
document.querySelectorAll("[data-mostrar]").forEach((casilla) => {
  casilla.addEventListener("change", () => {
    for (const id of casilla.dataset.mostrar.split(",")) {
      $(id).type = casilla.checked ? "text" : "password";
    }
  });
});

// Misma regla que el servidor
function errorContrasena(contrasena, repetir) {
  if (contrasena.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[A-Za-z]/.test(contrasena) || !/\d/.test(contrasena)) return "La contraseña debe tener letras y números.";
  if (contrasena !== repetir) return "Las contraseñas no coinciden.";
  return null;
}