
const ctxServidores = document.getElementById("grafico-servidores-perfil");

const graficoServidores = new Chart(ctxServidores, {
    type: "bar",
    data: {
        labels: [],
        datasets: [{
            label: "Servidores",
            data: [],
            backgroundColor: "#fff3f3",
            borderColor: "#ff3131",
            borderWidth: 2,
            borderRadius: 3,
            maxBarThickness: 40
        }]
    },
    options: {
        indexAxis: "x",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                grid: { display: false }
            },
            y: {
                beginAtZero: true,
                grace: "15%",
                ticks: { precision: 0, maxTicksLimit: 6 }
            }
        }
    }
});


const ctxCriticos = document.getElementById("grafico-perfis-criticos");

const graficoCriticos = new Chart(ctxCriticos, {
    type: "bar",
    data: {
        labels: [],
        datasets: [{
            label: "Servidores críticos",
            data: [],
            backgroundColor: "#cc0301",
            borderRadius: 4,
            maxBarThickness: 10
        }]
    },
    options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: contexto => `${contexto.parsed.x}% de servidores críticos`
                }
            }
        },
        scales: {
            x: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    stepSize: 25,
                    callback: valor => `${valor}%`
                }
            },
            y: {
                grid: { display: false }
            }
        }
    }
});

let perfisDashboard = [];
const filtroLimites = document.getElementById("perfil-limites");
const feedback = document.getElementById("dashboard-feedback");
const categorias = ["cpu", "ram", "rede", "swap", "disco", "carga", "outros"];




function mostrarValor(id, valor) {
    if (valor === null || valor === undefined) {
        document.getElementById(id).textContent = "—";
    } else {
        document.getElementById(id).textContent = valor;
    }
}

// cria uma célula e escreve o texto nela.
function adicionarCelula(linha, valor) {
    const celula = linha.insertCell();
    if (valor === null || valor === undefined) {
        celula.textContent = "—";
    } else {
        celula.textContent = valor;
    }
}

// Junta o sinal, o número e a unidade
function formatarLimite(metrica, campo) {
    let texto = "";
    const primeiro = metrica[campo];
    const segundo = metrica[campo + "2"];
    if (primeiro !== null && primeiro !== undefined && primeiro !== "") {
        texto = metrica.operador + " " + primeiro + " " + metrica.unidade;
    }
    if (segundo !== null && segundo !== undefined && segundo !== "") {
        if (texto !== "") texto += " ou ";
        texto += metrica.operador2 + " " + segundo + " " + metrica.unidade;
    }
    if (texto === "") return "Não definido";
    return texto;
}

// limpa as tabelas antes de mostrar os limites de outro perfil.
function limparLimites() {
    for (const categoria of categorias) {
        document.getElementById("metricas-" + categoria).innerHTML = "";
        document.getElementById("componente-" + categoria).hidden = true;
    }
    document.getElementById("limites-vazios").hidden = true;
}

// As tabelas já estão no HTML. Aqui só preenchemos as linhas do perfil escolhido.
function atualizarLimites() {
    limparLimites();
    for (const perfil of perfisDashboard) {
        if (String(perfil.id) === filtroLimites.value) {
            for (const metrica of perfil.limites) {
                let categoria = metrica.categoria;
                if (!categorias.includes(categoria)) categoria = "outros";
                document.getElementById("componente-" + categoria).hidden = false;
                const tabela = document.getElementById("metricas-" + categoria);
                const linha = tabela.insertRow();
                adicionarCelula(linha, metrica.nome);
                adicionarCelula(linha, formatarLimite(metrica, "atencao"));
                adicionarCelula(linha, formatarLimite(metrica, "critico"));
            }
            if (perfil.limites.length === 0) {
                document.getElementById("limites-vazios").hidden = false;
            }
            return;
        }
    }
}

// Coloca os nomes dos perfis no filtro
function preencherFiltro() {
    filtroLimites.innerHTML = "";
    for (const perfil of perfisDashboard) {
        //add os perfis que existem no filtro
        filtroLimites.add(new Option(perfil.nome, perfil.id));
    }
    filtroLimites.disabled = perfisDashboard.length === 0;
    atualizarLimites();
}


