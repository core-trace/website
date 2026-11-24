const processosModel = require("../models/processosModel");

// Limiares simples para classificar anormalidade de processo
const LIMITE_CRITICO_CPU = 90;
const LIMITE_CRITICO_RAM = 90;

async function listarServidores(req, res) {
    try {
        const servidores = await processosModel.listarServidores();
        return res.json({ servidores });
    } catch (erro) {
        console.error("Erro ao listar servidores:", erro);
        return res.status(500).json({ erro: "Não foi possível listar servidores." });
    }
}

async function buscarResumo(req, res) {
    try {
        const { mac, data } = req.query;

        if (!mac || !data) {
            return res.status(400).json({ erro: "Parâmetros 'mac' e 'data' são obrigatórios." });
        }

        const resumo = await processosModel.buscarResumoDiario(mac, data);
        return res.json(resumo);
    } catch (erro) {
        console.error("Erro ao buscar resumo diário:", erro);
        return res.status(500).json({ erro: "Não foi possível buscar o resumo diário." });
    }
}

async function buscarDadosProcessos(req, res) {
    try {
        const { mac, data } = req.query;

        if (!mac || !data) {
            return res.status(400).json({ erro: "Parâmetros 'mac' e 'data' são obrigatórios." });
        }

        const chaves = await processosModel.listarLotesDoDia(mac, data);
        const processos = [];
        let ultimoLote = null;

        for (const chave of chaves) {
            if (!chave.endsWith("capturas.json")) continue;

            const lote = await processosModel.buscarConteudoLote(chave);
            if (!lote || !Array.isArray(lote.processos)) continue;

            processos.push(...lote.processos);
            ultimoLote = lote;
        }

        // Ordena por timestamp
        processos.sort((a, b) => {
            const ta = new Date(a.timestamp).getTime();
            const tb = new Date(b.timestamp).getTime();
            return ta - tb;
        });

        return res.json({
            mac,
            data,
            processos,
            total: processos.length,
            ultimoLote: ultimoLote ? {
                lote_id: ultimoLote.lote_id,
                inicio: ultimoLote.resumos?.inicio,
                fim: ultimoLote.resumos?.fim
            } : null
        });
    } catch (erro) {
        console.error("Erro ao buscar dados de processos:", erro);
        return res.status(500).json({ erro: "Não foi possível buscar os dados de processos." });
    }
}

module.exports = {
    listarServidores,
    buscarResumo,
    buscarDadosProcessos
};