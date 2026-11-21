
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
                ticks: { stepSize: 5 }
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


document.getElementById("historico-status").disabled = true;


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


function atualizarIndicadores(quantidade) {
    mostrarValor("indicador-perfis-configurados", quantidade);
    mostrarValor("indicador-perfis-ativos", null);
    mostrarValor("indicador-servidores-inativos", null);
    mostrarValor("indicador-perfil-critico", null);
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

// Mostra o impacto financeiro apenas quando houver tempo crítico e custo por hora.
function atualizarPrejuizo() {
    const lista = document.getElementById("prejuizo-perfis");
    const modelo = document.getElementById("linha-prejuizo");
    lista.innerHTML = "";
    const valores = [];
    let maiorValor = 0;
    for (const perfil of perfisDashboard) {
        let estimativa = null;
        if (Number.isFinite(perfil.tempoCriticoMinutos) && perfil.tempoCriticoMinutos >= 0 &&
            Number.isFinite(perfil.custoHora) && perfil.custoHora >= 0) {
            estimativa = perfil.tempoCriticoMinutos / 60 * perfil.custoHora;
            if (!Number.isFinite(estimativa)) estimativa = null;
            if (estimativa > maiorValor) maiorValor = estimativa;
        }
        valores.push({ perfil: perfil, estimativa: estimativa });
    }
    // Os maiores prejuízos aparecem primeiro. Os perfis sem dados ficam no final.
    valores.sort(function(a, b) {
        if (a.estimativa === null && b.estimativa === null) return 0;
        if (a.estimativa === null) return 1;
        if (b.estimativa === null) return -1;
        return b.estimativa - a.estimativa;
    });
    for (const item of valores) {
        const linha = modelo.content.cloneNode(true);
        linha.querySelector(".prejuizo-nome").textContent = item.perfil.nome;
        if (item.estimativa !== null) {
            linha.querySelector(".prejuizo-valor").textContent = item.estimativa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const custo = item.perfil.custoHora.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            linha.querySelector(".prejuizo-detalhe").textContent = item.perfil.tempoCriticoMinutos + " min em estado crítico × " + custo + "/h";
            linha.querySelector(".prejuizo-trilho").hidden = false;
            if (maiorValor > 0) linha.querySelector(".prejuizo-barra").style.width = item.estimativa / maiorValor * 100 + "%";
        }
        lista.append(linha);
    }
    if (perfisDashboard.length === 0) lista.textContent = "Nenhum perfil disponível.";
}


function atualizarTabelaStatus() {
    const tabela = document.getElementById("status-perfis");
    tabela.innerHTML = "";
    for (const perfil of perfisDashboard) {
        const linha = tabela.insertRow();
        adicionarCelula(linha, perfil.nome);
        adicionarCelula(linha, null);
        adicionarCelula(linha, null);
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
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error("Não foi possível consultar os dados. Confira o terminal do servidor.");
        const dados = await resposta.json();
        perfisDashboard = dados.perfis;
        atualizarIndicadores(dados.kpis.perfisConfigurados);
        atualizarGraficoServidores();
        atualizarPrejuizo();
        atualizarTabelaStatus();
        preencherFiltro();
        if (perfisDashboard.length === 0) {
            feedback.textContent = "Nenhum perfil disponível para este usuário.";
        } else {
            feedback.textContent = "";
            feedback.hidden = true;
        }
    } catch (erro) {
        feedback.textContent = erro.message;
        feedback.hidden = false;
    }
}

filtroLimites.addEventListener("change", atualizarLimites);
carregarDashboard();