// Mostra as contagens devolvidas pelo backend. Empates aparecem com os dois nomes.
function atualizarIndicadores(kpis) {
    mostrarValor("indicador-perfis-configurados", kpis.perfisConfigurados);
    mostrarValor("indicador-perfis-ativos", kpis.perfisAtivos);
    let nomes = null;
    if (Array.isArray(kpis.perfisComMaisCriticos)) {
        nomes = kpis.perfisComMaisCriticos.map(perfil => perfil.nome).join(", ") || "Nenhum";
    }
    mostrarValor("indicador-perfil-critico", nomes);
}

function atualizarGraficoCriticos(ranking) {
    graficoCriticos.data.labels = ranking.map(perfil => perfil.nome);
    graficoCriticos.data.datasets[0].data = ranking.map(perfil => perfil.percentualCriticos);
    graficoCriticos.update();
}

function atualizarGraficoServidores() {
    const nomes = [];
    const totais = [];
    for (const perfil of perfisDashboard) {
        nomes.push(perfil.nome);
        totais.push(perfil.totalServidores);
    }
    graficoServidores.data.labels = nomes;
    graficoServidores.data.datasets[0].data = totais;
    graficoServidores.update();
}

const filtroCustos = document.getElementById("perfil-custos");
let moedaCustos = "BRL";
const graficoCustos = new Chart(document.getElementById("grafico-custos-perfil"), {
    type: "bar",
    data: {
        labels: [],
        datasets: [
            { label: "Estimado", data: [], backgroundColor: "#cc0301", borderRadius: 2, stack: "custos" },
            { label: "Projetado", data: [], backgroundColor: "#d9dce2", borderRadius: 2, stack: "custos" }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
                label: contexto => contexto.dataset.label + ": " + formatarCusto(contexto.parsed.y)
            } }
        },
        scales: {
            x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0 } },
            y: { stacked: true, beginAtZero: true, ticks: { maxTicksLimit: 5, callback: valor => formatarCusto(valor) } }
        }
    }
});

function formatarCusto(valor) {
    if (!Number.isFinite(valor) || valor < 0) return "—";
    return valor.toLocaleString("pt-BR", { style: "currency", currency: moedaCustos });
}

// O navegador só mostra os valores e a projeção que vierem prontos do backend.
function atualizarCustos() {
    const vazio = document.getElementById("custos-vazios");
    const nomes = [];
    const realizados = [];
    const projetados = [];
    document.getElementById("custo-atual").textContent = "—";
    document.getElementById("custo-previsto").textContent = "—";
    document.getElementById("custo-periodo-atual").textContent = "Neste mês";
    document.getElementById("custo-periodo-previsto").textContent = "Até o último dia do mês";
    vazio.hidden = false;
    vazio.textContent = "Custos ainda não disponíveis.";

    for (const perfil of perfisDashboard) {
        if (String(perfil.id) !== filtroCustos.value) continue;
        const custos = perfil.custos;
        if (!custos) break;
        // A estimativa usa a moeda do preço consultado, sem conversão automática.
        if (!/^[A-Z]{3}$/.test(custos.moeda || "")) break;
        moedaCustos = custos.moeda;
        document.getElementById("custo-atual").textContent = formatarCusto(custos.gastoAteAgora);
        document.getElementById("custo-previsto").textContent = formatarCusto(custos.previsaoFimMes);
        if (typeof custos.periodoRealizado === "string") document.getElementById("custo-periodo-atual").textContent = custos.periodoRealizado;
        if (typeof custos.periodoMes === "string") document.getElementById("custo-periodo-previsto").textContent = custos.periodoMes;
        for (const dia of Array.isArray(custos.serie) ? custos.serie : []) {
            if (typeof dia.data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia.data)) continue;
            nomes.push(dia.data.slice(8, 10) + "/" + dia.data.slice(5, 7));
            realizados.push(Number.isFinite(dia.realizadoAcumulado) && dia.realizadoAcumulado >= 0 ? dia.realizadoAcumulado : null);
            projetados.push(Number.isFinite(dia.projetadoAcumulado) && dia.projetadoAcumulado >= 0 ? dia.projetadoAcumulado : null);
        }
        // Cada dia usa o valor realizado OU o projetado, para não somar acumulados.
        for (let i = 0; i < realizados.length; i++) {
            if (realizados[i] !== null) projetados[i] = null;
        }
        vazio.hidden = realizados.concat(projetados).some(valor => valor !== null);
        break;
    }
    if (perfisDashboard.length === 0) vazio.textContent = "Nenhum perfil disponível.";
    document.querySelector(".painel.custos").classList.toggle("sem-custos", !vazio.hidden);
    graficoCustos.data.labels = nomes;
    graficoCustos.data.datasets[0].data = realizados;
    graficoCustos.data.datasets[1].data = projetados;
    graficoCustos.update();
}

