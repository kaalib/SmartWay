// scripts/historial.js
const CONFIG = {
    SERVER_URL: 'https://smartway.ddns.net', // Mantengo tu URL actual
    WEBSOCKET_URL: 'https://smartway.ddns.net',
};

let currentPage = 1;
let pasajerosChartInstance = null;
let duracionChartInstance = null;

// Plugin para dibujar líneas punteadas de promedio en las gráficas
const promedioLinePlugin = {
    id: 'promedioLine',
    afterDraw: (chart, args, options) => {
        const { ctx, scales } = chart;
        const yScale = scales['y'];
        const xStart = scales['x'].left;
        const xEnd = scales['x'].right;

        // Obtener los promedios desde las opciones del plugin
        const promedios = options.promedios || [];

        promedios.forEach(({ value, color }) => {
            const yValue = yScale.getPixelForValue(value);
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([5, 5]); // Línea punteada
            ctx.moveTo(xStart, yValue);
            ctx.lineTo(xEnd, yValue);
            ctx.strokeStyle = color; // Usar el color del dataset
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        });
    }
};

// Registrar el plugin globalmente
Chart.register(promedioLinePlugin);

async function cargarEstadisticas(fechaInicio = '', fechaFin = '') {
    try {
        // Construir la URL solo con parámetros si tienen valor
        let url = `${CONFIG.SERVER_URL}/estadisticas`;
        const params = [];
        if (fechaInicio) params.push(`fechaInicio=${fechaInicio}`);
        if (fechaFin) params.push(`fechaFin=${fechaFin}`);
        if (params.length > 0) url += `?${params.join('&')}`;

        console.log('Solicitando:', url); // Depuración
        const response = await fetch(url, {
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
            // Formatear la fecha a "YYYY-MM-DD" si viene como ISO
            const fechaFormateada = new Date(pasajero.fecha).toISOString().split('T')[0];
            row.innerHTML = `
                <td>${pasajero.nombre || 'N/A'}</td>
                <td>${fechaFormateada || 'N/A'}</td>
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
                    borderColor: '#0059ff', // Azul
                    backgroundColor: 'rgba(0, 89, 255, 0.1)', // Fondo más suave
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
                    promedioLine: {
                        promedios: [
                            { value: promedioPasajeros, color: '#0059ff' }
                        ]
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
                        borderColor: '#28A745', // Verde oscuro
                        backgroundColor: 'rgba(40, 167, 69, 0.1)', // Fondo más suave
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#28A745'
                    },
                    {
                        label: 'Distancia por Día (km)',
                        data: data.distancias,
                        borderColor: '#FFC107', // Amarillo mostaza
                        backgroundColor: 'rgba(255, 193, 7, 0.1)', // Fondo más suave
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#FFC107'
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
                    promedioLine: {
                        promedios: [
                            { value: promedioDuracion, color: '#28A745' }, // Línea para duración
                            { value: promedioDistancia, color: '#FFC107' } // Línea para distancia
                        ]
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
    const dateFilter1 = document.getElementById('dateFilter1');
    const dateFilter2 = document.getElementById('dateFilter2');
    const today = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD

    // Establecer el máximo como la fecha actual
    dateFilter1.max = today;
    dateFilter2.max = today;

    // Función para deshabilitar clics inválidos
    function updateDateLimits() {
        const startDate = dateFilter1.value;
        dateFilter2.min = startDate || '2020-01-01'; // Mantengo tu fecha por defecto (2020-01-01)
        if (startDate && new Date(startDate) > new Date(dateFilter2.value)) {
            dateFilter2.value = startDate; // Forzar que fin no sea menor que inicio
        }
    }

    // Función debounce
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Reemplazar el event listener con debounce
    dateFilter1.addEventListener('change', debounce(() => {
        updateDateLimits();
        filtrarPorFecha();
    }, 300));
    dateFilter2.addEventListener('change', debounce(() => {
        updateDateLimits();
        filtrarPorFecha();
    }, 300));

    // Cargar datos iniciales
    cargarEstadisticas();
    cargarPasajeros();
    cargarPasajerosPorDia();
    cargarDuracionPorDia();

    document.getElementById('prevPage').addEventListener('click', () => cambiarPagina(-1));
    document.getElementById('nextPage').addEventListener('click', () => cambiarPagina(1));
    document.getElementById('searchInput').addEventListener('keyup', filtrarTabla);
    document.querySelector('.menu-icon').addEventListener('click', toggleSidebar);
    document.querySelector('.close-btn').addEventListener('click', toggleSidebar);
});