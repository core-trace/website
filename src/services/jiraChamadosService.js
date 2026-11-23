const crypto = require("crypto");

// Cache em memoria por empresa. Nao ha gravacao em banco nem em S3: o Jira continua
// sendo a unica fonte de status e de datas de abertura/conclusao dos chamados.
const INTERVALO_CACHE_MS = 5 * 60 * 1000;
const TAMANHO_LOTE_ETIQUETAS = 50;
const MAX_PAGINAS_POR_LOTE = 20;

const cachePorEmpresa = new Map();

function normalizarMac(mac) {
    return String(mac || "").trim().toUpperCase();
}

function gerarEtiquetaJira(mac, recurso, metrica, campoOrigem = "") {
    const identificador = [mac, recurso, metrica, campoOrigem].join("|").toLowerCase();
    const hash = crypto.createHash("sha256").update(identificador, "utf-8").digest("hex");
    return `coretrace-${hash.substring(0, 24)}`;
}

// Tanto o Node quanto o Java colocam o MAC no titulo do chamado. Serve como fallback
// quando o campo_origem usado pelo Java nao gera a mesma etiqueta que calculamos aqui.
function extrairMacDoTitulo(titulo) {
    const encontrado = String(titulo || "").match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/);
    return encontrado ? normalizarMac(encontrado[1]) : null;
}

function configuracaoJira() {
    return {
        baseUrl: (process.env.JIRA_BASE_URL || "").replace(/\/+$/, ""),
        email: process.env.JIRA_EMAIL || "",
        token: process.env.JIRA_API_TOKEN || "",
        projeto: process.env.JIRA_PROJECT_KEY || "SUP"
    };
}

function resumoDoServidor(servidor) {
    return {
        id: String(servidor.id_servidor ?? servidor.id ?? ""),
        perfilId: servidor.id_perfil_servidor ?? servidor.perfilId ?? null,
        nome: servidor.nome || "",
        mac: normalizarMac(servidor.endereco_mac || servidor.mac)
    };
}

// Replica o fallback de metricas do alertaService: quando o perfil nao tem componentes
// cadastrados, a tela usa cpu_percent e ram_percent.
function componentesDoServidor(servidor) {
    const componentes = Array.isArray(servidor.componentes) ? servidor.componentes : [];
    const utilizaveis = componentes
        .map((componente) => ({
            coluna: String(componente.coluna || "").toLowerCase(),
            recurso: componente.recurso || "Outros"
        }))
        .filter((componente) => componente.coluna);

    if (utilizaveis.length) return utilizaveis;

    return [
        { coluna: "cpu_percent", recurso: "CPU" },
        { coluna: "ram_percent", recurso: "RAM" }
    ];
}

function montarIndice(servidoresBanco) {
    const porEtiqueta = new Map();
    const porMac = new Map();
    const etiquetas = new Set();

    (servidoresBanco || []).forEach((servidorBanco) => {
        const servidor = resumoDoServidor(servidorBanco);
        if (!servidor.mac) return;

        porMac.set(servidor.mac, servidor);

        componentesDoServidor(servidorBanco).forEach(({ coluna, recurso }) => {
            const etiqueta = gerarEtiquetaJira(servidor.mac, recurso, coluna, coluna.toUpperCase());
            etiquetas.add(etiqueta);
            if (!porEtiqueta.has(etiqueta)) porEtiqueta.set(etiqueta, servidor);
        });
    });

    return { porEtiqueta, porMac, etiquetas: [...etiquetas] };
}

function dividirEmLotes(itens, tamanho) {
    const lotes = [];
    for (let i = 0; i < itens.length; i += tamanho) {
        lotes.push(itens.slice(i, i + tamanho));
    }
    return lotes;
}

