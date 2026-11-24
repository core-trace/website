const processosModel = require("../models/processosModel");
const servidorModel = require("../models/servidorModel");

/**
 * Limiares padrão quando não há perfil de servidor no banco (ou não foram
 * informados idEmpresa/idUsuario). CPU de processo NÃO é limitada a 100%:
 * pode passar de 100% em servidor multinúcleo. RAM fica em 0..100.
 */
const LIMIARES_PADRAO = {
    cpu: { atencao: 60, critico: 90 },
    rssGb: { atencao: 2.0, critico: 2.5 }
};

function extrairValor(leitura) {
    if (!leitura || typeof leitura !== "object") return null;
    if (leitura.valor !== undefined) return leitura.valor;
    if (leitura.ultimo_valor !== undefined) return leitura.ultimo_valor;
    if (leitura.media !== undefined) return leitura.media;
    return null;
}

function statusDaLeitura(leitura) {
    if (!leitura) return "indisponivel";
    return leitura.status || "indisponivel";
}

function toNumber(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza uma amostra de processo vinda do lote JSON do Gold.
 * O Gold grava: cpu.uso (metrica/valor/status) e
 * memoria.uso_percentual (metrica/valor/status).
 */
function normalizarAmostra(registro) {
    if (!registro) return null;

    const cpuLeitura = registro.cpu && registro.cpu.uso;
    const memoriaLeitura =
        registro.memoria &&
        (registro.memoria.uso_percentual || registro.memoria.uso);

    const cpu = toNumber(extrairValor(cpuLeitura));
    const memoriaPercent = toNumber(extrairValor(memoriaLeitura));
    const cpuStatus = statusDaLeitura(cpuLeitura);
    const memoriaStatus = statusDaLeitura(memoriaLeitura);

    // Limita RAM a 0..100; CPU de processo não tem teto (multinúcleo).
    let memoriaLimitada = memoriaPercent;
    if (memoriaLimitada != null) {
        memoriaLimitada = Math.max(0, Math.min(100, memoriaLimitada));
    }

    return {
        timestamp: registro.timestamp || null,
        pid: toNumber(registro.pid),
        nome: registro.nome || null,
        usuario: registro.usuario || null,
        cpu: cpu != null ? cpu : null,
        memoria: memoriaLimitada != null ? memoriaLimitada : null,
        cpuStatus,
        memoriaStatus,
        valido: cpuLeitura ? cpuLeitura.status === "ok" : false,
        memoriaValida: memoriaLeitura ? memoriaLeitura.status === "ok" : false
    };
}

/**
 * Carrega todas as amostras de processo de um servidor em um dia,
 * juntando todos os lotes (capturas.json) e ordenando por timestamp.
 */
async function carregarAmostras(mac, data) {
    const macNormalizado = processosModel.normalizarMac(mac);
    const chaves = await processosModel.listarLotesDoDia(macNormalizado, data);

    const amostras = [];
    for (const chave of chaves) {
        if (!chave.endsWith("capturas.json")) continue;

        const lote = await processosModel.buscarConteudoLote(chave);
        if (!lote || !Array.isArray(lote.processos)) continue;

        for (const registro of lote.processos) {
            const amostra = normalizarAmostra(registro);
            if (amostra) amostras.push(amostra);
        }
    }

    amostras.sort(
        (a, b) =>
            new Date(a.timestamp || 0).getTime() -
            new Date(b.timestamp || 0).getTime()
    );

    return amostras;
}

/**
 * Resolve os limiares a usar: do perfil do servidor no banco, se disponível;
 * senão, os padrões.
 */
async function resolverLimites(filtros = {}) {
    const mac = String(filtros.mac || filtros.servidor || "").trim();
    const empresa = Number(filtros.empresa);
    const usuario = Number(filtros.usuario);

    if (
        mac &&
        Number.isSafeInteger(empresa) &&
        Number.isSafeInteger(usuario)
    ) {
        try {
            const servidores = await servidorModel.listarServidoresPorEmpresa(
                empresa,
                usuario
            );
            const servidor = servidores.find(
                (s) =>
                    String(s.endereco_mac || "").trim().toUpperCase() ===
                    mac.toUpperCase()
            );
            if (servidor && servidor.componentes) {
                const cpuComp = servidor.componentes.find(
                    (c) =>
                        String(c.coluna || "").toLowerCase() ===
                        "p_cpu_percent"
                );
                const ramComp = servidor.componentes.find(
                    (c) =>
                        String(c.coluna || "").toLowerCase() ===
                        "p_memory_percent"
                );
                const limiares = {
                    cpu: { ...LIMIARES_PADRAO.cpu },
                    rssGb: { ...LIMIARES_PADRAO.rssGb }
                };
                if (cpuComp) {
                    if (cpuComp.atencao != null)
                        limiares.cpu.atencao = Number(cpuComp.atencao);
                    if (cpuComp.critico != null)
                        limiares.cpu.critico = Number(cpuComp.critico);
                }
                if (ramComp) {
                    if (ramComp.atencao != null)
                        limiares.rssGb.atencao = Number(ramComp.atencao);
                    if (ramComp.critico != null)
                        limiares.rssGb.critico = Number(ramComp.critico);
                }
                return limiares;
            }
        } catch (e) {
            // falha ao ler perfil -> usa padrões
        }
    }

    return { ...LIMIARES_PADRAO };
}

function ehCritico(cpu, memoria, limiares) {
    const cpuCritico =
        cpu != null && limiares.cpu.critico != null && cpu >= limiares.cpu.critico;
    const ramCritico =
        memoria != null &&
        limiares.rssGb.critico != null &&
        memoria >= limiares.rssGb.critico;
    return cpuCritico || ramCritico;
}

function ehAtencao(cpu, memoria, limiares) {
    const cpuAtencao =
        cpu != null && limiares.cpu.atencao != null && cpu >= limiares.cpu.atencao;
    const ramAtencao =
        memoria != null &&
        limiares.rssGb.atencao != null &&
        memoria >= limiares.rssGb.atencao;
    return cpuAtencao || ramAtencao;
}

/**
 * Calcula os KPIs da tela: OOM, processos críticos, pico de RAM, pico de CPU.
 */
function calcularKpis(amostras, resumo, limiares) {
    let criticos = 0;
    let ramMax = { valor: -1, nome: "--", pid: "--", ts: "--" };
    let cpuMax = { valor: -1, nome: "--", pid: "--", ts: "--" };

    for (const a of amostras) {
        const ehCrit =
            ehCritico(a.cpu, a.memoria, limiares) &&
            a.cpuStatus === "ok" &&
            a.memoriaStatus === "ok";
        if (ehCrit) criticos++;

        if (a.memoria != null && a.memoria > ramMax.valor) {
            ramMax = {
                valor: a.memoria,
                nome: a.nome || "--",
                pid: a.pid || "--",
                ts: a.timestamp || "--"
            };
        }

        if (a.cpu != null && a.cpu > cpuMax.valor) {
            cpuMax = {
                valor: a.cpu,
                nome: a.nome || "--",
                pid: a.pid || "--",
                ts: a.timestamp || "--"
            };
        }
    }

    let oomTotal = 0;
    let ultimoOom = null;
    try {
        const ramResumo = resumo && resumo.resumos && resumo.resumos.ram;
        if (ramResumo && ramResumo.oom) {
            oomTotal = ramResumo.oom.total_observado || 0;
            ultimoOom = ramResumo.oom.ultimo_oom_iso || null;
        }
        if (!ultimoOom && resumo && resumo.ultimo_oom_em) {
            ultimoOom = resumo.ultimo_oom_em;
        }
    } catch (e) {
        // ignora; resumo é opcional
    }

    return {
        oomTotal,
        ultimoOom,
        criticos,
        ramMax:
            ramMax.valor >= 0
                ? {
                      valor: ramMax.valor.toFixed(1),
                      nome: ramMax.nome,
                      pid: ramMax.pid,
                      ts: ramMax.ts
                  }
                : null,
        cpuMax:
            cpuMax.valor >= 0
                ? {
                      valor: cpuMax.valor.toFixed(1),
                      nome: cpuMax.nome,
                      pid: cpuMax.pid,
                      ts: cpuMax.ts
                  }
                : null
    };
}

/**
 * Agrupa amostras por nome + PID e calcula recorrência de anormalidades.
 */
function calcularRecorrencia(amostras, limiares) {
    const grupos = new Map();

    for (const a of amostras) {
        const chave = `${a.nome || "desconhecido"} | PID ${a.pid || "--"}`;
        if (!grupos.has(chave)) {
            grupos.set(chave, {
                nome: a.nome || "desconhecido",
                pid: a.pid || "--",
                ocorrencias: 0,
                tipo: "normal",
                ultima: null,
                acimaLimite: 0
            });
        }

        const grupo = grupos.get(chave);
        grupo.ocorrencias++;

        const ehCrit =
            ehCritico(a.cpu, a.memoria, limiares) &&
            a.cpuStatus === "ok" &&
            a.memoriaStatus === "ok";
        const ehAtenc =
            ehAtencao(a.cpu, a.memoria, limiares) &&
            a.cpuStatus === "ok" &&
            a.memoriaStatus === "ok";

        if (ehCrit) grupo.tipo = "crítico";
        else if (ehAtenc && grupo.tipo !== "crítico") grupo.tipo = "atenção";

        if (ehCrit || ehAtenc) grupo.acimaLimite++;

        if (!grupo.ultima || new Date(a.timestamp) > new Date(grupo.ultima)) {
            grupo.ultima = a.timestamp;
        }
    }

    const resultado = Array.from(grupos.values()).map((g) => ({
        nome: g.nome,
        pid: g.pid,
        ocorrencias: g.ocorrencias,
        acimaLimite: g.acimaLimite,
        tipo: g.tipo,
        ultima: g.ultima,
        frequencia: g.ocorrencias > 1 ? "recorrente" : "única"
    }));

    resultado.sort((a, b) => b.acimaLimite - a.acimaLimite || b.ocorrencias - a.ocorrencias);
    return resultado;
}

/**
 * Extrai a série temporal (pontos {t, v}) de um processo específico.
 * Só entra leitura com status "ok".
 */
function obterSerie(amostras, nomeProcesso, pid, metrica = "cpu") {
    const filtrados = amostras.filter(
        (p) =>
            (p.nome || "") === nomeProcesso &&
            String(p.pid) === String(pid)
    );

    const pontos = [];
    for (const p of filtrados) {
        const valor = metrica === "cpu" ? p.cpu : p.memoria;
        const valido = metrica === "cpu" ? p.valido : p.memoriaValida;
        if (valor != null && valido) {
            pontos.push({ t: p.timestamp, v: valor });
        }
    }

    return pontos;
}

/**
 * Compara os dois últimos instantes distintos (momento A → momento B).
 */
function compararMomentos(amostras) {
    const temposUnicos = [
        ...new Set(amostras.map((p) => p.timestamp).filter(Boolean))
    ].sort();

    if (temposUnicos.length < 2) return null;

    const a = temposUnicos[temposUnicos.length - 2];
    const b = temposUnicos[temposUnicos.length - 1];

    const grupoA = amostras.filter((p) => p.timestamp === a);
    const grupoB = amostras.filter((p) => p.timestamp === b);

    const mediaCpuA = mediaValores(grupoA, "cpu");
    const mediaCpuB = mediaValores(grupoB, "cpu");
    const mediaMemA = mediaValores(grupoA, "memoria");
    const mediaMemB = mediaValores(grupoB, "memoria");

    return {
        momentoA: a,
        momentoB: b,
        cpu: mediaCpuA != null && mediaCpuB != null
            ? { a: mediaCpuA, b: mediaCpuB, delta: mediaCpuB - mediaCpuA }
            : null,
        memoria: mediaMemA != null && mediaMemB != null
            ? { a: mediaMemA, b: mediaMemB, delta: mediaMemB - mediaMemA }
            : null
    };
}

function mediaValores(grupo, metrica) {
    const validos = grupo.filter((p) => {
        const v = metrica === "cpu" ? p.cpu : p.memoria;
        const ok = metrica === "cpu" ? p.valido : p.memoriaValida;
        return v != null && ok;
    });
    if (validos.length === 0) return null;
    const soma = validos.reduce((acc, p) => acc + (metrica === "cpu" ? p.cpu : p.memoria), 0);
    return soma / validos.length;
}

/**
 * Monta a resposta agregada para a tela de processos.
 */
async function obterDashboard(filtros = {}) {
    const { mac, data } = filtros;
    if (!mac || !data) {
        throw new Error("Parâmetros 'mac' e 'data' são obrigatórios.");
    }

    const limiares = await resolverLimites(filtros);
    const amostras = await carregarAmostras(mac, data);

    let resumo = null;
    try {
        resumo = await processosModel.buscarResumoDiario(mac, data);
    } catch (e) {
        // resumo opcional (pode ainda não existir para o dia)
    }

    const kpis = calcularKpis(amostras, resumo, limiares);
    const recorrencia = calcularRecorrencia(amostras, limiares);
    const comparacao = compararMomentos(amostras);

    return {
        mac,
        data,
        limiares,
        kpis,
        recorrencia,
        comparacao,
        total: amostras.length,
        ultimaColeta: amostras.length > 0 ? amostras[amostras.length - 1].timestamp : null,
        processos: amostras
    };
}

module.exports = {
    normalizarAmostra,
    carregarAmostras,
    resolverLimites,
    calcularKpis,
    calcularRecorrencia,
    obterSerie,
    compararMomentos,
    obterDashboard,
    LIMIARES_PADRAO
};
