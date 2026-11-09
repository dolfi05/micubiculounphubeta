// Compartido por todas las pantallas del estudiante.
async function cargarSesion() {
  try {
    const respuesta = await fetch("/api/sesion");
    const datos = await respuesta.json();
    if (datos.rol !== "estudiante") {
      window.location.href = "/";   // sin ingreso, de vuelta a la pantalla 1
      return;
    }
    document.getElementById("usuario-nombre").textContent = datos.nombre;
    document.getElementById("usuario-matricula").textContent = datos.matricula;
  } catch (error) {
    window.location.href = "/";
  }
}

document.getElementById("boton-salir").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

cargarSesion();