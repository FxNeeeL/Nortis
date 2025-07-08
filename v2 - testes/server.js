const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração de CORS ---
const frontendURL = 'https://nortis-app-matheus.onrender.com';
const corsOptions = {
  origin: function (origin, callback) {
    // Permite a URL de produção, localhost (para testes) e requisições sem 'origin' (Postman, etc)
    const allowedOrigins = [frontendURL, 'http://localhost:3000', 'http://127.0.0.1:5500'];
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('Não permitido pela política de CORS'));
    }
  }
};
app.use(cors(corsOptions));
app.use(express.json());

// --- Configuração da Persistência ---
const DB_PATH = path.join(__dirname, 'database.json');
let dbData;

function loadDatabase() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            dbData = JSON.parse(data || '{}');
        } else {
            dbData = {}; // Inicia vazio se o arquivo não existe
        }
        
        // Garante que a estrutura base exista para evitar erros
        if (!dbData.users) dbData.users = [];
        if (!dbData.financas) dbData.financas = { rendaMensal: { salario: 0, vale: 0 }, vencimentos: [] };
        
        console.log("Banco de dados carregado ou inicializado com sucesso.");

    } catch (error) {
        console.error("Erro CRÍTICO ao carregar o banco de dados. Criando um DB novo.", error);
        // Em caso de falha de parse, cria uma estrutura segura
        dbData = {
            users: [],
            financas: { rendaMensal: { salario: 0, vale: 0 }, vencimentos: [] }
        };
        saveDatabase();
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), 'utf8');
    } catch (error) {
        console.error("Erro ao salvar o banco de dados:", error);
    }
}

// --- Funções Auxiliares (sem alterações) ---
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

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password || password.length < 6) {
            return res.status(400).json({ message: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." });
        }

        const existingUser = dbData.users.find(user => user.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(409).json({ message: "Este e-mail já está em uso." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = { id: Date.now(), email: email, password: hashedPassword };
        dbData.users.push(newUser);
        saveDatabase();

        res.status(201).json({ message: "Usuário registrado com sucesso!", user: { id: newUser.id, email: newUser.email } });
    } catch(error) {
        console.error("Erro no registro:", error);
        res.status(500).json({ message: "Ocorreu um erro interno no servidor." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
        }

        const user = dbData.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
            return res.status(401).json({ message: "E-mail ou senha inválidos." });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: "E-mail ou senha inválidos." });
        }

        res.status(200).json({ message: "Login bem-sucedido!", user: { email: user.email } });
    } catch(error) {
        console.error("Erro no login:", error);
        res.status(500).json({ message: "Ocorreu um erro interno no servidor." });
    }
});


// --- ROTAS DE FINANÇAS ---
app.get('/healthz', (req, res) => { res.status(200).send('OK'); });

app.get('/api/financas', (req, res) => {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = (hoje.getMonth() + 1).toString().padStart(2, '0');
    const periodoAtual = `${anoAtual}-${mesAtual}`;

    const vencimentosDoMes = dbData.financas.vencimentos.filter(v => 
        v.dataOriginal && v.dataOriginal.startsWith(periodoAtual)
    );
    const financasDoMes = {
        rendaMensal: dbData.financas.rendaMensal,
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
    
    const filteredVencimentos = dbData.financas.vencimentos.filter(v => 
        v.dataOriginal && v.dataOriginal.startsWith(period)
    );

    const vencimentosComIcone = filteredVencimentos.map(v => ({
        ...v,
        icone: getIconForDescription(v.nome) 
    }));
    
    const reportData = {
        rendaMensal: dbData.financas.rendaMensal,
        vencimentos: vencimentosComIcone
    };
    
    res.status(200).json(reportData);
});

app.put('/api/renda', (req, res) => {
    const { salario, vale } = req.body;
    dbData.financas.rendaMensal.salario = parseCurrency(salario);
    dbData.financas.rendaMensal.vale = parseCurrency(vale);
    saveDatabase();
    res.status(200).json(dbData.financas.rendaMensal);
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
    dbData.financas.vencimentos.push(novoVencimento);
    saveDatabase();
    res.status(201).json(novoVencimento);
});

app.put('/api/vencimentos/:id/pagar', (req, res) => {
    const id = parseInt(req.params.id);
    const vencimento = dbData.financas.vencimentos.find(v => v.id === id);
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
    const index = dbData.financas.vencimentos.findIndex(v => v.id === id);
    if (index !== -1) {
        dbData.financas.vencimentos.splice(index, 1);
        saveDatabase();
        return res.status(200).json({ message: "Vencimento removido permanentemente" });
    }
    return res.status(404).json({ message: "Vencimento não encontrado." });
});

app.put('/api/vencimentos/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const vencimento = dbData.financas.vencimentos.find(v => v.id === id);
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