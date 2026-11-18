const fs = require("fs/promises");
const path = require("path");
const servidorModel = require("../models/servidorModel");

const LIMIARES_PADRAO = {
    cpu: { atencao: 60, critico: 80 },
    rssGb: { atencao: 2.0, critico: 2.5 }
};

function getClientDir() {
    const dir = process.env.GOLD_CLIENT_DIR;
    if (!dir) {
        throw new Error("GOLD_CLIENT_DIR não configurado.");
    }
    return dir;
}

function extrairValor(medida) {
    if (!medida || typeof medida !== "object") return null;
    if (medida.valor !== undefined) return medida.valor;
    if (medida.ultimo_valor !== undefined) return medida.ultimo_valor;
    if (medida.media !== undefined) return medida.media;
    return null;
}

function toNumber(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function normalizarAmostraProcesso(registro) {
    const cpu = toNumber(extrairValor(registro.cpu && registro.cpu.uso));
    const memoriaPercent = toNumber(
        extrairValor(
            registro.memoria && (registro.memoria.uso_percentual || registro.memoria.uso)
        )
    );
    const rssBytes = toNumber(extrairValor(registro.memoria && registro.memoria.rss));
    const threads = toNumber(extrairValor(registro.threads && registro.threads.quantidade));
    const rssGb = rssBytes != null ? rssBytes / (1024 ** 3) : null;

    return {
        timestamp: registro.timestamp,
        pid: toNumber(registro.pid),
        nome: registro.nome || null,
        usuario: registro.usuario || null,
        cpu,
        memoriaPercent,
        rssBytes,
        rssGb,
        threads: threads != null ? threads : toNumber(registro.num_threads),
        createTime: registro.create_time || registro.createTime || null,
        statusProcesso: registro.status_processo || registro.status || null
    };
}

function classificar(cpu, rssGb, limites = LIMIARES_PADRAO) {
    const limitesCpu = limites.cpu || LIMIARES_PADRAO.cpu;
    const limitesRss = limites.rssGb || LIMIARES_PADRAO.rssGb;

    const cpuCritico = cpu != null && limitesCpu.critico != null && cpu >= limitesCpu.critico;
    const rssCritico = rssGb != null && limitesRss.critico != null && rssGb >= limitesRss.critico;
    if (cpuCritico || rssCritico) return "Crítico";

    const cpuAtencao = cpu != null && limitesCpu.atencao != null && cpu >= limitesCpu.atencao;
    const rssAtencao = rssGb != null && limitesRss.atencao != null && rssGb >= limitesRss.atencao;
    if (cpuAtencao || rssAtencao) return "Atenção";

    return "Normal";
}

function formatarDeltaCpu(a, b) {
    if (a == null || b == null) return null;
    const delta = b - a;
    const sinal = delta >= 0 ? "+" : "";
    return `${a.toFixed(0)}% → ${b.toFixed(0)}% (${sinal}${delta.toFixed(0)} p.p.)`;
}

function formatarDeltaRss(a, b) {
    if (a == null || b == null) return null;
    const delta = b - a;
    const sinal = delta >= 0 ? "+" : "";
    const fmt = (v) => v.toFixed(2).replace(".", ",");
    return `${fmt(a)} → ${fmt(b)} GB (${sinal}${fmt(delta)} GB)`;
}

function chaveProcesso(p) {
    return `${p.pid}|${p.nome}`;
}

function extrairLimite(componentes, colunasPossiveis) {
    const componente = (componentes || []).find((c) =>
        colunasPossiveis.includes(String(c.coluna || "").toLowerCase())
    );
    if (!componente) return null;

    const atencao = componente.atencao != null ? Number(componente.atencao) : null;
    const critico = componente.critico != null ? Number(componente.critico) : null;
    if (atencao == null || critico == null) return null;

    return {
        atencao,
        critico,
        operador: componente.operador || ">=",
        operador2: componente.operador2 || null,
        atencao2: componente.atencao2 != null ? Number(componente.atencao2) : null,
        critico2: componente.critico2 != null ? Number(componente.critico2) : null,
        unidade: componente.unidade || null
    };
}

async function resolverLimites(filtros) {
    const mac = String(filtros.mac || filtros.servidor || "").trim().toUpperCase();
    const empresa = Number(filtros.empresa);
    const usuario = Number(filtros.usuario);

    if (!mac || !Number.isSafeInteger(empresa) || !Number.isSafeInteger(usuario)) {
        return { ...LIMIARES_PADRAO };
    }

    const servidores = await servidorModel.listarServidoresPorEmpresa(empresa, usuario);
    const servidor = servidores.find(
        (s) => String(s.endereco_mac || "").trim().toUpperCase() === mac
    );

    if (!servidor) {
        throw new Error("Servidor não encontrado ou sem acesso.");
    }

    const componentes = servidor.componentes || [];
    const cpu = extrairLimite(componentes, ["cpu_percent", "process_cpu_percent"]) || LIMIARES_PADRAO.cpu;
    const rssGb = extrairLimite(componentes, ["process_rss", "ram_used", "ram_percent"]) || LIMIARES_PADRAO.rssGb;

    return { cpu, rssGb };
}

async function listarLotes(mac, dataInicio, dataFim) {
    const base = path.join(getClientDir(), "lotes", `maquina=${mac}`);
    let datas;
    try {
        datas = await fs.readdir(base);
    } catch (erro) {
        if (erro.code === "ENOENT") return [];
        throw erro;
    }

    const inicio = dataInicio ? String(dataInicio).slice(0, 10) : null;
    const fim = dataFim ? String(dataFim).slice(0, 10) : null;
    const lotes = [];

    for (const entrada of datas) {
        if (!entrada.startsWith("data=")) continue;
        const data = entrada.slice("data=".length);
        if (inicio && data < inicio) continue;
        if (fim && data > fim) continue;

        const dirData = path.join(base, entrada);
        let pastasLote;
        try {
            pastasLote = await fs.readdir(dirData);
        } catch (erro) {
            if (erro.code === "ENOENT") continue;
            throw erro;
        }

        for (const pastaLote of pastasLote) {
            if (!pastaLote.startsWith("lote=")) continue;
            const arquivo = path.join(dirData, pastaLote, "capturas.json");
            try {
                await fs.access(arquivo);
                lotes.push(arquivo);
            } catch (_) {
                // lote sem capturas.json, ignora
            }
        }
    }
    return lotes;
}

async function lerJson(arquivo) {
    const conteudo = await fs.readFile(arquivo, "utf-8");
    return JSON.parse(conteudo);
}

async function carregarAmostras(filtros) {
    const mac = String(filtros.mac || filtros.servidor || "").trim().toUpperCase();
    if (!mac) throw new Error("Informe o servidor (mac).");

    const dataInicio = filtros.inicio || filtros.dataInicio || null;
    const dataFim = filtros.fim || filtros.dataFim || null;
    const arquivos = await listarLotes(mac, dataInicio, dataFim);
    const amostras = [];

    for (const arquivo of arquivos) {
        const lote = await lerJson(arquivo);
        const processos = Array.isArray(lote.processos) ? lote.processos : [];
        for (const registro of processos) {
            const amostra = normalizarAmostraProcesso(registro);
            if (dataInicio && amostra.timestamp < dataInicio) continue;
            if (dataFim && amostra.timestamp > dataFim) continue;
            amostras.push(amostra);
        }
    }

    amostras.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    return amostras;
}

function ultimaPorProcesso(amostras) {
    const mapa = new Map();
    for (const a of amostras) {
        mapa.set(chaveProcesso(a), a);
    }
    return Array.from(mapa.values());
}

function primeiraUltimaPorProcesso(amostras) {
    const mapa = new Map();
    for (const a of amostras) {
        const chave = chaveProcesso(a);
        if (!mapa.has(chave)) {
            mapa.set(chave, { primeira: a, ultima: a });
        } else {
            mapa.get(chave).ultima = a;
        }
    }
    return mapa;
}

function pico(pontos) {
    let melhor = null;
    for (const p of pontos) {
        if (p.v == null) continue;
        if (!melhor || p.v > melhor.v) melhor = p;
    }
    return melhor;
}

function obterContexto(filtros) {
    return resolverLimites(filtros).then(function (limites) {
        return {
            servidores: filtros.mac ? [{ mac: String(filtros.mac).trim().toUpperCase() }] : [],
            periodos: [
                { id: "ultima-hora", label: "Última hora" },
                { id: "ultimas-6h", label: "Últimas 6 horas" },
                { id: "ultimas-24h", label: "Últimas 24 horas" }
            ],
            intervalo: { inicio: filtros.inicio || null, fim: filtros.fim || null },
            limites
        };
    });
}

function obterKpis(filtros) {
    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            const atuais = ultimaPorProcesso(amostras);
            let criticos = 0;
            let cpuAtencao = 0;
            let cpuCritico = 0;
            let ramAtencao = 0;
            let ramCritico = 0;
            let threadsTotal = 0;

            for (const p of atuais) {
                const status = classificar(p.cpu, p.rssGb, limites);
                if (status === "Crítico") criticos++;

                if (p.cpu != null && limites.cpu.critico != null && p.cpu >= limites.cpu.critico) cpuCritico++;
                else if (p.cpu != null && limites.cpu.atencao != null && p.cpu >= limites.cpu.atencao) cpuAtencao++;

                if (p.rssGb != null && limites.rssGb.critico != null && p.rssGb >= limites.rssGb.critico) ramCritico++;
                else if (p.rssGb != null && limites.rssGb.atencao != null && p.rssGb >= limites.rssGb.atencao) ramAtencao++;

                if (p.threads != null) threadsTotal += p.threads;
            }

            return {
                kpis: [
                    { id: "processos-identificados", valor: atuais.length, subtitulo: "No servidor selecionado" },
                    { id: "processos-criticos", valor: criticos, subtitulo: "Limite crítico excedido" },
                    { id: "cpu-elevada", valor: cpuAtencao + cpuCritico, subtitulo: `${cpuAtencao} em atenção · ${cpuCritico} críticos` },
                    { id: "ram-elevada", valor: ramAtencao + ramCritico, subtitulo: `${ramAtencao} em atenção · ${ramCritico} críticos` },
                    { id: "threads-identificadas", valor: threadsTotal, subtitulo: "Dos processos monitorados" },
                    { id: "eventos-registrados", valor: 0, subtitulo: "Implementar na etapa de eventos" }
                ]
            };
        });
}

