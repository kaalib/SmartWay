function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.style.width === '280px') {
        sidebar.style.width = '0';
        sidebar.classList.remove('open');
    } else {
        sidebar.style.width = '280px';
        sidebar.classList.add('open');
    }
}

// Cerrar la barra lateral al hacer clic fuera
document.addEventListener('click', (event) => {
    const sidebar = document.getElementById('sidebar');
    const menuIcon = document.querySelector('.menu-icon');

    // Verificar si el clic fue fuera del sidebar y del ícono de menú, y si el sidebar está abierto
    if (!sidebar.contains(event.target) && !menuIcon.contains(event.target) && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
});

// Cerrar la barra lateral al hacer clic en los enlaces específicos
document.querySelectorAll('#sidebar a[href="#soluciones"], #sidebar a[href="#beneficios"], #sidebar a[href="#contacto"]').forEach(link => {
    link.addEventListener('click', () => {
        toggleSidebar();
    });
});

// Función para limpiar la selección de empresa y redirigir al login
function clearLoginSelection() {
    // Eliminar la selección de empresa guardada
    localStorage.removeItem('selectedCompany');
    
    // Redirigir a la página de login
    window.location.href = 'login.html';
}

