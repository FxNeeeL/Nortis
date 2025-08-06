const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-super-secreta-local-para-testes';
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());

if (!MONGO_URI) {
    console.error("ERRO CRÍTICO: A variável de ambiente MONGO_URI não está definida.");
    process.exit(1);
}
mongoose.connect(MONGO_URI)
    .then(() => console.log('Conectado ao MongoDB com sucesso!'))
    .catch(err => console.error('Falha ao conectar ao MongoDB:', err));

const RendaSchema = new mongoose.Schema({
    salario: { type: Number, default: 0 },
    vale: { type: Number, default: 0 }
}, { _id: false });

const VencimentoSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    valor: { type: Number, required: true },
    dataOriginal: { type: String, required: true },
    pago: { type: Boolean, default: false },
    dataPagamento: String,
    recorrente: { type: Boolean, default: false },
    pagamentosMensais: { type: [String], default: [] }
});

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    financas: {
        rendaMensal: { type: RendaSchema, default: () => ({}) },
        vencimentos: [VencimentoSchema]
    }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

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
    const [ano, mes, dia] = dueDate.split('-').map(Number);
    const dataVencimento = new Date(ano, mes - 1, dia);
    dataVencimento.setHours(0, 0, 0, 0);
    const diffTime = dataVencimento - hoje;
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

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

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password || password.length < 6) {
            return res.status(400).json({ message: "Nome, e-mail e senha (mínimo 6 caracteres) são obrigatórios." });
        }
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ message: "Este e-mail já está em uso." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            financas: { rendaMensal: { salario: 0, vale: 0 }, vencimentos: [] }
        });
        await newUser.save();
        res.status(201).json({ message: "Usuário registrado com sucesso!" });
    } catch (error) {
        console.error("Erro no registro:", error);
        res.status(500).json({ message: "Ocorreu um erro interno no servidor." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(401).json({ message: "E-mail ou senha inválidos." });
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) return res.status(401).json({ message: "E-mail ou senha inválidos." });
        const accessToken = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ accessToken, userName: user.name });
    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ message: "Ocorreu um erro interno no servidor." });
    }
});

app.get('/healthz', (req, res) => { res.status(200).send('OK'); });

app.get('/api/financas', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "Usuário não encontrado." });

        const hoje = new Date();
        const periodoAtual = `${hoje.getFullYear()}-${(hoje.getMonth() + 1).toString().padStart(2, '0')}`;
        const diaOriginalVencimento = (dateStr) => dateStr.split('-')[2];

        let vencimentosProjetados = []; 

        user.financas.vencimentos.forEach(v => {
            const periodoCriacao = v.dataOriginal.substring(0, 7);

            if (v.recorrente) {
                if (periodoCriacao <= periodoAtual) {
                    const pagoEsteMes = v.pagamentosMensais.includes(periodoAtual);
                    const vencimentoProjetado = {
                        ...v.toObject(),
                        id: v._id,
                        pago: pagoEsteMes,
                        dataOriginal: `${periodoAtual}-${diaOriginalVencimento(v.dataOriginal)}`
                    };
                    vencimentosProjetados.push(vencimentoProjetado);
                }
            } else {
                if (periodoCriacao === periodoAtual) {
                    vencimentosProjetados.push({ ...v.toObject(), id: v._id });
                }
            }
        });

        const rendaTotal = (user.financas.rendaMensal.salario || 0) + (user.financas.rendaMensal.vale || 0);
        const totalGasto = vencimentosProjetados
            .filter(v => v.pago)
            .reduce((acc, v) => acc + v.valor, 0);
        const saldoAtual = rendaTotal - totalGasto;

        const financasDoMes = {
            rendaMensal: user.financas.rendaMensal,
            vencimentos: vencimentosProjetados.map(v => ({
                ...v,
                diasRestantes: calculateDiffDays(v.dataOriginal),
                icone: getIconForDescription(v.nome),
            })),
            saldoAtual: saldoAtual
        };
        res.json(financasDoMes);
    } catch (error) {
        console.error("Erro ao buscar finanças:", error);
        res.status(500).json({ message: "Erro ao buscar finanças." });
    }
});

