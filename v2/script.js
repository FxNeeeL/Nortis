const userName = localStorage.getItem('nortis_username');
if (!userName) {
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = 'http://localhost:3000/api';
    let appData = {};

    const formatarMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);

    const formatCurrencyInput = (inputElement) => {
        let value = inputElement.value.replace(/\D/g, '');
        if (value === '') { inputElement.value = ''; return; }
        value = (parseInt(value, 10) || 0) / 100;
        inputElement.value = formatarMoeda(value);
    };

    const showConfirmation = (title, message, onConfirm, isDeleteAction = false) => {
        const modal = document.getElementById('confirmation-modal');
        const confirmBtn = document.getElementById('confirm-action-btn');
        document.getElementById('confirmation-title').textContent = title;
        document.getElementById('confirmation-message').textContent = message;
        confirmBtn.className = isDeleteAction ? 'btn-confirm delete' : 'btn-confirm';
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        const handleConfirm = () => {
            modal.classList.add('hidden');
            onConfirm();
            newConfirmBtn.removeEventListener('click', handleConfirm);
        };
        newConfirmBtn.addEventListener('click', handleConfirm);
        modal.classList.remove('hidden');
    };

    const render = () => {
        const hora = new Date().getHours();
        const saudacao = (hora >= 5 && hora < 12) ? "Bom dia" : (hora >= 12 && hora < 18) ? "Boa tarde" : "Boa noite";
        document.querySelector('.header-title').textContent = `${saudacao}, ${userName}.`;
        
        document.querySelector('.current-month-indicator').textContent = `Análise de ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
        renderRenda(appData.rendaMensal);
        renderVencimentos(appData.vencimentos);
    };
    
    const renderRenda = (renda) => {
        const salario = renda?.salario || 0;
        const vale = renda?.vale || 0;
        const rendaTotal = salario + vale;
        document.getElementById('renda-salario').textContent = formatarMoeda(salario);
        document.getElementById('renda-vale').textContent = formatarMoeda(vale);
        document.getElementById('renda-total').textContent = formatarMoeda(rendaTotal);
    };

    const renderVencimentos = (vencimentos = []) => {
        const listEl = document.querySelector('.bill-list');
        listEl.innerHTML = '';
        if (vencimentos.length === 0) {
            listEl.innerHTML = '<p class="empty-state">Nenhum vencimento para este mês.</p>';
        }
        
        let totalAVencer = 0;
        vencimentos.sort((a,b) => a.pago - b.pago || a.diasRestantes - b.diasRestantes).forEach(v => {
            const isPaid = v.pago;
            const isOverdue = v.diasRestantes < 0 && !isPaid;
            
            let itemClass = isPaid ? 'list-item--paid' : '';
            if (isOverdue) itemClass += ' list-item--overdue';
            
            const iconClass = isPaid ? 'fa-check' : v.icone;
            
            let dateText;
            if (isPaid) {
                dateText = `Pago em ${v.dataPagamento}`;
            } else if (isOverdue) {
                dateText = `Vencido há ${Math.abs(v.diasRestantes)} dia(s)`;
            } else if (v.diasRestantes === 0) {
                dateText = "Vence hoje";
            } else {
                dateText = `Vence em ${v.diasRestantes} dia(s)`;
            }

            if (!isPaid) {
                totalAVencer += v.valor;
            }

            const actionsHTML = isPaid 
                ? `<div class="list-item-actions"><button class="action-btn trash" title="Excluir"><i class="fas fa-trash-alt"></i></button></div>`
                : `<div class="list-item-actions"><button class="action-btn edit" title="Editar"><i class="fas fa-pencil-alt"></i></button><button class="action-btn pay" title="Pagar"><i class="fas fa-check-circle"></i></button></div>`;
            const liHTML = `<li class="list-item ${itemClass}" data-id="${v.id}"><div class="bill-icon"><i class="fa-solid ${iconClass}"></i></div><div class="bill-details"><span class="bill-name">${v.nome}</span><span class="bill-date">${dateText}</span></div>${actionsHTML}<span class="bill-amount">${formatarMoeda(v.valor)}</span></li>`;
            listEl.insertAdjacentHTML('beforeend', liHTML);
        });

        document.getElementById('vencimentos-total').textContent = formatarMoeda(totalAVencer);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        
        if (form.id === 'renda-form') {
            const type = form.elements.type.value;
            const value = form.elements.value.value;
            const body = {
                salario: type === 'salario' ? value : formatarMoeda(appData.rendaMensal.salario),
                vale: type === 'vale' ? value : formatarMoeda(appData.rendaMensal.vale)
            };
            try {
                await fetch(`${API_URL}/renda`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                form.closest('.modal-overlay').classList.add('hidden');
                form.reset();
                await fetchAndRender();
            } catch (error) { console.error(error); alert('Não foi possível salvar a renda.'); }
            return;
        }

        const idValue = form.elements.id ? form.elements.id.value : null;
        let url, method;

        switch(form.id) {
            case 'due-date-form':
                url = `${API_URL}/vencimentos`;
                method = 'POST';
                break;
            case 'edit-due-date-form':
                url = `${API_URL}/vencimentos/${idValue}`;
                method = 'PUT';
                break;
            default:
                return;
        }
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        try {
            await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            form.closest('.modal-overlay').classList.add('hidden');
            form.reset();
            await fetchAndRender();
        } catch (error) { console.error(error); alert(`Não foi possível salvar.`); }
    };

    const handleGenerateInsight = async () => {
        const btn = document.getElementById('btn-generate-insight');
        const textEl = document.getElementById('guru-insight-text');
        btn.disabled = true;
        btn.classList.add('loading');
        textEl.textContent = "Analisando seus dados...";
        try {
            const response = await fetch(`${API_URL}/analise`);
            const data = await response.json();
            textEl.textContent = data.insight;
        } catch (error) {
            console.error("Erro ao gerar insight:", error);
            textEl.textContent = "Ocorreu um erro. Tente novamente.";
        } finally {
            setTimeout(() => {
                btn.disabled = false;
                btn.classList.remove('loading');
            }, 3000);
        }
    };

    const handleDelete = (id, itemName) => {
        showConfirmation("Excluir Permanentemente", `Tem certeza que deseja excluir ${itemName}? Esta ação não pode ser desfeita.`, async () => {
            try {
                await fetch(`${API_URL}/vencimentos/${id}`, { method: 'DELETE' });
                document.querySelector('.modal-overlay:not(.hidden)')?.classList.add('hidden');
                await fetchAndRender();
            } catch (error) { console.error(error); }
        }, true);
    };
    
    const handlePay = async (id, itemName) => {
        showConfirmation(`Pagar ${itemName}?`, "Confirma o pagamento?", async () => {
            try {
                const response = await fetch(`${API_URL}/vencimentos/${id}/pagar`, { method: 'PUT' });
                if(!response.ok) throw new Error('Erro ao marcar como pago');
                
                const paidItem = document.querySelector(`.list-item[data-id="${id}"]`);
                if (paidItem) {
                    paidItem.classList.add('list-item--just-paid');
                    paidItem.addEventListener('animationend', fetchAndRender, { once: true });
                } else {
                    await fetchAndRender();
                }
            } catch (error) { console.error(error); }
        });
    };

    // MUDANÇA: Função para configurar o tema (claro/escuro)
    const setupTheme = () => {
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const themeIcon = themeToggleBtn.querySelector('i');

        const applyTheme = (theme) => {
            if (theme === 'dark') {
                document.body.classList.add('dark-mode');
                themeIcon.className = 'fas fa-sun';
            } else {
                document.body.classList.remove('dark-mode');
                themeIcon.className = 'fas fa-moon';
            }
        };

        const currentTheme = localStorage.getItem('nortis_theme');
        applyTheme(currentTheme);

        themeToggleBtn.addEventListener('click', () => {
            const isDarkMode = document.body.classList.contains('dark-mode');
            const newTheme = isDarkMode ? 'light' : 'dark';
            localStorage.setItem('nortis_theme', newTheme);
            applyTheme(newTheme);
        });
    };


    const setupEventListeners = () => {
        document.getElementById('logout-btn').addEventListener('click', () => {
            showConfirmation('Sair da Conta', 'Tem certeza que deseja sair?', () => {
                localStorage.removeItem('nortis_username');
                window.location.href = 'login.html';
            });
        });

        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            const closeBtn = overlay.querySelector('.modal-close-btn');
            if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
            overlay.addEventListener('click', e => { if(e.target === overlay) overlay.classList.add('hidden'); });
        });
        
        document.querySelectorAll('.edit-income-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                const currentValue = appData.rendaMensal[type];
                const modal = document.getElementById('renda-modal');
                document.getElementById('renda-modal-title').textContent = `Editar ${type.charAt(0).toUpperCase() + type.slice(1)}`;
                document.getElementById('renda-modal-label').textContent = `Novo valor de ${type}`;
                document.getElementById('renda-type-input').value = type;
                document.getElementById('renda-value-input').value = formatarMoeda(currentValue);
                modal.classList.remove('hidden');
                document.getElementById('renda-value-input').focus();
            });
        });

        document.getElementById('add-due-date-btn').addEventListener('click', () => {
            document.getElementById('due-date-form').reset();
            document.getElementById('add-due-date-modal').classList.remove('hidden');
        });
        document.getElementById('confirm-cancel-btn').addEventListener('click', () => document.getElementById('confirmation-modal').classList.add('hidden'));
        document.getElementById('btn-generate-insight').addEventListener('click', handleGenerateInsight);
        
        document.querySelectorAll('form').forEach(form => form.addEventListener('submit', handleFormSubmit));
        document.querySelectorAll('input[name="value"]').forEach(input => {
            input.addEventListener('keyup', () => formatCurrencyInput(input));
        });

        document.querySelector('.bill-list').addEventListener('click', e => {
            const target = e.target;
            const actionBtn = target.closest('.action-btn');
            if (!actionBtn) return;

            const listItem = target.closest('.list-item');
            const id = listItem.dataset.id;
            const vencimento = appData.vencimentos.find(v => v.id == id);
            
            if (actionBtn.classList.contains('edit')) {
                const modal = document.getElementById('edit-due-date-modal');
                modal.querySelector('[name="id"]').value = id;
                modal.querySelector('[name="description"]').value = vencimento.nome;
                modal.querySelector('[name="value"]').value = formatarMoeda(vencimento.valor);
                modal.querySelector('[name="dueDate"]').value = vencimento.dataOriginal;
                modal.classList.remove('hidden');
            } else if (actionBtn.classList.contains('pay')) {
                handlePay(id, `"${vencimento.nome}"`);
            } else if (actionBtn.classList.contains('trash')) {
                handleDelete(id, `o vencimento "${vencimento.nome}"`);
            }
        });
        
        const editModal = document.getElementById('edit-due-date-modal');
        editModal.querySelector('#delete-due-date-btn').addEventListener('click', () => {
            const id = editModal.querySelector('[name="id"]').value;
            const vencimento = appData.vencimentos.find(v => v.id == id);
            handleDelete(id, `o vencimento "${vencimento.nome}"`);
        });
    };
    
    const fetchAndRender = async () => {
        try {
            const response = await fetch(`${API_URL}/financas`);
            if (!response.ok) throw new Error(`Falha na conexão: ${response.statusText}`);
            appData = await response.json();
            render();
        } catch (error) {
            console.error("Erro em fetchAndRender:", error);
            document.body.innerHTML = `<div style="padding: 40px; text-align: center;"><h2>Ops!</h2><p>Não foi possível carregar os dados.</p><p>${error.message}</p></div>`; 
        }
    };
    
    const init = () => {
        setupTheme(); // MUDANÇA: Inicializa o tema antes de tudo
        setupEventListeners();
        fetchAndRender();
    };

    init();
});