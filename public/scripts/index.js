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

// Crear y estilizar el modal personalizado
function createConnectionModal() {
    // Crear el contenedor del modal
    const modal = document.createElement('div');
    modal.id = 'connection-modal';
    modal.style.display = 'none'; // Oculto por defecto
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.zIndex = '1000';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';

    // Crear el contenido del modal
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#fff';
    modalContent.style.padding = '20px';
    modalContent.style.borderRadius = '10px';
    modalContent.style.maxWidth = '90%';
    modalContent.style.width = '400px';
    modalContent.style.textAlign = 'center';
    modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

    // Título
    const title = document.createElement('h2');
    title.textContent = 'Sin conexión';
    title.style.color = '#0059FF'; // Color del tema de SmartWay
    title.style.marginBottom = '15px';

    // Mensaje
    const message = document.createElement('p');
    message.textContent = 'Esta aplicación requiere conexión a internet para funcionar. Por favor, conéctate a datos móviles o Wi-Fi.';
    message.style.color = '#333';
    message.style.marginBottom = '20px';

    // Botón de cerrar (para el caso de "Sin conexión")
    const button = document.createElement('button');
    button.textContent = 'Entendido';
    button.style.backgroundColor = '#0059FF';
    button.style.color = '#fff';
    button.style.border = 'none';
    button.style.padding = '10px 20px';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '16px';
    button.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Añadir elementos al modal
    modalContent.appendChild(title);
    modalContent.appendChild(message);
    modalContent.appendChild(button);
    modal.appendChild(modalContent);

    // Añadir el modal al body
    document.body.appendChild(modal);

    return modal;
}

// Crear y estilizar el modal de conexión restaurada
function createConnectionRestoredModal() {
    const modal = document.createElement('div');
    modal.id = 'connection-restored-modal';
    modal.style.display = 'none';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.zIndex = '1000';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';

    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#fff';
    modalContent.style.padding = '20px';
    modalContent.style.borderRadius = '10px';
    modalContent.style.maxWidth = '90%';
    modalContent.style.width = '400px';
    modalContent.style.textAlign = 'center';
    modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

    const title = document.createElement('h2');
    title.textContent = 'Conexión restaurada';
    title.style.color = '#0059FF';
    title.style.marginBottom = '15px';

    const message = document.createElement('p');
    message.textContent = '¡Estás de nuevo en línea! La aplicación debería funcionar correctamente.';
    message.style.color = '#333';
    message.style.marginBottom = '20px';

    // Este modal se cerrará automáticamente después de 3 segundos
    modalContent.appendChild(title);
    modalContent.appendChild(message);
    modal.appendChild(modalContent);

    document.body.appendChild(modal);

    return modal;
}

function monitorConnection() {
    // Crear los modales
    const offlineModal = createConnectionModal();
    const onlineModal = createConnectionRestoredModal();

    // Verificar conexión al cargar la página
    window.addEventListener('load', () => {
        if (!navigator.onLine) {
            offlineModal.style.display = 'flex';
        }
    });

    // Escuchar cambios reales en la conexión
    window.addEventListener('offline', () => {
        offlineModal.style.display = 'flex';
    });

    window.addEventListener('online', () => {
        offlineModal.style.display = 'none'; // Ocultar el modal de "Sin conexión"
        onlineModal.style.display = 'flex';
        setTimeout(() => {
            onlineModal.style.display = 'none';
        }, 3000); // Ocultar después de 3 segundos
    });

    // Escuchar mensajes del Service Worker para detectar fallos de red
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'NETWORK_ERROR') {
                offlineModal.style.display = 'flex';
            }
        });

        // Verificación manual de conexión simulando una solicitud
        const checkNetwork = () => {
            fetch('https://www.google.com', { mode: 'no-cors' })
                .catch(() => {
                    offlineModal.style.display = 'flex';
                });
        };

        // Ejecutar la verificación cada 10 segundos
        setInterval(checkNetwork, 10000);
    }
}

monitorConnection();