function preencherFiltroCustos() {
    filtroCustos.innerHTML = "";
    for (const perfil of perfisDashboard) filtroCustos.add(new Option(perfil.nome, perfil.id));
    filtroCustos.disabled = perfisDashboard.length === 0;
    atualizarCustos();
}


function atualizarTabelaStatus() {
    const tabela = document.getElementById("status-perfis");
    tabela.innerHTML = "";
    for (const perfil of perfisDashboard) {
        const linha = tabela.insertRow();
        adicionarCelula(linha, perfil.nome);
        adicionarCelula(linha, perfil.ativos);
        adicionarCelula(linha, perfil.inativos);
    }
}


async function carregarDashboard() {
    feedback.hidden = false;
    feedback.textContent = "Carregando dados...";
    try {
        const empresa = sessionStorage.ID_EMPRESA;
        const usuario = sessionStorage.ID_USUARIO;
        if (!empresa || !usuario) throw new Error("Faça login para consultar os dados.");
        const url = "/servidor/dashboard-perfil?empresa=" + encodeURIComponent(empresa) +
            "&usuario=" + encodeURIComponent(usuario);
        // Mostra primeiro o que vem do banco; os indicadores de coleta chegam depois.
        const respostaCadastros = await fetch(url + "&cadastros=1");
        if (!respostaCadastros.ok) throw new Error("Não foi possível carregar os cadastros da dashboard.");
        const cadastros = await respostaCadastros.json();
        perfisDashboard = cadastros.perfis;
        atualizarIndicadores(cadastros.kpis);
        atualizarGraficoServidores();
        preencherFiltroCustos();
        preencherFiltro();
        atualizarTabelaStatus();
        if (perfisDashboard.length === 0) {
            feedback.textContent = "Nenhum perfil disponível para este usuário.";
            return;
        }
        feedback.textContent = "Carregando status e críticos...";
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error("Não foi possível consultar os dados. Confira o terminal do servidor.");
        const dados = await resposta.json();
        perfisDashboard = dados.perfis;
        atualizarIndicadores(dados.kpis);
        // Mostra o horário consultado no backend, incluindo a data fixa do cenário.
        const dataStatus = new Date(dados.geradoEm);
        document.getElementById("descricao-status").textContent =
            Number.isFinite(dataStatus.getTime())
                ? "Status em " + dataStatus.toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short"
                })
                : "Status atual";
        atualizarGraficoCriticos(dados.rankingCriticos);
        atualizarGraficoServidores();
        // Mantém o perfil escolhido enquanto as capturas estavam carregando.
        atualizarCustos();
        atualizarTabelaStatus();
        atualizarLimites();
        if (perfisDashboard.length === 0) {
            feedback.textContent = "Nenhum perfil disponível para este usuário.";
        } else {
            feedback.textContent = (dados.avisos || []).filter(aviso =>
                aviso !== "Os indicadores aguardam uma saída atualizada da Gold ou o acesso ao bucket."
            ).join(" ");
            feedback.hidden = !feedback.textContent;
        }
    } catch (erro) {
        feedback.textContent = erro.message;
        feedback.hidden = false;
    }
}

filtroCustos.addEventListener("change", atualizarCustos);
filtroLimites.addEventListener("change", atualizarLimites);
carregarDashboard();
