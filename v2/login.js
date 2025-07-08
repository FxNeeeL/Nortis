document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username-input');
    const loadingOverlay = document.getElementById('loading-overlay'); // Obter o overlay de carregamento

    loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userName = usernameInput.value.trim();
        if (userName) {
            localStorage.setItem('nortis_username', userName);

            // Mostrar o overlay de carregamento
            loadingOverlay.classList.add('visible');

            // Redirecionar após a animação de carregamento
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500); // Atraso de 1.5 segundos para a animação
        }
    });
});