function obterSerieTemporal(filtros) {
    const pidFiltro = filtros.pid != null ? Number(filtros.pid) : null;
    const nomeFiltro = filtros.processo || filtros.nome || null;

    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            let serie = amostras;
            if (pidFiltro != null) serie = serie.filter((a) => a.pid === pidFiltro);
            if (nomeFiltro) serie = serie.filter((a) => a.nome === nomeFiltro);

            if (serie.length === 0) {
                return {
                    processo: null,
                    cpu: { pontos: [], limites: limites.cpu },
                    rss: { pontos: [], limites: limites.rssGb },
                    comparativo: null,
                    primeiroDesvio: null
                };
            }

            serie.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

            const pontosCpu = serie.map((a) => ({ t: a.timestamp, v: a.cpu }));
            const pontosRss = serie.map((a) => ({ t: a.timestamp, v: a.rssGb }));
            const primeiro = serie[0];
            const ultimo = serie[serie.length - 1];

            let primeiroDesvio = null;
            for (const a of serie) {
                if (classificar(a.cpu, a.rssGb, limites) !== "Normal") {
                    primeiroDesvio = a.timestamp;
                    break;
                }
            }

            return {
                processo: ultimo.nome,
                pid: ultimo.pid,
                usuario: ultimo.usuario,
                statusAtual: classificar(ultimo.cpu, ultimo.rssGb, limites),
                primeiroDesvio,
                cpu: {
                    atual: ultimo.cpu,
                    unidade: "%",
                    limites: limites.cpu,
                    pico: pico(pontosCpu),
                    pontos: pontosCpu
                },
                rss: {
                    atual: ultimo.rssGb,
                    unidade: "GB",
                    limites: limites.rssGb,
                    pico: pico(pontosRss),
                    pontos: pontosRss
                },
                comparativo: {
                    cpu: formatarDeltaCpu(primeiro.cpu, ultimo.cpu),
                    rss: formatarDeltaRss(primeiro.rssGb, ultimo.rssGb)
                }
            };
        });
}

