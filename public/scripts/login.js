document.addEventListener("DOMContentLoaded", function () {
    // Elementos del DOM
    const companySelector = document.getElementById("companySelector");
    const loginContainer = document.getElementById("loginContainer");
    const companyCards = document.querySelectorAll(".company-card");
    const backToCompaniesBtn = document.getElementById("backToCompanies");
    const selectedCompanyName = document.getElementById("selectedCompanyName");
    const selectedCompanyLogo = document.getElementById("selectedCompanyLogo");
    
    const loginButton = document.querySelector("button[type='submit']");
    const userInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("togglePassword");
    const eyeIcon = togglePassword.querySelector("img");
    
    // Variable para almacenar la empresa seleccionada
    let selectedCompany = "";
    
    // Configuración de iconos para cada empresa
    const companyIcons = {
        geotaxi: "fa-taxi",
        lieu: "fa-building",
        octopus: "fa-bus",
        artemis: "fa-shuttle-van" // Añadido icono para Artemis
    };
    
    // Evento click para seleccionar empresa
    companyCards.forEach(card => {
        card.addEventListener("click", function() {
            selectedCompany = this.getAttribute("data-company");
            
            // Actualizar la información de la empresa seleccionada
            selectedCompanyName.textContent = this.querySelector("h3").textContent;
            
            // Actualizar el icono
            const iconClass = companyIcons[selectedCompany] || "fa-building";
            selectedCompanyLogo.innerHTML = `<i class="fas ${iconClass}"></i>`;
            
            // Ocultar selector y mostrar login
            companySelector.style.display = "none";
            loginContainer.style.display = "block";
            
            // Guardar la empresa seleccionada en localStorage
            localStorage.setItem("selectedCompany", selectedCompany);
        });
    });
    
    // Evento para volver a la selección de empresas
    backToCompaniesBtn.addEventListener("click", function() {
        loginContainer.style.display = "none";
        companySelector.style.display = "block";
    });
    
    // Restaurar la empresa seleccionada si existe en localStorage
    if (localStorage.getItem("selectedCompany")) {
        const savedCompany = localStorage.getItem("selectedCompany");
        const companyCard = document.querySelector(`.company-card[data-company="${savedCompany}"]`);
        
        if (companyCard) {
            // Simular click en la empresa guardada
            companyCard.click();
        }
    }
    
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
            // Incluir la empresa seleccionada en la solicitud
            const response = await fetch("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    usuario, 
                    contraseña,
                    empresa: selectedCompany // Enviar la empresa seleccionada
                }),
            });

            const data = await response.json();

            if (data.success) {
                // 🔹 Guardamos el rol y la empresa en localStorage
                localStorage.setItem("userRole", data.role);
                localStorage.setItem("userCompany", selectedCompany);

                Swal.fire({
                    icon: "success",
                    title: "¡Bienvenido!",
                    text: `Hola, usuario(a) de ${selectedCompanyName.textContent}`,
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