const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DO GOOGLE GEMINI ---
const genAI = new GoogleGenerativeAI('AIzaSyDN5S9RYpyeGOQ2zrw81z1A7r9_0n-srbM');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest"});

// --- CONFIGURAÇÃO DA PERSISTÊNCIA ---
const DB_PATH = path.join(__dirname, 'database.json');
let financas;

function loadDatabase() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            financas = JSON.parse(data);
            console.log("Banco de dados carregado com sucesso.");
        } else {
            financas = { rendaMensal: { salario: 0, vale: 0 }, vencimentos: [] };
            saveDatabase();
            console.log("Novo banco de dados criado.");
        }
    } catch (error) {
        console.error("Erro ao carregar o banco de dados:", error);
        financas = { rendaMensal: { salario: 0, vale: 0 }, vencimentos: [] };
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(financas, null, 2), 'utf8');
        console.log("Banco de dados salvo com sucesso.");
    } catch (error) {
        console.error("Erro ao salvar o banco de dados:", error);
    }
}

// --- FUNÇÕES AUXILIARES ---
function getIconForDescription(description) {
    const desc = description.toLowerCase();
    if (desc.includes('cartão') || desc.includes('fatura') || desc.includes('card')) return 'fa-credit-card';
    if (desc.includes('internet') || desc.includes('wifi') || desc.includes('fibra')) return 'fa-wifi';
    if (desc.includes('luz') || desc.includes('energia') || desc.includes('enel')) return 'fa-lightbulb';
    if (desc.includes('água') || desc.includes('saneamento')) return 'fa-faucet-drip';
    if (desc.includes('aluguel') || desc.includes('condomínio')) return 'fa-house-user';
    if (desc.includes('escola') || desc.includes('faculdade') || desc.includes('curso')) return 'fa-user-graduate';
    if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('disney')) return 'fa-film';
    if (desc.includes('celular') || desc.includes('telefone') || desc.includes('plano')) return 'fa-mobile-screen-button';
    if (desc.includes('carro') || desc.includes('seguro') || desc.includes('ipva')) return 'fa-car-side';
    if (desc.includes('nortis') || desc.includes('assinatura')) return 'fa-star';
    return 'fa-file-invoice-dollar';
}

function parseCurrency(value) {
    if(typeof value !== 'string' || value === '') return 0;
    return parseFloat(value.replace("R$", "").replace(/\./g, '').replace(',', '.')) || 0;
}

function calculateDiffDays(dueDate) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVencimento = new Date(dueDate + 'T03:00:00Z');
    const diffTime = dataVencimento - hoje;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// --- ROTAS DA API ---
// MUDANÇA CRÍTICA: Recalcula os dias restantes a cada requisição
app.get('/api/financas', (req, res) => {
    // Cria uma cópia profunda para não alterar o objeto 'financas' original em memória
    const financasAtualizadas = JSON.parse(JSON.stringify(financas));
    
    // Recalcula os dias restantes para cada vencimento
    if (financasAtualizadas.vencimentos) {
        financasAtualizadas.vencimentos.forEach(vencimento => {
            vencimento.diasRestantes = calculateDiffDays(vencimento.dataOriginal);
        });
    }

    res.json(financasAtualizadas);
});

app.put('/api/renda', (req, res) => {
    const { salario, vale } = req.body;
    financas.rendaMensal.salario = parseCurrency(salario);
    financas.rendaMensal.vale = parseCurrency(vale);
    saveDatabase();
    res.status(200).json(financas.rendaMensal);
});

app.post('/api/vencimentos', (req, res) => {
    const { description, dueDate, value } = req.body;
    const novoVencimento = { 
        id: Date.now(), 
        nome: description,
        valor: parseCurrency(value), 
        dataOriginal: dueDate, 
        pago: false 
        // Não salvamos mais 'diasRestantes' no DB, será sempre calculado
    };
    financas.vencimentos.push(novoVencimento);
    saveDatabase();
    res.status(201).json(novoVencimento);
});

