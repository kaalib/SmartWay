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

    if (role === "Empleado") {
        ocultarElementos(["button-container", "message-container", "message-toggle"]);
        ocultarEnlacesAdmin();
    } else if (role === "Administrador") {
        ocultarElementos(["button-container"]);
    } else if (role === "Conductor") {
        ocultarEnlacesAdmin();
    } else {
        // window.location.href = "login.html"; // Descomentar si necesitas redirección
    }
}

export { checkUserRole, ocultarElementos, ocultarEnlacesAdmin };