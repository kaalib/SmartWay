document.addEventListener("DOMContentLoaded", function () {
    const loginButton = document.querySelector("button"); // Botón de login
    const userInput = document.querySelector("input[type='text']"); // Usuario
    const passwordInput = document.querySelector("input[type='password']"); // Contraseña
    const togglePassword = document.getElementById("togglePassword");
    const eyeIcon = togglePassword.querySelector("img");

    // 🔹 Mostrar/Ocultar contraseña
    togglePassword.addEventListener("click", function () {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            eyeIcon.src = "media/eye-open.svg"; // Ícono de ojo abierto
        } else {
            passwordInput.type = "password";
            eyeIcon.src = "media/eye-closed.svg"; // Ícono de ojo cerrado
        }
    });

    // 🔹 Evento click del botón de login
    loginButton.addEventListener("click", async function (event) {
        event.preventDefault(); // Evita el envío automático del formulario

        const usuario = userInput.value.trim();
        const contraseña = passwordInput.value.trim();

        if (!usuario || !contraseña) {
            Swal.fire({
                icon: "warning",
                title: "Oops...",
                text: "Debes completar ambos campos.",
            });
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
                // 🔹 Guardamos el rol en localStorage
                localStorage.setItem("userRole", data.role);

                Swal.fire({
                    icon: "success",
                    title: "¡Bienvenido!",
                    text: `Hola, usuario(a)`,
                    showConfirmButton: false,
                    timer: 1500
                }).then(() => {
                    window.location.href = data.redirectUrl; // 🔹 Redirige a map.html
                });

            } else {
                Swal.fire({
                    icon: "error",
                    title: "Acceso denegado",
                    text: data.message,
                });
            }
        } catch (error) {
            console.error("Error en la solicitud:", error);
            Swal.fire({
                icon: "error",
                title: "Error en el servidor",
                text: "Ocurrió un problema al intentar iniciar sesión.",
            });
        }
    });
});
