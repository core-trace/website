const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../src/controllers/dashboardPerfilController");
const limite = { coluna: "cpu_percent", unidade: "%", operador: ">=", atencao: 80, critico: 90 };
function medida(valor) { return { metrica: "cpu_percent", valor: valor, unidade: "%", status: "ok" }; }

test("operadores e limites exatos", function () {
    assert.equal(controller.classificarMedida(medida(0), limite), "normal");
    assert.equal(controller.classificarMedida(medida(80), limite), "atencao");
    assert.equal(controller.classificarMedida(medida(90), limite), "critico");
    assert.equal(controller.comparar(80, ">", 80), false);
    assert.equal(controller.comparar(1, "<=", 2), true);
    assert.equal(controller.comparar(2, "<", 2), false);
});

test("ausências, erros, unidades e limites vazios", function () {
    assert.equal(controller.classificarMedida(null, limite), "indisponivel");
    assert.equal(controller.classificarMedida(medida(101), limite), "indisponivel");
    assert.equal(controller.classificarMedida(medida(-1), limite), "indisponivel");
    assert.equal(controller.classificarMedida(medida(50), { atencao: "", critico: null }), "sem_limite");
    const faixa = { unidade: "%", operador2: "<=", atencao2: "10", critico2: "5" };
    assert.equal(controller.classificarMedida(medida(5), faixa), "critico");
    const ram = { coluna: "ram_available", unidade: "GB", operador: "<=", atencao: 2, critico: 1 };
    assert.equal(controller.classificarMedida({ valor: 1, unidade: "GB", status: "ok" }, ram), "critico");
    assert.equal(controller.classificarMedida({ valor: 1, unidade: "GiB", status: "ok" }, ram), "indisponivel");
});

test("última captura por MAC em múltiplos lotes", function () {
    const documentos = [
        { endereco_mac: "aa-bb-cc-dd-ee-01", metricas: [{ timestamp: "2026-11-12T12:00:02", cpu: { total: null } }] },
        { endereco_mac: "AA:BB:CC:DD:EE:01", metricas: [{ timestamp: "2026-11-12T12:00:01", cpu: { total: medida(95) } }] }
    ];
    const ultimas = controller.buscarUltimas(documentos);
    assert.equal(ultimas["AA:BB:CC:DD:EE:01"].cpu.total, null);
    assert.equal(controller.classificarServidor({ componentes: [limite] }, ultimas["AA:BB:CC:DD:EE:01"]).saude, "indisponivel");
});

test("saúde, perfis vazios, ranking, empates e servidor sem dados", function () {
    const perfis = [{ id_perfil_servidor: 1, nome: "A", componentes: [limite] },
        { id_perfil_servidor: 2, nome: "B", componentes: [limite] },
        { id_perfil_servidor: 3, nome: "Vazio", componentes: [limite] }];
    const servidores = [
        { id_servidor: 1, id_perfil_servidor: 1, endereco_mac: "AA:BB:CC:DD:EE:01", componentes: [limite] },
        { id_servidor: 2, id_perfil_servidor: 1, endereco_mac: "AA:BB:CC:DD:EE:02", componentes: [limite] },
        { id_servidor: 3, id_perfil_servidor: 2, endereco_mac: "AA:BB:CC:DD:EE:03", componentes: [limite] }
    ];
    const documentos = [];
    for (const mac of [servidores[0].endereco_mac, servidores[2].endereco_mac]) {
        documentos.push({ endereco_mac: mac, metricas: [{ timestamp: "2026-11-12T12:00:00", cpu: [medida(0), medida(95)] }] });
    }
    const resultado = controller.montarResultado(perfis, servidores, documentos);
    assert.equal(resultado.perfis[0].percentualCriticos, 50);
    assert.equal(resultado.perfis[0].indisponiveis, 1);
    assert.equal(resultado.perfis[2].totalServidores, 0);
    assert.equal(resultado.perfis[2].limites.length, 1);
    assert.equal(resultado.rankingCriticos[0].id, 2);
    assert.equal(resultado.kpis.perfisComMaisCriticos.length, 2);
    assert.equal(resultado.atividadeTemporalImplementada, false);
});

test("métricas reais da amostra Gold local", function () {
    const gold = require("../../scripts-captura/amostras_etl_local/gold_exemplo.json");
    const ultima = controller.buscarUltimas([gold])[gold.endereco_mac];
    const componentes = [limite,
        { coluna: "ram_percent", unidade: "%", operador: ">=", atencao: 80, critico: 90 },
        { coluna: "disk_inodes_percent", unidade: "%", operador: ">=", atencao: 80, critico: 90 },
        { coluna: "net_traffic", unidade: "bytes/s", operador: ">=", atencao: 1000000, critico: 2000000 }];
    const resultado = controller.classificarServidor({ componentes: componentes }, ultima);
    assert.equal(resultado.metricas.length, 4);
    assert.equal(resultado.metricas[0].classificacao, "indisponivel");
    assert.equal(resultado.metricas[1].classificacao, "atencao");
    assert.equal(resultado.metricas[2].classificacao, "atencao");
    assert.equal(resultado.metricas[3].classificacao, "indisponivel");
    assert.equal(resultado.saude, "atencao");
});
