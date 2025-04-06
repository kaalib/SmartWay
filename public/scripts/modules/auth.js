// Gestión de roles y permisos
import { ocultarElementos } from '../utils/helpers.js';

// Verificar el rol del usuario y configurar permisos
export function checkUserRole() {
    const role = localStorage.getItem("userRole");

    if (role === "Empleado") {
        ocultarElementos(["button-container", "message-container", "message-toggle"]);
        ocultarEnlacesAdmin();
    } else if (role === "Administrador") {
        ocultarElementos(["button-container"]);
        // Los administradores ven todos los enlaces
    } else if (role === "Conductor") {
        // El conductor no ve los enlaces de administrador
        ocultarEnlacesAdmin();
    } else {
        //window.location.href = "login.html"; // Redirigir si no hay rol válido
    }
}

// Ocultar enlaces de administrador
export function ocultarEnlacesAdmin() {
    // Seleccionar todos los elementos con la clase admin-link
    const enlacesAdmin = document.querySelectorAll('.admin-link');
    
    // Eliminar cada uno de los enlaces de administrador
    enlacesAdmin.forEach(enlace => {
        enlace.remove();
    });
}