app.put('/api/vencimentos/:id/pagar', (req, res) => {
    const id = parseInt(req.params.id);
    const vencimento = financas.vencimentos.find(v => v.id === id);
    if (vencimento) {
        vencimento.pago = true;
        vencimento.dataPagamento = new Date().toLocaleDateString('pt-BR');
        saveDatabase();
        return res.status(200).json(vencimento);
    }
    return res.status(404).json({ message: "Vencimento não encontrado." });
});

app.delete('/api/vencimentos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = financas.vencimentos.findIndex(v => v.id === id);
    if (index !== -1) {
        financas.vencimentos.splice(index, 1);
        saveDatabase();
        return res.status(200).json({ message: "Vencimento removido permanentemente" });
    }
    return res.status(404).json({ message: "Vencimento não encontrado." });
});

app.put('/api/vencimentos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const vencimento = financas.vencimentos.find(v => v.id === id);
    if (vencimento) {
        vencimento.nome = req.body.description;
        vencimento.valor = parseCurrency(req.body.value);
        vencimento.dataOriginal = req.body.dueDate;
        // Não precisamos atualizar 'diasRestantes' aqui, será feito no GET
        saveDatabase();
        return res.status(200).json(vencimento);
    }
    return res.status(404).json({ message: "Vencimento não encontrado." });
});

app.get('/api/analise', async (req, res) => {
    try {
        const { rendaMensal, vencimentos } = financas;
        const rendaTotal = rendaMensal.salario + rendaMensal.vale;
        const despesasNaoPagas = vencimentos
            .filter(v => !v.pago)
            .map(v => ({...v, diasRestantes: calculateDiffDays(v.dataOriginal)})); // Calcula na hora

        const totalDespesasFuturas = despesasNaoPagas.reduce((acc, v) => acc + v.valor, 0);
        const maioresDespesas = [...despesasNaoPagas].sort((a, b) => b.valor - a.valor).slice(0, 3).map(d => `- ${d.nome}: R$ ${d.valor.toFixed(2)}`).join('\n');
        const saldoFinal = rendaTotal - totalDespesasFuturas;
        
        const prompt = `Você é Nortis, um consultor financeiro especialista em finanças pessoais, com um tom amigável, sábio e encorajador.
            Analise o resumo financeiro de um usuário e forneça um insight prático e profundo em português do Brasil.

            **Instruções para a sua resposta:**
            1.  **Análise do Saldo:** Comece comentando sobre o saldo final previsto. Se for positivo, elogie o planejamento. Se for negativo, ofereça uma perspectiva construtiva, sem alarmismo.
            2.  **Destaque da Maior Despesa:** Identifique e comente sobre as maiores despesas listadas. Se uma despesa se destaca muito (ex: "Fatura do Cartão"), sugira uma ação prática, como "revisar os gastos na fatura para otimizar".
            3.  **Conselho Final:** Termine com um conselho prático e positivo para o mês, focado em manter o controle ou em pequenas melhorias.
            4.  **Formato:** Mantenha a resposta concisa, no máximo 3 ou 4 frases. Use um tom que inspire confiança e ação. Não use saudações.

            **Resumo Financeiro do Usuário:**
            - Renda Mensal Total: R$ ${rendaTotal.toFixed(2)}
            - Total de Despesas a Vencer: R$ ${totalDespesasFuturas.toFixed(2)}
            - Saldo Final Previsto (Renda - Despesas): R$ ${saldoFinal.toFixed(2)}
            - As 3 maiores despesas a vencer são:
            ${maioresDespesas || "Nenhuma despesa a vencer."}

            Gere o insight financeiro com base nessas informações e instruções.`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const insight = response.text();
        
        res.json({ insight });
    } catch (error) {
        console.error("ERRO AO CHAMAR A API DO GOOGLE GEMINI:", error);
        res.status(500).json({ insight: "Não foi possível gerar a análise no momento." });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
loadDatabase(); 
app.listen(PORT, () => console.log(`🚀 Servidor do Nortis rodando na porta ${PORT}`));