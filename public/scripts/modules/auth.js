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
    const role = localStorage.getItem("userRole");
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // Excepción para localhost: permitir acceso completo sin restricciones
    if (isLocalhost) {
        return; // No aplicar reglas de roles ni redirecciones
    }

    // Si no hay rol, redirigir a login (solo en no-localhost)
    if (!role) {
        window.location.href = "login.html";
        return;
    }

    // Reglas por página (solo en no-localhost)
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