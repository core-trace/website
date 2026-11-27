/*
 * Teste de integração do front da Dashboard de Processos: gráfico de CPU em
 * barras empilhadas, tooltip, indicador, filtros e seleção de processos.
 * Execução: node tests/processosGraficoCpu.test.js
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class ListaClasses {
    constructor() { this.itens = new Set(); }
    add(...nomes) { nomes.forEach(n => this.itens.add(n)); }
    remove(...nomes) { nomes.forEach(n => this.itens.delete(n)); }
    contains(nome) { return this.itens.has(nome); }
    toggle(nome, forcar) {
        const ligado = forcar === undefined ? !this.itens.has(nome) : !!forcar;
        ligado ? this.itens.add(nome) : this.itens.delete(nome);
        return ligado;
    }
}

class Elemento {
    constructor(tag = "div", id = "") {
        this.tagName = tag.toUpperCase();
        this.id = id;
        this.children = [];
        this.dataset = {};
        this.classList = new ListaClasses();
        this.listeners = {};
        this.textContent = "";
        this.title = "";
        this.hidden = false;
        this.value = "";
        this.style = {};
    }
    addEventListener(tipo, fn) { (this.listeners[tipo] ||= []).push(fn); }
    dispatch(tipo, evento = {}) {
        (this.listeners[tipo] || []).forEach(fn => fn.call(this, {
            target: this, preventDefault() {}, ...evento
        }));
    }
    appendChild(filho) { this.children.push(filho); filho.parentNode = this; return filho; }
    set innerHTML(_valor) { this.children = []; }
    get innerHTML() { return ""; }
    querySelectorAll(seletor) {
        if (seletor === "tr") return this.children.filter(e => e.tagName === "TR");
        if (seletor === "tr.linha-ativa") {
            return this.children.filter(e => e.tagName === "TR" && e.classList.contains("linha-ativa"));
        }
        if (seletor === "td") return this.children.filter(e => e.tagName === "TD");
        return [];
    }
    querySelector(seletor) { return this.querySelectorAll(seletor)[0] || null; }
    closest(seletor) {
        let atual = this;
        while (atual) {
            if (seletor === "tr" && atual.tagName === "TR") return atual;
            atual = atual.parentNode;
        }
        return null;
    }
}

const elementos = new Map();
const document = {
    getElementById(id) {
        if (!elementos.has(id)) elementos.set(id, new Elemento("div", id));
        return elementos.get(id);
    },
    createElement(tag) { return new Elemento(tag); }
};
const tbody = document.getElementById("tbody-top5-recursos");
const filtroPeriodo = document.getElementById("periodo-graficos-processos");

const registrosChart = [];
class Chart {
    constructor(canvas, configuracao) {
        this.canvas = canvas;
        this.configuracao = configuracao;
        this.destriado = false;
        registrosChart.push(this);
    }
    destroy() { this.destriado = true; }
}

const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const em = hora => `${hoje}T${hora}:00`;
const amostra = (nome, pid, createTime, horas, cpus, mems) => horas.map((h, i) => ({
    timestamp: em(h), pid, nome, createTime,
    cpu: cpus[i], memoria: mems[i], usuario: null,
    cpuStatus: "ok", memoriaStatus: "ok", valido: true, memoriaValida: true
}));

const app = amostra("app", 10, "1000", ["10:00", "10:30", "11:00"], [5, 25, 70], [10, 20, 95]);
const worker = amostra("worker", 20, "2000", ["10:00", "10:30", "11:00"], [1, 2, 3], [40, 45, 50]);
const comLacuna = amostra("gap", 30, "3000", ["10:00", "11:00"], [80, 80], [30, 30]);
const acima100 = amostra("overload", 40, "4000", ["10:15"], [150], [60]);
const processos = [...app, ...worker, ...comLacuna, ...acima100]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

async function fetchStub(url) {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/processos/servidores") {
        return { ok: true, json: async () => ({ servidores: [{ mac: "AA:BB", nome: "srv" }] }) };
    }
    const data = parsed.searchParams.get("data");
    const corpo = data === hoje ? {
        total: processos.length,
        processos,
        // Pico global de outro processo: nao pode comandar os chips do selecionado.
        kpis: {
            picoMemoria: { valor: 99, nome: "worker", pid: 20, usuario: "root", timestamp: em("11:00") },
            picoCpu: { valor: 150, nome: "overload", pid: 40, timestamp: em("10:15") },
            reiniciandoLoop: { total: 0, processos: [] }
        },
        top5Recursos: [
            { nome: "app", pid: 10, createTime: "1000", cpuMax: 70, memoriaMax: 95, ultimoPico: em("11:00") },
            { nome: "worker", pid: 20, createTime: "2000", cpuMax: 3, memoriaMax: 50, ultimoPico: em("11:00") },
            { nome: "gap", pid: 30, createTime: "3000", cpuMax: 80, memoriaMax: 30, ultimoPico: em("11:00") },
            { nome: "overload", pid: 40, createTime: "4000", cpuMax: 150, memoriaMax: 60, ultimoPico: em("10:15") }
        ],
        comparacao: { momentoA: em("10:00"), momentoB: em("11:00") },
        limiares: { cpu: { atencao: 60, critico: 90 }, rssGb: { atencao: 2, critico: 2.5 } }
    } : { total: 0, processos: [], kpis: null, top5Recursos: [] };
    return { ok: true, json: async () => corpo };
}

const agregacao = require("../public/scripts/processosAgregacao.js");
const sandbox = {
    document,
    Chart,
    ProcessosAgregacao: agregacao,
    fetch: fetchStub,
    sessionStorage: { getItem: () => "1" },
    console,
    URL,
    URLSearchParams,
    Date,
    Number,
    String,
    Math,
    Promise,
    Set,
    Map,
    Array,
    Object,
    JSON
};
const codigo = fs.readFileSync(path.join(__dirname, "../public/scripts/processos.js"), "utf8");
vm.runInNewContext(codigo, sandbox);

function assert(condicao, mensagem) {
    if (!condicao) throw new Error("FALHA: " + mensagem);
    console.log("ok - " + mensagem);
}
const texto = id => document.getElementById(id).textContent;
const cpuCharts = () => registrosChart.filter(c => c.canvas.id === "grafico-cpu-area");
const ramCharts = () => registrosChart.filter(c => c.canvas.id === "grafico-memoria-area");
const cpuChart = () => cpuCharts()[cpuCharts().length - 1];
const cpuDatasets = () => cpuChart().configuracao.data.datasets;
const distribuicao = () => cpuChart().configuracaoDistribuicao.distribuicao;
const linhas = () => tbody.querySelectorAll("tr");
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function selecionar(indice) {
    tbody.dispatch("click", { target: linhas()[indice].querySelectorAll("td")[0] });
}

(async () => {
    for (let i = 0; i < 12; i++) await tick();

    filtroPeriodo.value = "60";
    filtroPeriodo.dispatch("change");

    assert(linhas().length === 4, "ranking com quatro linhas");
    assert(linhas()[0].dataset.pid === "10" && linhas()[0].dataset.createTime === "1000",
        "a linha guarda PID e CREATE_TIME do dado, nao do texto");
    assert(texto("meta-processo") === "app (PID 10)", "selecao automatica usa o mesmo processo dos graficos");
    assert(texto("meta-status") === "crítico", "indicador reflete as leituras reais do selecionado");
    assert(linhas()[0].classList.contains("linha-ativa") && !linhas()[1].classList.contains("linha-ativa"),
        "linha selecionada destacada");

    // --- Gráfico de CPU: barras empilhadas ---
    const cfg = cpuChart().configuracao;
    assert(cfg.type === "bar", "CPU usa grafico de barras");
    assert(ramCharts()[ramCharts().length - 1].configuracao.type === "line", "RAM continua como linha");
    assert(cpuDatasets().map(d => d.label).join("|") ===
        "Até 25%|25% a 50%|50% a 75%|Acima de 75%", "legendas das quatro faixas na ordem da agregacao");
    assert(new Set(cpuDatasets().map(d => d.backgroundColor)).size === 4, "cores distintas por faixa");
    assert(cfg.options.scales.x.stacked && cfg.options.scales.y.stacked &&
        cfg.options.scales.y.min === 0 && cfg.options.scales.y.max === 100,
        "eixo empilhado de 0% a 100% do tempo observado");
    assert(cfg.options.plugins.legend.display === true, "legenda visivel");

    const indiceComDado = distribuicao().findIndex(b => b.observadoMs > 0);
    const somaSegmentos = cpuDatasets().reduce((soma, d) => soma + (d.data[indiceComDado] || 0), 0);
    assert(Math.abs(somaSegmentos - 100) < 1e-9, "segmentos somam 100% do tempo observado no intervalo");

    // --- Tooltip consistente com a agregação ---
    const tooltip = cfg.options.plugins.tooltip;
    const faixaAte25 = cpuDatasets().find(d => d.faixa === "ate25");
    const itemTooltip = {
        dataIndex: indiceComDado,
        dataset: faixaAte25,
        parsed: { y: faixaAte25.data[indiceComDado] },
        raw: faixaAte25.data[indiceComDado]
    };
    const tituloTooltip = tooltip.callbacks.title([itemTooltip]);
    const linhasTooltip = tooltip.callbacks.label(itemTooltip);
    const bucket = distribuicao()[indiceComDado];
    assert(tituloTooltip.includes(String(new Date(bucket.inicio).getFullYear())), "tooltip traz data do intervalo");
    assert(linhasTooltip.some(linha => linha.includes("Faixa: Até 25%")), "tooltip identifica a faixa");
    assert(linhasTooltip.some(linha => linha.includes("Proporção: 100,0% do tempo observado")),
        "tooltip mostra a proporcao real da agregacao");
    assert(linhasTooltip.some(linha => linha.includes("Tempo na faixa: 1 min")),
        "tooltip mostra o tempo absoluto na faixa");
    assert(linhasTooltip.some(linha => linha.includes("Total observado: 1 min")),
        "tooltip mostra o total efetivamente observado");
    assert(tooltip.filter(itemTooltip) === true, "segmento com valor aparece no tooltip");
    assert(tooltip.filter({ parsed: { y: null }, raw: null }) !== true, "intervalo sem dado nao gera tooltip");

    // --- Indicador complementar usa soma de tempo, sem media/max/min ---
    assert(texto("grafico-cpu-valor") === "Tempo observado: 3 min", "total observado do periodo selecionado");
    assert(texto("cpu-tempo-elevado") === "Acima de 75%: 0 min", "tempo acima de 75% do app");
    assert(texto("grafico-cpu-caption") === "Intervalos de 1 min · 3 com dados",
        "caption informa granularidade e quantidade de intervalos com dados");

    // --- Todos os filtros disponíveis ---
    for (const [valor, esperado] of [["60", "1 min"], ["360", "5 min"], ["1440", "15 min"], ["10080", "1 h"]]) {
        filtroPeriodo.value = valor;
        filtroPeriodo.dispatch("change");
        assert(texto("grafico-cpu-caption").includes(`Intervalos de ${esperado}`), `filtro ${valor} usa passo ${esperado}`);
        assert(cpuChart().configuracaoDistribuicao.rotulo === esperado, `granularidade do filtro ${valor}`);
        assert(cpuDatasets().length === 4, `faixas preservadas no filtro ${valor}`);
    }
    filtroPeriodo.value = "60";
    filtroPeriodo.dispatch("change");

    // --- Processo diferente troca a distribuição ---
    selecionar(1);
    assert(texto("meta-processo") === "worker (PID 20)", "troca de processo atualiza o identificador");
    assert(linhas()[1].classList.contains("linha-ativa") && !linhas()[0].classList.contains("linha-ativa"),
        "destaque acompanha a troca");
    assert(!cpuDatasets()[0].data.every(v => v == null), "worker tem segmentos na faixa baixa");
    assert(cpuDatasets()[3].data.every(v => v == null || v === 0), "worker nao tem segmento acima de 75%");
    assert(texto("cpu-tempo-elevado") === "Acima de 75%: 0 min", "indicador acompanha o novo processo");
    const serieRamWorker = ramCharts()[ramCharts().length - 1].configuracao.data.datasets
        .find(d => d.label.startsWith("Variação RAM")).data.map(p => p.y);
    assert(serieRamWorker.at(-1) === 5, "serie de RAM passa a conter somente o novo processo");

    // --- Intervalos sem amostras não viram barra de baixo consumo ---
    selecionar(2);
    const vazios = distribuicao().filter(b => b.observadoMs === 0);
    assert(vazios.length > 0 && distribuicao().some(b => b.observadoMs > 0), "gap tem intervalos com e sem dados");
    const indiceVazio = distribuicao().findIndex(b => b.observadoMs === 0);
    assert(cpuDatasets().every(d => d.data[indiceVazio] == null), "intervalo sem dado nao recebe segmento");
    assert(texto("cpu-tempo-elevado") === "Acima de 75%: 2 min", "tempo elevado soma apenas amostras reais do gap");

    // --- CPU acima de 100% permanece na faixa crítica ---
    selecionar(3);
    const indice150 = distribuicao().findIndex(b => b.observadoMs > 0);
    const acima75 = cpuDatasets().find(d => d.faixa === "acima75");
    assert(acima75.data[indice150] === 100, "CPU 150% vai integralmente para acima de 75%");
    assert(texto("cpu-tempo-elevado") === "Acima de 75%: 1 min", "indicador inclui CPU acima de 100%");

    // --- Processo sem amostras limpa os dois gráficos ---
    const linhaInexistente = document.createElement("tr");
    linhaInexistente.dataset.chave = "fantasma|--|";
    linhaInexistente.dataset.nome = "fantasma";
    linhaInexistente.dataset.pid = "999";
    tbody.appendChild(linhaInexistente);
    tbody.dispatch("click", { target: linhaInexistente });
    assert(texto("meta-processo") === "--" && texto("meta-usuario") === "--" && texto("meta-status") === "--",
        "sem amostras os indicadores do processo anterior sao limpos");
    assert(texto("grafico-cpu-valor") === "--" && texto("grafico-cpu-caption") === "--" &&
        texto("cpu-tempo-elevado") === "--", "sem amostras os textos da CPU sao limpos");
    assert(tbody.querySelectorAll("tr.linha-ativa").length === 0, "nenhuma linha permanece destacada");
    assert(cpuDatasets().every(d => d.data.length === 0), "serie anterior nao permanece no grafico de CPU");
    assert(ramCharts()[ramCharts().length - 1].configuracao.data.datasets
        .find(d => d.label.startsWith("Variação RAM")).data.length === 0,
        "serie anterior nao permanece no grafico de RAM");

    filtroPeriodo.value = "360";
    filtroPeriodo.dispatch("change");
    assert(texto("meta-processo") === "--", "troca de periodo sem processo em foco nao restaura dado antigo");
})().catch(erro => { console.error(erro.message); process.exitCode = 1; });
