// scripts/historial.js
const CONFIG = {
    SERVER_URL: 'https://smartway.ddns.net',
    WEBSOCKET_URL: 'https://smartway.ddns.net',
}

let currentPage = 1;
let pasajerosChartInstance = null;
let duracionChartInstance = null;

async function cargarEstadisticas(fechaInicio = '', fechaFin = '') {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/estadisticas?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Error al obtener estadísticas');
        const data = await response.json();

        document.getElementById('totalPasajeros').textContent = data.totalPasajeros || 0;
        document.getElementById('totalRutas').textContent = data.totalRutas || 0;
        document.getElementById('tiempoPromedio').textContent = data.tiempoPromedio ? `${data.tiempoPromedio} min` : '0 min';
        document.getElementById('destinosVisitados').textContent = data.destinosVisitados || 0;
        document.getElementById('distanciaPromedio').textContent = data.distanciaPromedio ? `${data.distanciaPromedio} km` : '0 km';

        const conductorIds = ['1', '2', '3', '4', '5'];
        conductorIds.forEach(id => {
            const nombreElement = document.getElementById(`conductor${id}Nombre`) || { textContent: `{conductor${id}Nombre}` };
            const viajesElement = document.getElementById(`conductor${id}Viajes`) || { textContent: `{conductor${id}Viajes}` };
            const conductor = data.conductores.find(c => c.id === id) || {};
            nombreElement.textContent = conductor.nombre || `{conductor${id}Nombre}`;
            viajesElement.textContent = conductor.viajes || `{conductor${id}Viajes}`;
        });
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron cargar las estadísticas. Intente de nuevo.',
            confirmButtonText: 'Aceptar'
        });
    }
}

async function cargarPasajeros(fechaInicio = '', fechaFin = '', page = 1) {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/pasajeros?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}&page=${page}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Error al obtener pasajeros');
        const data = await response.json();
        const tbody = document.getElementById('pasajerosTableBody');
        tbody.innerHTML = '';

        data.pasajeros.forEach(pasajero => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${pasajero.nombre || 'N/A'}</td>
                <td>${pasajero.fecha || 'N/A'}</td>
                <td>${pasajero.hora || 'N/A'}</td>
                <td><span class="frequency-badge ${pasajero.frecuencia === 'Alta' ? 'frequency-high' : pasajero.frecuencia === 'Media' ? 'frequency-medium' : 'frequency-low'}">${pasajero.frecuencia || 'N/A'}</span></td>
            `;
            tbody.appendChild(row);
        });

        const totalPages = data.totalPages || 1;
        document.getElementById('pageInfo').textContent = `Página ${page} de ${totalPages}`;
        document.getElementById('prevPage').disabled = page === 1;
        document.getElementById('nextPage').disabled = page >= totalPages;
    } catch (error) {
        console.error('Error al cargar pasajeros:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron cargar los pasajeros. Intente de nuevo.',
            confirmButtonText: 'Aceptar'
        });
    }
}

async function cargarPasajerosPorDia(fechaInicio = '', fechaFin = '') {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/pasajeros-por-dia?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Error al obtener datos de pasajeros por día');
        const data = await response.json();

        // Destruir la gráfica existente si ya existe
        if (pasajerosChartInstance) {
            pasajerosChartInstance.destroy();
        }

        const ctx = document.getElementById('pasajerosChart').getContext('2d');
        pasajerosChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dias, // Fechas en el eje X
                datasets: [{
                    label: 'Pasajeros por Día',
                    data: data.pasajeros, // Cantidad de pasajeros en el eje Y
                    borderColor: '#0059ff',
                    backgroundColor: 'rgba(0, 204, 102, 0.2)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: '#0059ff'
                }]
            },
            options: {
                scales: {
                    x: { title: { display: true, text: 'Día' } },
                    y: { title: { display: true, text: 'Número de Pasajeros' }, beginAtZero: true }
                },
                plugins: {
                    legend: { display: true, position: 'top' }
                }
            }
        });
    } catch (error) {
        console.error('Error al cargar gráfica de pasajeros por día:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la gráfica de pasajeros por día.',
            confirmButtonText: 'Aceptar'
        });
    }
}

async function cargarDuracionPorDia(fechaInicio = '', fechaFin = '') {
    try {
        const response = await fetch(`${CONFIG.SERVER_URL}/duracion-por-dia?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Error al obtener datos de duración por día');
        const data = await response.json();

        // Destruir la gráfica existente si ya existe
        if (duracionChartInstance) {
            duracionChartInstance.destroy();
        }

        const ctx = document.getElementById('duracionChart').getContext('2d');
        duracionChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dias, // Fechas en el eje X
                datasets: [{
                    label: 'Duración Promedio (min)',
                    data: data.duraciones, // Duración promedio en el eje Y
                    borderColor: '#0059ff',
                    backgroundColor: 'rgba(255, 153, 0, 0.2)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: '#0059ff'
                }]
            },
            options: {
                scales: {
                    x: { title: { display: true, text: 'Día' } },
                    y: { title: { display: true, text: 'Duración (min)' }, beginAtZero: true }
                },
                plugins: {
                    legend: { display: true, position: 'top' }
                }
            }
        });
    } catch (error) {
        console.error('Error al cargar gráfica de duración por día:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la gráfica de duración por día.',
            confirmButtonText: 'Aceptar'
        });
    }
}

function filtrarPorFecha() {
    const fechaInicio = document.getElementById('dateFilter1').value;
    const fechaFin = document.getElementById('dateFilter2').value;
    currentPage = 1; // Reiniciar a la primera página al filtrar
    cargarEstadisticas(fechaInicio, fechaFin);
    cargarPasajeros(fechaInicio, fechaFin, currentPage);
    cargarPasajerosPorDia(fechaInicio, fechaFin);
    cargarDuracionPorDia(fechaInicio, fechaFin);
}

function cambiarPagina(direccion) {
    const fechaInicio = document.getElementById('dateFilter1').value;
    const fechaFin = document.getElementById('dateFilter2').value;
    currentPage += direccion;
    cargarPasajeros(fechaInicio, fechaFin, currentPage);
}

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

function filtrarTabla() {
    const input = document.getElementById('searchInput');
    const filter = input.value.toUpperCase();
    const table = document.getElementById('pasajerosTable');
    const tr = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) {
        const td = tr[i].getElementsByTagName('td')[0];
        if (td) {
            const txtValue = td.textContent || td.innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                tr[i].style.display = '';
            } else {
                tr[i].style.display = 'none';
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Cargar datos iniciales
    cargarEstadisticas();
    cargarPasajeros();
    cargarPasajerosPorDia();
    cargarDuracionPorDia();

    // Configurar eventos de paginación
    document.getElementById('prevPage').addEventListener('click', () => cambiarPagina(-1));
    document.getElementById('nextPage').addEventListener('click', () => cambiarPagina(1));

    // Configurar eventos de filtrado por fecha
    document.getElementById('dateFilter1').addEventListener('change', filtrarPorFecha);
    document.getElementById('dateFilter2').addEventListener('change', filtrarPorFecha);

    // Configurar evento para filtrar la tabla
    document.getElementById('searchInput').addEventListener('keyup', filtrarTabla);

    // Configurar evento para toggleSidebar
    document.querySelector('.menu-icon').addEventListener('click', toggleSidebar);
    document.querySelector('.close-btn').addEventListener('click', toggleSidebar);
});