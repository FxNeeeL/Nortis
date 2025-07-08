const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MUDANÇA: CONFIGURAÇÃO EXPLÍCITA DO CORS ---

// 1. Defina a URL do seu front-end
const frontendURL = 'https://nortis-app-matheus.onrender.com'; // << IMPORTANTE: Use a URL do seu site estático aqui

// 2. Configure as opções do CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisições da sua URL de front-end e requisições sem 'origin' (como de apps mobile ou Postman)
    if (!origin || origin === frontendURL) {
      callback(null, true);
    } else {
      callback(new Error('Não permitido pela política de CORS'));
    }
  }
};

// 3. Use as opções no middleware do CORS
app.use(cors(corsOptions));

// --- FIM DA MUDANÇA ---


app.use(express.json());

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
    } catch (error) {
        console.error("Erro ao salvar o banco de dados:", error);
    }
}

// --- FUNÇÕES AUXILIARES ---
function getIconForDescription(description) {
    if (!description) return 'fa-file-invoice-dollar';
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


app.get('/healthz', (req, res) => {
    // Retorna uma resposta simples de sucesso
    res.status(200).send('OK');
});

app.get('/api/financas', (req, res) => {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = (hoje.getMonth() + 1).toString().padStart(2, '0');
    const periodoAtual = `${anoAtual}-${mesAtual}`;

    const vencimentosDoMes = financas.vencimentos.filter(v => 
        v.dataOriginal && v.dataOriginal.startsWith(periodoAtual)
    );

    const financasDoMes = {
        rendaMensal: financas.rendaMensal,
        vencimentos: vencimentosDoMes
    };

    if (financasDoMes.vencimentos) {
        financasDoMes.vencimentos.forEach(vencimento => {
            vencimento.diasRestantes = calculateDiffDays(vencimento.dataOriginal);
            vencimento.icone = getIconForDescription(vencimento.nome);
        });
    }

    res.json(financasDoMes);
});


app.get('/api/financas/historico', (req, res) => {
    const { period } = req.query; 

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({ message: "Formato de período inválido. Use AAAA-MM." });
    }
    
    const filteredVencimentos = financas.vencimentos.filter(v => 
        v.dataOriginal && v.dataOriginal.startsWith(period)
    );

    const vencimentosComIcone = filteredVencimentos.map(v => ({
        ...v,
        icone: getIconForDescription(v.nome) 
    }));
    
    // Se não encontrar dados, retorna um objeto vazio, que o front-end trata como "zerado"
    if (filteredVencimentos.length === 0) {
        return res.status(200).json({
            rendaMensal: financas.rendaMensal, // ou pode ser { salario: 0, vale: 0 }
            vencimentos: []
        });
    }
    
    const reportData = {
        rendaMensal: financas.rendaMensal,
        vencimentos: vencimentosComIcone
    };
    
    res.status(200).json(reportData);
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
        saveDatabase();
        return res.status(200).json(vencimento);
    }
    return res.status(404).json({ message: "Vencimento não encontrado." });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
loadDatabase(); 
app.listen(PORT, () => {
    console.log(`🚀 Servidor do Nortis rodando na porta ${PORT}`);
});