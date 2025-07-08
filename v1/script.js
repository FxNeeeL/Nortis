document.addEventListener('DOMContentLoaded', () => {

    // --- DADOS FALSOS (MOCK DATA) ---
    // Em uma aplicação real, isso viria de um banco de dados via API.
    const mockData = [
        { date: '2023-10-27', description: 'Salário Empresa X', type: 'receita', amount: 5500.00 },
        { date: '2023-10-27', description: 'Aluguel Apto', type: 'despesa', amount: 1500.00 },
        { date: '2023-10-28', description: 'Supermercado Pão de Mel', type: 'despesa', amount: 430.50 },
        { date: '2023-10-29', description: 'Restaurante Sabor Divino', type: 'despesa', amount: 120.00 },
        { date: '2023-10-30', description: 'Pagamento iFood', type: 'despesa', amount: 45.90 },
        { date: '2023-11-01', description: 'Conta de Luz', type: 'despesa', amount: 110.80 },
        { date: '2023-11-02', description: 'Cinema com amigos', type: 'despesa', amount: 80.00 },
        { date: '2023-11-03', description: 'Assinatura Netflix', type: 'despesa', amount: 39.90 },
        { date: '2023-11-04', 'description': 'Uber para o trabalho', type: 'despesa', amount: 22.50 },
        { date: '2023-11-05', 'description': 'Freelance Projeto Y', type: 'receita', amount: 850.00 },
    ];

    // --- SELETORES DO DOM ---
    const currentBalanceEl = document.getElementById('current-balance');
    const monthlyIncomeEl = document.getElementById('monthly-income');
    const monthlyExpensesEl = document.getElementById('monthly-expenses');
    const transactionListEl = document.getElementById('transaction-list');
    const aiPredictionEl = document.getElementById('ai-prediction');
    const aiInsightsContentEl = document.getElementById('ai-insights-content');
    const chatWindowEl = document.getElementById('chat-window');
    const chatInputEl = document.getElementById('chat-user-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    
    // --- FUNÇÕES DE LÓGICA (O "CÉREBRO DA IA") ---

    // Formata um número para o padrão de moeda BRL
    const formatCurrency = (value) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // "IA" para categorizar transações com base em palavras-chave
    const categorizeTransaction = (description) => {
        const desc = description.toLowerCase();
        if (desc.includes('salário') || desc.includes('freelance')) return 'Renda';
        if (desc.includes('aluguel') || desc.includes('luz') || desc.includes('internet')) return 'Moradia';
        if (desc.includes('supermercado')) return 'Mercado';
        if (desc.includes('restaurante') || desc.includes('ifood')) return 'Alimentação';
        if (desc.includes('uber') || desc.includes('gasolina')) return 'Transporte';
        if (desc.includes('cinema') || desc.includes('netflix')) return 'Lazer';
        return 'Outros';
    };

    // Atualiza o painel de resumo
    const updateSummary = () => {
        const income = mockData.filter(t => t.type === 'receita').reduce((acc, t) => acc + t.amount, 0);
        const expenses = mockData.filter(t => t.type === 'despesa').reduce((acc, t) => acc + t.amount, 0);
        const balance = income - expenses;

        currentBalanceEl.textContent = formatCurrency(balance);
        monthlyIncomeEl.textContent = formatCurrency(income);
        monthlyExpensesEl.textContent = formatCurrency(expenses);
    };

    // Renderiza a lista de transações na tela
    const renderTransactions = () => {
        transactionListEl.innerHTML = '';
        mockData.forEach(transaction => {
            const category = categorizeTransaction(transaction.description);
            const item = document.createElement('li');
            item.className = 'transaction-item';
            item.innerHTML = `
                <div class="transaction-details">
                    <span class="transaction-description">${transaction.description}</span>
                    <span class="transaction-category">${category}</span>
                </div>
                <span class="transaction-amount ${transaction.type === 'receita' ? 'income' : 'expense'}">
                    ${transaction.type === 'despesa' ? '-' : ''}${formatCurrency(transaction.amount)}
                </span>
            `;
            transactionListEl.appendChild(item);
        });
    };

    // "IA" para gerar insights com base nos gastos
    const generateAIInsights = () => {
        const expensesByCategory = mockData
            .filter(t => t.type === 'despesa')
            .reduce((acc, t) => {
                const category = categorizeTransaction(t.description);
                acc[category] = (acc[category] || 0) + t.amount;
                return acc;
            }, {});

        const biggestExpenseCategory = Object.keys(expensesByCategory)
            .reduce((a, b) => expensesByCategory[a] > expensesByCategory[b] ? a : b);
        
        const insightText = `Seu maior gasto este mês foi com <strong>${biggestExpenseCategory}</strong>. Que tal criar uma meta para reduzir essa categoria em 10% no próximo mês?`;
        
        aiInsightsContentEl.innerHTML = `<p>${insightText}</p>`;
    };
    
    // "IA" para prever o saldo futuro (simples projeção linear)
    const predictFutureBalance = () => {
        const expenses = mockData.filter(t => t.type === 'despesa').reduce((acc, t) => acc + t.amount, 0);
        const daysInSample = (new Date(mockData[mockData.length - 1].date) - new Date(mockData[0].date)) / (1000 * 3600 * 24) || 1;
        const avgDailyExpense = expenses / daysInSample;
        const balance = mockData.filter(t => t.type === 'receita').reduce((acc, t) => acc + t.amount, 0) - expenses;

        const futureBalance = balance - (avgDailyExpense * 30);
        aiPredictionEl.textContent = `Com base na sua média de gastos, seu saldo em 30 dias pode chegar a aproximadamente ${formatCurrency(futureBalance)}.`;
    };

    // Lógica do Chatbot
    const handleChat = () => {
        const userInput = chatInputEl.value.trim().toLowerCase();
        if (!userInput) return;

        appendChatMessage(userInput, 'user');
        chatInputEl.value = '';

        setTimeout(() => {
            let botResponse = "Desculpe, não entendi. Tente perguntar sobre 'economizar', 'investir' ou 'maior gasto'.";
            if (userInput.includes('economizar')) {
                botResponse = "Uma ótima forma de economizar é analisar seus gastos com 'Lazer' e 'Alimentação'. Tente definir um orçamento semanal para eles!";
            } else if (userInput.includes('investir')) {
                botResponse = "Para iniciantes, sugiro pesquisar sobre Tesouro Selic ou CDBs com liquidez diária. São opções de baixo risco para começar sua reserva de emergência.";
            } else if (userInput.includes('maior gasto')) {
                 const expensesByCategory = mockData.filter(t => t.type === 'despesa').reduce((acc, t) => {
                    const category = categorizeTransaction(t.description);
                    acc[category] = (acc[category] || 0) + t.amount;
                    return acc;
                }, {});
                const biggestExpenseCategory = Object.keys(expensesByCategory).reduce((a, b) => expensesByCategory[a] > expensesByCategory[b] ? a : b);
                botResponse = `Seu maior gasto foi na categoria '${biggestExpenseCategory}'. Focar em reduzir custos aqui pode ter um grande impacto!`;
            }
            appendChatMessage(botResponse, 'bot');
        }, 1000); // Simula o "digitando..."
    };
    
    const appendChatMessage = (message, type) => {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${type}`;
        messageEl.textContent = message;
        chatWindowEl.appendChild(messageEl);
        chatWindowEl.scrollTop = chatWindowEl.scrollHeight; // Rola para a última mensagem
    };

    // --- INICIALIZAÇÃO DA APLICAÇÃO ---
    const init = () => {
        updateSummary();
        renderTransactions();
        generateAIInsights();
        predictFutureBalance();

        chatSendBtn.addEventListener('click', handleChat);
        chatInputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleChat();
        });
    };

    init();
});