app.get('/api/financas/historico', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
        
        const { period } = req.query;
        if (!period || !/^\d{4}-\d{2}$/.test(period)) {
            return res.status(400).json({ message: "Formato de período inválido." });
        }
        
        const filteredVencimentos = user.financas.vencimentos.map(v => {
            if (v.recorrente) {
                const periodoCriacao = v.dataOriginal.substring(0, 7);
                if (periodoCriacao <= period) {
                    const diaOriginal = v.dataOriginal.split('-')[2];
                    return {
                        ...v.toObject(),
                        pago: v.pagamentosMensais.includes(period),
                        dataOriginal: `${period}-${diaOriginal}`
                    };
                }
            } else {
                if (v.dataOriginal.startsWith(period)) {
                    return v.toObject();
                }
            }
            return null;
        }).filter(Boolean);
        
        const reportData = {
            rendaMensal: user.financas.rendaMensal,
            vencimentos: filteredVencimentos.map(v => ({...v, icone: getIconForDescription(v.nome)}))
        };
        res.status(200).json(reportData);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar histórico." });
    }
});

app.put('/api/renda', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
        const { salario, vale } = req.body;
        user.financas.rendaMensal.salario = parseCurrency(salario);
        user.financas.rendaMensal.vale = parseCurrency(vale);
        await user.save();
        res.status(200).json(user.financas.rendaMensal);
    } catch (error) {
        res.status(500).json({ message: "Erro ao atualizar a renda." });
    }
});

app.post('/api/vencimentos', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
        const { description, dueDate, value, recorrente } = req.body;
        const novoVencimento = { 
            nome: description, 
            valor: parseCurrency(value), 
            dataOriginal: dueDate,
            recorrente: !!recorrente
        };
        user.financas.vencimentos.push(novoVencimento);
        await user.save();
        const savedVencimento = user.financas.vencimentos[user.financas.vencimentos.length - 1];
        res.status(201).json(savedVencimento);
    } catch (error) {
        res.status(500).json({ message: "Erro ao adicionar vencimento." });
    }
});

app.put('/api/vencimentos/:id', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
        const vencimento = user.financas.vencimentos.id(req.params.id);
        if (vencimento) {
            vencimento.nome = req.body.description;
            vencimento.valor = parseCurrency(req.body.value);
            vencimento.dataOriginal = req.body.dueDate;
            await user.save();
            return res.status(200).json(vencimento);
        }
        return res.status(404).json({ message: "Vencimento não encontrado." });
    } catch (error) {
        res.status(500).json({ message: "Erro ao editar vencimento." });
    }
});

app.put('/api/vencimentos/:id/pagar', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
        const vencimento = user.financas.vencimentos.id(req.params.id);
        if (vencimento) {
            if (vencimento.recorrente) {
                const hoje = new Date();
                const periodoAtual = `${hoje.getFullYear()}-${(hoje.getMonth() + 1).toString().padStart(2, '0')}`;
                if (!vencimento.pagamentosMensais.includes(periodoAtual)) {
                    vencimento.pagamentosMensais.push(periodoAtual);
                }
            } else {
                vencimento.pago = true;
                vencimento.dataPagamento = new Date().toLocaleDateString('pt-BR');
            }
            await user.save();
            return res.status(200).json(vencimento);
        }
        return res.status(404).json({ message: "Vencimento não encontrado." });
    } catch (error) {
        res.status(500).json({ message: "Erro ao pagar vencimento." });
    }
});

app.delete('/api/vencimentos/:id', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
        const vencimento = user.financas.vencimentos.id(req.params.id);
        if(!vencimento) return res.status(404).json({ message: "Vencimento não encontrado." });
        vencimento.remove();
        await user.save();
        return res.status(200).json({ message: "Vencimento removido permanentemente" });
    } catch (error) {
        res.status(500).json({ message: "Erro ao excluir vencimento." });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor do Nortis rodando na porta ${PORT}`);
});