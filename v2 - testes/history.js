const token = localStorage.getItem('nortis_token');
const userName = localStorage.getItem('nortis_user_name');

if (!token || !userName) {
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'https://nortis-api-matheus.onrender.com/api';

    const formatarMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

    const setupTheme = () => {
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        if (!themeToggleBtn) return;
        const themeIcon = themeToggleBtn.querySelector('i');
        const applyTheme = (theme) => {
            document.body.classList.toggle('dark-mode', theme === 'dark');
            themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        };
        const currentTheme = localStorage.getItem('nortis_theme');
        applyTheme(currentTheme);
        themeToggleBtn.addEventListener('click', () => {
            const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
            localStorage.setItem('nortis_theme', newTheme);
            applyTheme(newTheme);
        });
    };

    const renderReport = (data, period) => {
        const outputDiv = document.getElementById('report-output');
        const { rendaMensal, vencimentos } = data;
        const rendaTotal = (rendaMensal?.salario || 0) + (rendaMensal?.vale || 0);
        const totalGasto = vencimentos.filter(v => v.pago).reduce((acc, v) => acc + v.valor, 0);
        const saldo = rendaTotal - totalGasto;
        const date = new Date(`${period}-02`);
        const periodFormatted = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        let billsHTML = '';
        if (vencimentos.length === 0) {
            billsHTML = '<p class="empty-state">Nenhum vencimento registrado para este mês.</p>';
        } else {
            const sortedVencimentos = [...vencimentos].sort((a, b) => new Date(a.dataOriginal) - new Date(b.dataOriginal));
            billsHTML = sortedVencimentos.map(v => `
                <li class="list-item ${v.pago ? 'list-item--paid' : ''}">
                    <div class="bill-icon"><i class="fa-solid ${v.pago ? 'fa-check' : (v.icone || 'fa-file-invoice-dollar')}"></i></div>
                    <div class="bill-details">
                        <span class="bill-name">${v.nome}</span>
                        <span class="bill-date">${v.pago ? `Pago em ${v.dataPagamento}` : `Vencimento: ${new Date(v.dataOriginal + 'T03:00:00Z').toLocaleDateString('pt-BR')}`}</span>
                    </div>
                    <span class="bill-amount">${formatarMoeda(v.valor)}</span>
                </li>
            `).join('');
        }
        const reportHTML = `
            <div class="card report-card">
                <h2>Relatório de ${periodFormatted}</h2>
                <div class="report-summary">
                    <div class="summary-item positive"><span><i class="fas fa-arrow-up"></i> Renda Total</span><p>${formatarMoeda(rendaTotal)}</p></div>
                    <div class="summary-item negative"><span><i class="fas fa-arrow-down"></i> Total Gasto</span><p>${formatarMoeda(totalGasto)}</p></div>
                    <div class="summary-item balance ${saldo >= 0 ? 'positive' : 'negative'}"><span><i class="fas fa-balance-scale"></i> Saldo do Mês</span><p>${formatarMoeda(saldo)}</p></div>
                </div>
                <h3 class="report-subtitle">Detalhes dos Vencimentos</h3>
                <ul class="bill-list report-mode">${billsHTML}</ul>
            </div>
        `;
        outputDiv.innerHTML = reportHTML;
    };

    const handleGenerateReport = async (e) => {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        const period = form.elements.month.value;
        if (!period) return;
        const outputDiv = document.getElementById('report-output');
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        try {
            const response = await fetch(`${API_URL}/financas/historico?period=${period}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('nortis_token');
                localStorage.removeItem('nortis_user_name');
                window.location.href = 'login.html';
                return;
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Erro na API (${response.status})` }));
                throw new Error(errorData.message);
            }
            const data = await response.json();
            renderReport(data, period);
        } catch (error) {
            console.error("Erro ao gerar relatório:", error);
            outputDiv.innerHTML = `<div class="empty-state error"><i class="fas fa-exclamation-triangle fa-3x"></i><p>${error.message}</p></div>`;
        } finally {
            button.disabled = false;
            button.textContent = 'Gerar Relatório';
        }
    };
    
    const init = () => {
        setupTheme();
        document.getElementById('report-form').addEventListener('submit', handleGenerateReport);
        const today = new Date();
        today.setMonth(today.getMonth() - 1);
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        document.getElementById('report-month-input').value = `${year}-${month}`;
    };

    init();
});