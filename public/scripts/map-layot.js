document.addEventListener('DOMContentLoaded', function() {
    // Verificar si el contenedor de botones está vacío o ha sido eliminado
    const buttonContainer = document.querySelector('.button-container');
    
    if (!buttonContainer || buttonContainer.children.length === 0) {
        // Si no hay botones, añadir clase para ajustar el layout
        document.querySelector('.container').classList.add('no-buttons');
    }
});