function obterVariacao(filtros) {
    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            const mapa = primeiraUltimaPorProcesso(amostras);
            const processos = [];

            for (const { primeira, ultima } of mapa.values()) {
                const deltaCpu = (primeira.cpu != null && ultima.cpu != null) ? (ultima.cpu - primeira.cpu) : null;
                const deltaRss = (primeira.rssGb != null && ultima.rssGb != null) ? (ultima.rssGb - primeira.rssGb) : null;
                processos.push({
                    processo: ultima.nome,
                    pid: ultima.pid,
                    cpuAntes: primeira.cpu,
                    cpuAtual: ultima.cpu,
                    deltaCpu,
                    rssAntesGb: primeira.rssGb,
                    rssAtualGb: ultima.rssGb,
                    deltaRssGb: deltaRss,
                    status: classificar(ultima.cpu, ultima.rssGb, limites)
                });
            }

            processos.sort((a, b) => Math.abs(b.deltaCpu || 0) - Math.abs(a.deltaCpu || 0));
            return { processos };
        });
}

function obterEventos(filtros) {
    // Próximo passo: detectar transições comparando amostras consecutivas por processo
    // (início/fim, cruzou atenção/crítico de CPU/RSS) e montar janelaInvestigacao.
    return Promise.resolve({ janelaInvestigacao: null, eventos: [] });
}

