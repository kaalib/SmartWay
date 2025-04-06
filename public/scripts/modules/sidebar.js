// scripts/modules/sidebar.js
function configurarBarrasLaterales() {
    const sidebar = document.querySelector('.sidebar');
    const menuIcon = document.querySelector('.menu-icon');
    const sidebarCloseBtn = document.querySelector('.sidebar .close-btn');

    function openSidebar() {
        sidebar.style.width = '230px';
    }

    function closeSidebar() {
        sidebar.style.width = '0';
    }

    menuIcon.addEventListener('click', openSidebar);
    sidebarCloseBtn.addEventListener('click', closeSidebar);

    const messageSidebar = document.querySelector('.message-sidebar');
    const messageToggle = document.querySelector('.message-toggle');
    const messageCloseBtn = document.querySelector('.message-sidebar .close-btn');

    function openMessageSidebar() {
        messageSidebar.style.width = '230px';
    }

    function closeMessageSidebar() {
        messageSidebar.style.width = '0';
    }

    messageToggle.addEventListener('click', openMessageSidebar);
    messageCloseBtn.addEventListener('click', closeMessageSidebar);

    document.addEventListener('click', function (event) {
        if (!sidebar.contains(event.target) && !menuIcon.contains(event.target)) {
            closeSidebar();
        }
        if (!messageSidebar.contains(event.target) && !messageToggle.contains(event.target)) {
            closeMessageSidebar();
        }
    });
}

export { configurarBarrasLaterales };