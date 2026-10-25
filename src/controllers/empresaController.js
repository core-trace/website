const empresaModel = require("../models/empresaModel");
const emailService = require("../services/emailService");

function textoValido(valor, limite, obrigatorio = false) {
    if (valor === undefined || valor === null) return !obrigatorio;
    return typeof valor === "string" && valor.trim().length <= limite
        && (!obrigatorio || valor.trim().length > 0);
}

function opcional(valor) {
    return typeof valor === "string" ? valor.trim() || null : null;
}

async function cadastrar(req, res) {
    const dados = req.body || {};
    const administrador = dados.administrador;
    const endereco = dados.endereco || {};

    if (!textoValido(dados.razaoSocial, 45, true)) {
        return res.status(400).json({ mensagem: "Informe uma razão social com até 45 caracteres." });
    }
    if (typeof dados.cnpj !== "string" || !/^(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(dados.cnpj.trim())) {
        return res.status(400).json({ mensagem: "Informe o CNPJ com 14 números, com ou sem pontuação." });
    }
    if (!administrador || typeof administrador !== "object" || Array.isArray(administrador)
        || !textoValido(administrador.nome, 45, true)) {
        return res.status(400).json({ mensagem: "Informe o nome do administrador, com até 45 caracteres." });
    }
    if (!textoValido(administrador.email, 45, true)
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(administrador.email.trim())) {
        return res.status(400).json({ mensagem: "Informe um email válido para o administrador, com até 45 caracteres." });
    }
    if (!textoValido(administrador.cpf, 11)
        || (opcional(administrador.cpf) && !/^\d{11}$/.test(administrador.cpf.trim()))) {
        return res.status(400).json({ mensagem: "Informe o CPF com 11 números, sem pontuação." });
    }
    if (!textoValido(administrador.telefone, 45)) {
        return res.status(400).json({ mensagem: "Informe um telefone com até 45 caracteres." });
    }
    if (typeof endereco !== "object" || Array.isArray(endereco)
        || !textoValido(endereco.logradouro, 100) || !textoValido(endereco.numero, 10)
        || !textoValido(endereco.cidade, 45) || !textoValido(endereco.estado, 45)) {
        return res.status(400).json({ mensagem: "Confira os campos de endereço e seus limites de tamanho." });
    }
    if (!process.env.RESEND_API_KEY) {
        return res.status(503).json({ mensagem: "O envio de email não está configurado no servidor." });
    }

    try {
        const resultado = await empresaModel.cadastrarComAdministrador({
            razaoSocial: dados.razaoSocial.trim(),
            cnpj: dados.cnpj.replace(/\D/g, ""),
            endereco: {
                logradouro: opcional(endereco.logradouro), numero: opcional(endereco.numero),
                cidade: opcional(endereco.cidade), estado: opcional(endereco.estado)
            },
            administrador: {
                nome: administrador.nome.trim(), email: administrador.email.trim(),
                cpf: opcional(administrador.cpf), telefone: opcional(administrador.telefone)
            }
        }, emailService.enviarConvite);

        res.set("Cache-Control", "no-store");
        return res.status(201).json({
            ...resultado,
            mensagem: "Empresa e administrador cadastrados! Enviamos um convite por email para definir a senha e ativar a conta."
        });
    } catch (erro) {
        if (erro.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ mensagem: "Já existe um cadastro com esse CNPJ, email ou CPF. Nenhuma nova empresa foi cadastrada." });
        }
        if (erro.code === "ADMIN_NAO_CONFIGURADO") {
            return res.status(409).json({ mensagem: "O perfil Administrador precisa estar configurado para cadastrar a empresa." });
        }
        if (erro.code === "EMAIL_FALHOU") {
            console.error("Erro ao enviar convite do administrador:", erro.cause?.message);
            return res.status(502).json({ mensagem: "Não foi possível enviar o email. O cadastro da empresa e do administrador foi desfeito. Tente novamente." });
        }
        console.error("Erro ao cadastrar empresa:", erro.message);
        return res.status(500).json({ mensagem: "Não foi possível concluir o cadastro da empresa e do administrador." });
    }
}

async function buscarMetricasPorToken(req, res) {
    const authorization = req.headers.authorization;
    const tokenPerfil = req.headers["token-perfil"];
    if (!authorization) {
        return res.status(401).json({ status: "error", message: "Token de instalação não informado" });
    }
    if (!tokenPerfil) {
        return res.status(401).json({ status: "error", message: "Token do perfil não informado" });
    }
    const bearer = typeof authorization === "string" && /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    if (!bearer || bearer[1].length > 255) {
        return res.status(401).json({ status: "error", message: "Token de instalação inválido" });
    }
    if (typeof tokenPerfil !== "string" || !tokenPerfil.trim() || tokenPerfil.trim().length > 255) {
        return res.status(401).json({ status: "error", message: "Token do perfil inválido" });
    }
    try {
        const metricas = await empresaModel.buscarMetricasPorToken(bearer[1], tokenPerfil.trim());
        res.set("Cache-Control", "no-store");
        return res.status(200).json(metricas);
    } catch (erro) {
        console.error("Erro ao consultar métricas de captura:", erro.code);
        return res.status(500).json({ status: "error", message: "Ocorreu um erro interno" });
    }
}

async function listarLimites(req, res) {
    const idPerfil = Number(req.params.idPerfil);
    if (!/^\d+$/.test(req.params.idPerfil) || !Number.isSafeInteger(idPerfil) || idPerfil <= 0) {
        return res.status(400).json({ status: "error", message: "Informe um perfil de servidor válido" });
    }
    try {
        const limites = await empresaModel.listarLimites(idPerfil);
        res.set("Cache-Control", "no-store");
        return res.status(200).json(limites);
    } catch (erro) {
        console.error("Erro ao consultar limites de captura:", erro.code);
        return res.status(500).json({ status: "error", message: "Ocorreu um erro interno" });
    }
}

module.exports = { cadastrar, buscarMetricasPorToken, listarLimites };
