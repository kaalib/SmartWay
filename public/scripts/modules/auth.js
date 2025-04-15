// scripts/modules/auth.js
function ocultarElementos(ids) {
    ids.forEach(id => {
        const elem = document.getElementById(id) || document.querySelector(`.${id}`);
        if (elem) elem.remove();
    });
}

function ocultarEnlacesAdmin() {
    const enlacesAdmin = document.querySelectorAll('.admin-link');
    enlacesAdmin.forEach(enlace => enlace.remove());
}

function checkUserRole() {
    // Determinar si estamos en localhost
    const esLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // Si estamos en localhost, permitir acceso completo sin restricciones
    if (esLocalhost) {
        console.log("🖥️ Ejecutando en localhost, ignorando restricciones de roles...");
        return; // No aplicar ninguna restricción, permitir acceso a todas las páginas
    }

    // Si no estamos en localhost, aplicar las reglas de acceso normalmente
    console.log("🌐 Ejecutando en producción, aplicando restricciones de roles...");

    const role = localStorage.getItem("userRole");
    const currentPage = window.location.pathname.split("/").pop() || "index.html";

    // Si no hay rol, redirigir a login
    if (!role) {
        window.location.href = "login.html";
        return;
    }

    // Reglas por página
    if (currentPage === "map.html") {
        if (role === "Empleado") {
            ocultarElementos(["button-container", "message-container", "message-toggle"]);
            ocultarEnlacesAdmin();
        } else if (role === "Administrador") {
            ocultarElementos(["button-container"]);
        } else if (role === "Conductor") {
            ocultarEnlacesAdmin();
        } else {
            window.location.href = "login.html";
        }
    } else if (currentPage === "historial.html" || currentPage === "seguridad.html") {
        if (role !== "Administrador") {
            window.location.href = "login.html";
        }
        // Si es Administrador, no hacer nada (permite acceso)
    } else {
        // Para otras páginas no protegidas, no hacer nada o redirigir según tu preferencia
        // Por ejemplo: window.location.href = "login.html";
    }
}

export { checkUserRole };