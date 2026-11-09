// Compartido por todas las pantallas del personal.
async function cargarSesion() {
  try {
    const respuesta = await fetch("/api/sesion");
    const datos = await respuesta.json();
    if (datos.rol !== "personal") {
      window.location.href = "/personal";   // sin sesión, al login del personal
      return;
    }
    document.getElementById("usuario-nombre").textContent = datos.nombre;
  } catch (error) {
    window.location.href = "/personal";
  }
}

document.getElementById("boton-salir").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/personal";
});

cargarSesion();