function listarTodos(filtros) {
    const pagina = Math.max(1, Number(filtros.pagina) || 1);
    const porPagina = Math.max(1, Math.min(100, Number(filtros.porPagina) || 10));

    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            let itens = ultimaPorProcesso(amostras).map((p) => ({
                nome: p.nome,
                pid: p.pid,
                usuario: p.usuario,
                cpu: p.cpu,
                memoriaRssGb: p.rssGb,
                threads: p.threads,
                status: classificar(p.cpu, p.rssGb, limites),
                criacao: p.createTime
            }));

            const busca = String(filtros.busca || "").toLowerCase();
            if (busca) {
                itens = itens.filter(
                    (i) => String(i.nome || "").toLowerCase().includes(busca) || String(i.pid).includes(busca)
                );
            }
            if (filtros.status) {
                itens = itens.filter((i) => i.status === filtros.status);
            }

            const total = itens.length;
            const inicioIdx = (pagina - 1) * porPagina;
            itens = itens.slice(inicioIdx, inicioIdx + porPagina);

            return { itens, total, pagina, porPagina };
        });
}

function obterRecorrencia(filtros) {
    // Próximo passo: agrupar eventos por (processo/pid, tipo), ocorrências,
    // última ocorrência, duração média (apenas encerradas) e frequência 1-5.
    return Promise.resolve({ itens: [] });
}

module.exports = {
    obterContexto,
    obterKpis,
    obterSerieTemporal,
    obterVariacao,
    obterEventos,
    listarTodos,
    obterRecorrencia,
    _internos: {
        carregarAmostras,
        normalizarAmostraProcesso,
        classificar,
        resolverLimites,
        extrairLimite
    }
};