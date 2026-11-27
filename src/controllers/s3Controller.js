const dockerFonte = require("../services/dockerFonteService");
const s3Model = require("../models/s3Model");

// Só deixa ler resumos: evita que a rota sirva qualquer objeto do bucket
const PADRAO_RESUMO = /^client\/resumos\/maquina=[^/\\]+\/data=\d{4}-\d{2}-\d{2}\/(?:hora=\d{2}(?:\d{2})?\/)?resumo\.json$/;

async function listarArquivos(req, res) {

    const informado = req.query.prefixo || "client/resumos/";
    const prefixo = informado === "client/" ? "client/resumos/" : informado;
    if (typeof prefixo !== "string" || !prefixo.startsWith("client/resumos/")
        || prefixo.includes("\\") || prefixo.split("/").some(parte => parte === ".." || parte === ".")) {
        return res.status(400).json({ erro: "Prefixo inválido" });
    }
    try {

        const inicioOperacao = performance.now();
        const usarLocal = dockerFonte.local(req);
        const pastas = req.query.dashboard === "docker" && req.query.pastas === "1";
        if (pastas && !/^client\/resumos\/maquina=[^/\\]+\/$/.test(prefixo)) {
            return res.status(400).json({ erro: "Informe o prefixo da máquina." });
        }
        const periodo = req.query.dashboard === "docker" && (req.query.inicio !== undefined || req.query.fim !== undefined);
        const { inicio, fim } = req.query;
        if (periodo && (pastas || !/^client\/resumos\/maquina=[^/\\]+\/$/.test(prefixo)
            || ![inicio, fim].every(d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
                && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d)
            || fim < inicio || Date.parse(fim) - Date.parse(inicio) > 8 * 86400000)) {
            return res.status(400).json({ erro: "Período de listagem inválido." });
        }
        const arquivos = periodo ? (usarLocal ? await dockerFonte.listarPeriodo(prefixo, inicio, fim)
            : await s3Model.listarPeriodoDocker(prefixo, inicio, fim)) : usarLocal ? await dockerFonte.listar(prefixo, pastas)
            : pastas ? await s3Model.listarPastasDocker(prefixo) : await s3Model.listarResumosS3(prefixo);
        if (req.query.dashboard === "docker") res.set("X-Docker-Fonte", usarLocal ? "local" : "s3");
        if (usarLocal) await dockerFonte.referencia(res);

        if (req.query.dashboard === "docker") res.set("Server-Timing", `fonte;dur=${(performance.now() - inicioOperacao).toFixed(1)}`);
        return res.status(200).json(arquivos);

    } catch (erro) {

        console.error(erro);

        return res.status(500).json({
            erro: "Erro ao listar os resumos"
        });

    }
}

async function buscarConteudo(req, res) {

    const nomeArquivo = req.query.arquivo;

    if (typeof nomeArquivo !== "string" || !PADRAO_RESUMO.test(nomeArquivo)) {

        return res.status(400).json({
            erro: "Nome do arquivo inválido"
        });

    }

    try {

        const inicioOperacao = performance.now();
        const usarLocal = dockerFonte.local(req);
        if (req.query.dashboard === "docker") res.set("X-Docker-Fonte", usarLocal ? "local" : "s3");
        const conteudo = usarLocal ? await dockerFonte.ler(nomeArquivo) : await s3Model.buscarConteudoS3(nomeArquivo);

        if (req.query.dashboard === "docker") res.set("Server-Timing", `fonte;dur=${(performance.now() - inicioOperacao).toFixed(1)}`);
        return res.status(200).json({
            arquivo: nomeArquivo,
            conteudo: conteudo
        });

    } catch (erro) {

        console.error(erro);

        return res.status(500).json({
            erro: "Erro ao buscar o conteúdo do resumo"
        });

    }
}

module.exports = {
    listarArquivos,
    buscarConteudo
};
