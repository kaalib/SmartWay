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

        const conductorIds = [41, 42, 43, 44, 45];
        conductorIds.forEach(id => {
            const nombreElement = document.getElementById(`conductor${id}Nombre`);
            const viajesElement = document.getElementById(`conductor${id}Viajes`);
            if (nombreElement && viajesElement) {
                const conductor = data.conductores.find(c => c.id === id) || {};
                nombreElement.textContent = conductor.nombre || `{conductor${id}Nombre}`;
                viajesElement.textContent = conductor.viajes || 0;
            }
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
        console.log(`Solicitando /pasajeros?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}&page=${page}`);
        const response = await fetch(`${CONFIG.SERVER_URL}/pasajeros?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}&page=${page}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Datos recibidos:', data);

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
            text: `No se pudieron cargar los pasajeros: ${error.message}`,
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

        if (pasajerosChartInstance) {
            pasajerosChartInstance.destroy();
        }

        // Calcular el promedio real de pasajeros
        const promedioPasajeros = data.pasajeros.length > 0 
            ? data.pasajeros.reduce((sum, val) => sum + val, 0) / data.pasajeros.length 
            : 0;

        const ctx = document.getElementById('pasajerosChart').getContext('2d');
        pasajerosChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dias.map(d => new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })), // Formato MM/DD
                datasets: [{
                    label: 'Pasajeros por Día',
                    data: data.pasajeros,
                    borderColor: '#0059ff',
                    backgroundColor: 'rgba(0, 89, 255, 0.2)',
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
                    legend: { display: true, position: 'top' },
                    // Plugin para dibujar la línea de promedio
                    afterDatasetDraw: (chart) => {
                        const ctx = chart.ctx;
                        const yScale = chart.scales['y'];
                        const yValue = yScale.getPixelForValue(promedioPasajeros);
                        const xStart = chart.scales['x'].left;
                        const xEnd = chart.scales['x'].right;

                        ctx.save();
                        ctx.beginPath();
                        ctx.setLineDash([5, 5]); // Línea punteada
                        ctx.moveTo(xStart, yValue);
                        ctx.lineTo(xEnd, yValue);
                        ctx.strokeStyle = '#0059ff'; // Mismo color que el dataset
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        ctx.restore();
                    }
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

        if (duracionChartInstance) {
            duracionChartInstance.destroy();
        }

        // Calcular los promedios reales
        const promedioDuracion = data.duraciones.length > 0 
            ? data.duraciones.reduce((sum, val) => sum + val, 0) / data.duraciones.length 
            : 0;
        const promedioDistancia = data.distancias.length > 0 
            ? data.distancias.reduce((sum, val) => sum + val, 0) / data.distancias.length 
            : 0;

        const ctx = document.getElementById('duracionChart').getContext('2d');
        duracionChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dias.map(d => new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })), // Formato MM/DD
                datasets: [
                    {
                        label: 'Duración por Día (min)',
                        data: data.duraciones,
                        borderColor: '#FF9900',
                        backgroundColor: 'rgba(255, 153, 0, 0.2)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#FF9900'
                    },
                    {
                        label: 'Distancia por Día (km)',
                        data: data.distancias,
                        borderColor: '#FF4444',
                        backgroundColor: 'rgba(255, 68, 68, 0.2)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#FF4444'
                    }
                ]
            },
            options: {
                scales: {
                    x: { title: { display: true, text: 'Día' } },
                    y: { title: { display: true, text: 'Valor' }, beginAtZero: true }
                },
                plugins: {
                    legend: { display: true, position: 'top' },
                    // Plugin para dibujar las líneas de promedio
                    afterDatasetsDraw: (chart) => {
                        const ctx = chart.ctx;
                        const yScale = chart.scales['y'];
                        const xStart = chart.scales['x'].left;
                        const xEnd = chart.scales['x'].right;

                        // Línea punteada para duración promedio
                        const yDuracion = yScale.getPixelForValue(promedioDuracion);
                        ctx.save();
                        ctx.beginPath();
                        ctx.setLineDash([5, 5]);
                        ctx.moveTo(xStart, yDuracion);
                        ctx.lineTo(xEnd, yDuracion);
                        ctx.strokeStyle = '#FF9900'; // Mismo color que el dataset de duración
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        ctx.restore();

                        // Línea punteada para distancia promedio
                        const yDistancia = yScale.getPixelForValue(promedioDistancia);
                        ctx.save();
                        ctx.beginPath();
                        ctx.setLineDash([5, 5]);
                        ctx.moveTo(xStart, yDistancia);
                        ctx.lineTo(xEnd, yDistancia);
                        ctx.strokeStyle = '#FF4444'; // Mismo color que el dataset de distancia
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        ctx.restore();
                    }
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
    currentPage = 1;
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
    cargarEstadisticas();
    cargarPasajeros();
    cargarPasajerosPorDia();
    cargarDuracionPorDia();

    document.getElementById('prevPage').addEventListener('click', () => cambiarPagina(-1));
    document.getElementById('nextPage').addEventListener('click', () => cambiarPagina(1));
    document.getElementById('dateFilter1').addEventListener('change', filtrarPorFecha);
    document.getElementById('dateFilter2').addEventListener('change', filtrarPorFecha);
    document.getElementById('searchInput').addEventListener('keyup', filtrarTabla);
    document.querySelector('.menu-icon').addEventListener('click', toggleSidebar);
    document.querySelector('.close-btn').addEventListener('click', toggleSidebar);
});