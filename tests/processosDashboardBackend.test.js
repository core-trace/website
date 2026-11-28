/*
 * Testes do dashboard de processos no servidor: uma única rota deve devolver
 * o período inteiro, mantendo KPIs/Top 5 no dia de referência.
 * Execução: node tests/processosDashboardBackend.test.js
 */
const assert = require("node:assert/strict");
const Module = require("node:module");

const chamadas = { listar: [], lotes: [], resumo: [], servidores: [] };

function stubModulo(caminho, exports) {
    const resolvido = require.resolve(caminho);
    const modulo = new Module(resolvido);
    modulo.filename = resolvido;
    modulo.loaded = true;
    modulo.exports = exports;
    require.cache[resolvido] = modulo;
}

function amostra(tempo, pid, cpu) {
    return {
        timestamp: tempo,
        pid,
        nome: "app",
        cpu: { uso: { valor: cpu, status: "ok" } },
        memoria: { uso_percentual: { valor: 40 + cpu / 10, status: "ok" } }
    };
}

stubModulo("../src/models/processosModel", {
    normalizarMac: mac => String(mac || "").trim().toUpperCase(),
    listarLotesDoDia: async (mac, data) => {
        chamadas.listar.push({ mac, data });
        // Dia sem captura: o dashboard deve continuar com os demais.
        if (data === "2026-11-24") return [];
        return [`client/lotes/maquina=${mac}/data=${data}/capturas.json`];
    },
    buscarConteudoLote: async chave => {
        chamadas.lotes.push(chave);
        const data = chave.match(/data=(\d{4}-\d{2}-\d{2})/)[1];
        return {
            processos: [
                amostra(`${data}T10:00:00Z`, 10, 20),
                amostra(`${data}T11:00:00Z`, 10, 30)
            ]
        };
    },
    buscarResumoDiario: async (mac, data) => {
        chamadas.resumo.push({ mac, data });
        return {
            kpis_processos: {
                pico_cpu: {
                    destaque: {
                        pico_cpu_percent: 88,
                        pid: 10,
                        nome: "app",
                        instante_pico: `${data}T11:00:00Z`
                    }
                },
                pico_memoria: {
                    destaque: {
                        pico_memoria_percent: 43,
                        pid: 10,
                        nome: "app",
                        instante_pico: `${data}T11:00:00Z`
                    }
                }
            }
        };
    }
});

stubModulo("../src/models/servidorModel", {
    listarServidoresPorEmpresa: async () => {
        chamadas.servidores.push(true);
        return [{ endereco_mac: "AA:BB", nome: "srv", componentes: [] }];
    }
});

stubModulo("../src/services/resumoGoldService", {
    dataDeHojeSaoPaulo: () => "2026-11-27"
});

const service = require("../src/services/processosService");
const controller = require("../src/controllers/processosController");

function filtros(data, dias) {
    return { mac: "aa:bb", data, dias, idEmpresa: 1, idUsuario: 1 };
}

(async () => {
    assert.deepEqual(
        service.datasDoPeriodo("2026-11-27", 7),
        [
            "2026-11-27", "2026-11-26", "2026-11-25", "2026-11-24",
            "2026-11-23", "2026-11-22", "2026-11-21"
        ],
        "período vai do dia consultado para trás"
    );
    assert.throws(() => service.datasDoPeriodo("27/11/2026", 7), /Data inválida/);
    assert.throws(() => service.normalizarDias(32), /1 a 31/);

    const dashboard = await service.obterDashboard(filtros("2026-11-27", 7));

    assert.equal(chamadas.listar.length, 7, "uma listagem por dia, feita no backend");
    assert.equal(chamadas.lotes.length, 6, "dia sem captura não gera leitura de lote");
    assert.equal(dashboard.dias, 7);
    assert.equal(dashboard.dataConsulta, "2026-11-27");
    assert.equal(dashboard.periodo.fim, "2026-11-27");
    assert.equal(dashboard.periodo.inicio, "2026-11-21");
    assert.equal(dashboard.diasComDados, 6);
    assert.equal(dashboard.total, 12, "todas as amostras do período voltam na resposta");
    assert.equal(dashboard.processos.length, 12);
    assert.equal(dashboard.data, "2026-11-27", "KPIs ficam no dia de referência");
    assert.equal(chamadas.resumo.at(-1).data, "2026-11-27");
    assert.equal(dashboard.kpis.picoCpu.valor, 88, "pico da Gold é preservado");
    assert.equal(dashboard.top5Recursos.length, 1, "Top 5 usa só o dia de referência");
    assert.equal(dashboard.comparacao.momentoA, "2026-11-27T10:00:00Z");

    const semDia = await service.obterDashboard(filtros("2026-11-24", 3));
    assert.equal(semDia.data, "2026-11-23", "dia sem captura usa o mais recente com dados");
    assert.equal(semDia.total, 4);
    assert.equal(chamadas.resumo.at(-1).data, "2026-11-23");

    const umDia = await service.carregarAmostras("aa:bb", "2026-11-27");
    assert.equal(umDia.length, 2, "rota /dados continua funcionando com um dia");

    let status = 200;
    let corpo = null;
    const res = {
        status(codigo) { status = codigo; return this; },
        json(dados) { corpo = dados; return this; }
    };
    await controller.obterDashboard({
        query: { mac: "AA:BB", data: "2026-11-27", dias: "7", empresa: "1", usuario: "1" }
    }, res);
    assert.equal(status, 200);
    assert.equal(corpo.total, 12, "a rota devolve o período inteiro em uma resposta");
    assert.equal(corpo.dias, 7);

    await controller.obterDashboard({
        query: { mac: "AA:BB", data: "2026-11-27", dias: "1", empresa: "1", usuario: "1" }
    }, res);
    assert.equal(corpo.total, 2, "cache distingue períodos diferentes");

    console.log("processosDashboardBackend: todos os testes passaram.");
})().catch(erro => {
    console.error(erro);
    process.exitCode = 1;
});
