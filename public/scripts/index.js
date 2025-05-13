// Función para alternar la barra lateral
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
    localStorage.removeItem('selectedCompany');
    window.location.href = 'login.html';
}

// Manejar el formulario de contacto con EmailJS
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar EmailJS con tu Public Key
    emailjs.init('m2e_8rlsYzkmWWdZB'); // Reemplazado con tu Public Key

    const form = document.querySelector('#contacto form');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = document.getElementById('name').value.trim();
        const company = document.getElementById('company').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const message = document.getElementById('message').value.trim();

        if (!name || !company || !email || !message) {
            Swal.fire({
                icon: 'error',
                title: 'Campos incompletos',
                text: 'Por favor, completa todos los campos requeridos (Nombre, Empresa, Correo Electrónico y Mensaje).',
                confirmButtonText: 'Aceptar'
            });
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            Swal.fire({
                icon: 'error',
                title: 'Correo inválido',
                text: 'Por favor, ingresa un correo electrónico válido.',
                confirmButtonText: 'Aceptar'
            });
            return;
        }

        const templateParams = {
            from_name: name,
            company: company,
            from_email: email,
            phone: phone || 'No proporcionado',
            message: message,
            to_email: 'ojarroyo@uninorte.edu.co'
        };

        try {
            await emailjs.send('service_i4gmp48', 'template_n3dhpj2', templateParams); // Reemplazado con tu Service ID y Template ID
            Swal.fire({
                icon: 'success',
                title: 'Mensaje enviado',
                text: 'Hemos recibido tu mensaje. Te contactaremos pronto.',
                confirmButtonText: 'Aceptar'
            });
            form.reset();
        } catch (error) {
            console.error('❌ Error al enviar el correo:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al enviar el mensaje. Por favor, intenta de nuevo.',
                confirmButtonText: 'Aceptar'
            });
        }
    });
});