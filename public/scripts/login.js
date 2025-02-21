document.addEventListener("DOMContentLoaded", function () {
    const loginButton = document.querySelector("button"); // Botón de login
    const userInput = document.querySelector("input[type='text']"); // Usuario
    const passwordInput = document.querySelector("input[type='password']"); // Contraseña
    const togglePassword = document.getElementById("togglePassword");

    // Mostrar/Ocultar contraseña
    togglePassword.addEventListener("click", function () {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            togglePassword.textContent = "🙈"; // Cambia el icono
        } else {
            passwordInput.type = "password";
            togglePassword.textContent = "👁️";
        }
    });

    // Evento click del botón de login
    loginButton.addEventListener("click", async function (event) {
        event.preventDefault(); // Evita el envío automático del formulario

        const usuario = userInput.value.trim();
        const contraseña = passwordInput.value.trim();

        if (!usuario || !contraseña) {
            alert("⚠️ Debes completar ambos campos.");
            return;
        }

        try {
            const response = await fetch("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usuario, contraseña }),
            });

            const data = await response.json();

            if (data.success) {
                alert("✅ Inicio de sesión exitoso.");
                window.location.href = "map.html"; // Redirige al mapa
            } else {
                alert("❌ Usuario o contraseña incorrectos.");
            }
        } catch (error) {
            console.error("Error en la solicitud:", error);
            alert("❌ Error en el servidor.");
        }
    });
});