async function buscarPaginas(loteEtiquetas, configuracao) {
    const auth = Buffer.from(`${configuracao.email}:${configuracao.token}`).toString("base64");
    const jql = `project = "${configuracao.projeto}" AND labels IN (${loteEtiquetas
        .map((etiqueta) => `"${etiqueta}"`)
        .join(", ")}) ORDER BY created DESC`;

    const issues = [];
    let nextPageToken;

    for (let pagina = 0; pagina < MAX_PAGINAS_POR_LOTE; pagina += 1) {
        const corpo = {
            jql,
            maxResults: 100,
            fields: ["summary", "status", "labels", "created", "updated", "resolutiondate"]
        };
        if (nextPageToken) corpo.nextPageToken = nextPageToken;

        const resposta = await fetch(`${configuracao.baseUrl}/rest/api/3/search/jql`, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${auth}`,
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(corpo)
        });

        if (!resposta.ok) {
            throw new Error(`Falha ao buscar chamados no Jira (${resposta.status})`);
        }

        const dados = await resposta.json();
        issues.push(...(dados.issues || []));

        nextPageToken = dados.nextPageToken;
        if (!nextPageToken) break;
    }

    return issues;
}

async function buscarIssues(etiquetas, configuracao) {
    const porChave = new Map();

    for (const lote of dividirEmLotes(etiquetas, TAMANHO_LOTE_ETIQUETAS)) {
        const issues = await buscarPaginas(lote, configuracao);
        issues.forEach((issue) => porChave.set(issue.key, issue));
    }

    return [...porChave.values()];
}

function normalizarIssue(issue, indice, configuracao) {
    const etiquetasIssue = Array.isArray(issue.fields?.labels) ? issue.fields.labels : [];
    let servidor = null;
    let origem = null;

    for (const etiqueta of etiquetasIssue) {
        if (indice.porEtiqueta.has(etiqueta)) {
            servidor = indice.porEtiqueta.get(etiqueta);
            origem = "etiqueta";
            break;
        }
    }

    if (!servidor) {
        const mac = extrairMacDoTitulo(issue.fields?.summary);
        if (mac && indice.porMac.has(mac)) {
            servidor = indice.porMac.get(mac);
            origem = "mac";
        }
    }

    const statusCategoria = issue.fields?.status?.statusCategory?.key?.toLowerCase() || null;
    const concluido = statusCategoria === "done";

    return {
        chave: issue.key,
        url: `${configuracao.baseUrl}/browse/${issue.key}`,
        titulo: issue.fields?.summary || "",
        etiquetas: etiquetasIssue,
        etiqueta: etiquetasIssue.find((etiqueta) => indice.porEtiqueta.has(etiqueta)) || null,
        servidorId: servidor?.id || null,
        perfilId: servidor?.perfilId || null,
        nomeServidor: servidor?.nome || null,
        mac: servidor?.mac || extrairMacDoTitulo(issue.fields?.summary),
        origem,
        status: issue.fields?.status?.name || null,
        statusCategoria,
        concluido,
        abertaEm: issue.fields?.created || null,
        // Sem gravacao local, o fallback para uma issue Done sem resolutiondate e o updated do Jira.
        concluidaEm: concluido ? (issue.fields?.resolutiondate || issue.fields?.updated || null) : null
    };
}

function resultadoVazio() {
    return {
        chamados: [],
        porServidor: new Map(),
        obtidoEm: Date.now(),
        erro: false
    };
}

function montarResultado(chamados) {
    const porServidor = new Map();
    chamados.forEach((chamado) => {
        if (!chamado.servidorId) return;
        if (!porServidor.has(chamado.servidorId)) porServidor.set(chamado.servidorId, []);
        porServidor.get(chamado.servidorId).push(chamado);
    });

    return { chamados, porServidor, obtidoEm: Date.now(), erro: false };
}

async function obterChamadosPorEmpresa(idEmpresa, servidoresBanco = []) {
    const chaveEmpresa = Number(idEmpresa);
    const indice = montarIndice(servidoresBanco);
    const configuracao = configuracaoJira();
    const agora = Date.now();
    const emCache = cachePorEmpresa.get(chaveEmpresa);
    const mesmaBase = emCache && emCache.etiquetas.join("|") === indice.etiquetas.join("|");

    if (emCache && mesmaBase && agora - emCache.obtidoEm < INTERVALO_CACHE_MS) {
        return emCache.resultado;
    }

    if (!indice.etiquetas.length || !configuracao.baseUrl || !configuracao.email || !configuracao.token) {
        const resultado = resultadoVazio();
        cachePorEmpresa.set(chaveEmpresa, { obtidoEm: agora, etiquetas: indice.etiquetas, resultado });
        return resultado;
    }

    try {
        const issues = await buscarIssues(indice.etiquetas, configuracao);
        const resultado = montarResultado(issues.map((issue) => normalizarIssue(issue, indice, configuracao)));
        cachePorEmpresa.set(chaveEmpresa, { obtidoEm: resultado.obtidoEm, etiquetas: indice.etiquetas, resultado });
        return resultado;
    } catch (erro) {
        console.warn("[Jira Chamados] Falha ao atualizar cache:", erro.message);
        if (emCache) return { ...emCache.resultado, erro: true };

        const resultado = resultadoVazio();
        resultado.erro = true;
        cachePorEmpresa.set(chaveEmpresa, { obtidoEm: agora, etiquetas: indice.etiquetas, resultado });
        return resultado;
    }
}

function formatarMinutos(minutos) {
    if (!Number.isFinite(minutos) || minutos < 0) return "—";
    const total = Math.round(minutos);
    if (total < 60) return `${total} min`;
    const horas = Math.floor(total / 60);
    const resto = total % 60;
    return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

function duracaoMinutos(chamado) {
    if (!chamado.concluido || !chamado.abertaEm || !chamado.concluidaEm) return null;

    const inicio = Date.parse(chamado.abertaEm);
    const fim = Date.parse(chamado.concluidaEm);
    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return null;

    return (fim - inicio) / 60000;
}

function resumoDuracoes(duracoes) {
    if (!duracoes.length) {
        return { texto: "—", minutos: null, quantidade: 0, vazio: true };
    }

    const minutos = Math.round(duracoes.reduce((soma, atual) => soma + atual, 0) / duracoes.length);
    return { texto: formatarMinutos(minutos), minutos, quantidade: duracoes.length, vazio: false };
}

// Geral considera todos os chamados concluidos ligados a servidores da empresa.
// Por perfil, apenas os chamados dos servidores daquele perfil.
function calcularResolucao(chamados = [], servidoresBanco = []) {
    const concluidos = chamados.filter((chamado) => chamado.servidorId && duracaoMinutos(chamado) !== null);

    const idsPerfis = [...new Set((servidoresBanco || [])
        .map((servidor) => servidor.id_perfil_servidor ?? servidor.perfilId ?? null)
        .filter((id) => id !== null && id !== undefined))];

    const porPerfil = {};
    idsPerfis.forEach((id) => {
        porPerfil[String(id)] = resumoDuracoes(
            concluidos
                .filter((chamado) => String(chamado.perfilId) === String(id))
                .map((chamado) => duracaoMinutos(chamado))
        );
    });

    return {
        geral: resumoDuracoes(concluidos.map((chamado) => duracaoMinutos(chamado))),
        porPerfil
    };
}

module.exports = {
    obterChamadosPorEmpresa,
    calcularResolucao,
    gerarEtiquetaJira,
    normalizarMac,
    extrairMacDoTitulo,
    INTERVALO_CACHE_MS
};
