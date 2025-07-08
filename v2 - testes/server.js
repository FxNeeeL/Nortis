const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Chave secreta para os tokens. Em um app real, isso viria de uma variável de ambiente.
const JWT_SECRET = 'sua-chave-super-secreta-e-longa-que-ninguem-deve-saber';

// --- Configuração de CORS ---
const frontendURL = 'https://nortis-app-matheus.onrender.com';
const corsOptions = {
    origin: function (origin, callback) {
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
            dbData = {};
        }
        if (!dbData.users) dbData.users = [];
        console.log("Banco de dados carregado.");
    } catch (error) {
        console.error("Erro CRÍTICO ao carregar o banco de dados. Criando um DB novo.", error);
        dbData = { users: [] };
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

// --- Funções Auxiliares ---
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
    if (typeof value !== 'string' || value === '') return 0;
    return parseFloat(value.replace("R$", "").replace(/\./g, '').replace(',', '.')) || 0;
}
function calculateDiffDays(dueDate) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVencimento = new Date(dueDate + 'T03:00:00Z');
    const diffTime = dataVencimento - hoje;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// --- Middleware de Autenticação ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password || password.length < 6) {
            return res.status(400).json({ message: "Nome, e-mail e senha (mínimo 6 caracteres) são obrigatórios." });
        }
        const existingUser = dbData.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(409).json({ message: "Este e-mail já está em uso." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now(),
            name,
            email,
            password: hashedPassword,
            financas: { rendaMensal: { salario: 0, vale: 0 }, vencimentos: [] }
        };
        dbData.users.push(newUser);
        saveDatabase();
        res.status(201).json({ message: "Usuário registrado com sucesso!" });
    } catch (error) {
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
        const accessToken = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ accessToken, userName: user.name });
    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ message: "Ocorreu um erro interno no servidor." });
    }
});

// --- ROTAS DE FINANÇAS (PROTEGIDAS) ---
app.get('/healthz', (req, res) => { res.status(200).send('OK'); });

app.get('/api/financas', authenticateToken, (req, res) => {
    const user = dbData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });

    const hoje = new Date();
    const periodoAtual = `${hoje.getFullYear()}-${(hoje.getMonth() + 1).toString().padStart(2, '0')}`;
    const vencimentosDoMes = user.financas.vencimentos.filter(v => v.dataOriginal && v.dataOriginal.startsWith(periodoAtual));
    
    const financasDoMes = {
        rendaMensal: user.financas.rendaMensal,
        vencimentos: vencimentosDoMes
    };
    financasDoMes.vencimentos.forEach(v => {
        v.diasRestantes = calculateDiffDays(v.dataOriginal);
        v.icone = getIconForDescription(v.nome);
    });
    res.json(financasDoMes);
});

app.get('/api/financas/historico', authenticateToken, (req, res) => {
    const user = dbData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    
    const { period } = req.query;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({ message: "Formato de período inválido." });
    }
    
    const filteredVencimentos = user.financas.vencimentos.filter(v => v.dataOriginal && v.dataOriginal.startsWith(period));
    const reportData = {
        rendaMensal: user.financas.rendaMensal,
        vencimentos: filteredVencimentos.map(v => ({...v, icone: getIconForDescription(v.nome)}))
    };
    res.status(200).json(reportData);
});

app.put('/api/renda', authenticateToken, (req, res) => {
    const user = dbData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    const { salario, vale } = req.body;
    user.financas.rendaMensal.salario = parseCurrency(salario);
    user.financas.rendaMensal.vale = parseCurrency(vale);
    saveDatabase();
    res.status(200).json(user.financas.rendaMensal);
});

app.post('/api/vencimentos', authenticateToken, (req, res) => {
    const user = dbData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    const { description, dueDate, value } = req.body;
    const novoVencimento = { id: Date.now(), nome: description, valor: parseCurrency(value), dataOriginal: dueDate, pago: false };
    user.financas.vencimentos.push(novoVencimento);
    saveDatabase();
    res.status(201).json(novoVencimento);
});

app.put('/api/vencimentos/:id', authenticateToken, (req, res) => {
    const user = dbData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    const id = parseInt(req.params.id);
    const vencimento = user.financas.vencimentos.find(v => v.id === id);
    if (vencimento) {
        vencimento.nome = req.body.description;
        vencimento.valor = parseCurrency(req.body.value);
        vencimento.dataOriginal = req.body.dueDate;
        saveDatabase();
        return res.status(200).json(vencimento);
    }
    return res.status(404).json({ message: "Vencimento não encontrado." });
});

app.put('/api/vencimentos/:id/pagar', authenticateToken, (req, res) => {
    const user = dbData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    const id = parseInt(req.params.id);
    const vencimento = user.financas.vencimentos.find(v => v.id === id);
    if (vencimento) {
        vencimento.pago = true;
        vencimento.dataPagamento = new Date().toLocaleDateString('pt-BR');
        saveDatabase();
        return res.status(200).json(vencimento);
    }
    return res.status(404).json({ message: "Vencimento não encontrado." });
});

app.delete('/api/vencimentos/:id', authenticateToken, (req, res) => {
    const user = dbData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    const id = parseInt(req.params.id);
    const index = user.financas.vencimentos.findIndex(v => v.id === id);
    if (index !== -1) {
        user.financas.vencimentos.splice(index, 1);
        saveDatabase();
        return res.status(200).json({ message: "Vencimento removido permanentemente" });
    }
    return res.status(404).json({ message: "Vencimento não encontrado." });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
loadDatabase(); 
app.listen(PORT, () => {
    console.log(`🚀 Servidor do Nortis rodando na porta ${PORT}`);
});