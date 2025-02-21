document.addEventListener("DOMContentLoaded", function () {
    const sidebar = document.querySelector(".sidebar");
    const openBtn = document.querySelector(".menu-icon"); // Asegúrate de tener un botón para abrir
    const closeBtn = document.querySelector(".close-btn");

    function openSidebar() {
        sidebar.style.width = "250px"; // Ajusta el ancho que usas para abrir el sidebar
    }

    function closeSidebar() {
        sidebar.style.width = "0";
    }

    openBtn.addEventListener("click", openSidebar);
    closeBtn.addEventListener("click", closeSidebar);

    // Cerrar al hacer clic fuera del sidebar
    document.addEventListener("click", function (event) {
        if (!sidebar.contains(event.target) && !openBtn.contains(event.target)) {
            closeSidebar();
        }
    });
});
