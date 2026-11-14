
const ctxServidores = document.getElementById("grafico-servidores-perfil");

const graficoServidores = new Chart(ctxServidores, {
    type: "bar",
    data: {
        labels: [],
        datasets: [{
            label: "Servidores",
            data: [],
            backgroundColor: "#44779f",
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


let perfisDashboard = [];

const ctxCriticos = document.getElementById("grafico-perfis-criticos");

const graficoCriticos = new Chart(ctxCriticos, {
    type: "bar",
    data: {
        labels: [],
        datasets: [{
            label: "Servidores críticos",
            data: [],
            backgroundColor: "#44779f",
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

function atualizarGrafico(grafico, nomes, valores) {
    //atualizar qualquer gráfico com os dados recebidos do backend
    grafico.data.labels = nomes;
    grafico.data.datasets[0].data = valores;
    grafico.update();
}

function formatarLimite(metrica, campo) {

    let texto = "";

    const valor1 = metrica[campo];
    const valor2 = metrica[campo + "2"];

    if (valor1 != null && valor1 !== "" && metrica.operador) {
        texto = metrica.operador + " " + valor1 + " " + metrica.unidade;
    }

    if (valor2 != null && valor2 !== "" && metrica.operador2) {

        if (texto !== "") {
            texto += " ou ";
        }

        texto += metrica.operador2 + " " + valor2 + " " + metrica.unidade;
    }

    if (texto === "") {
        texto = "Não definido";
    }

    return texto;
}

function escaparHtml(valor) {
    return String(valor).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function atualizarLimites() {

    const id = document.getElementById("perfil-limites").value;
    const area = document.getElementById("limites-componentes");

    area.innerHTML = "";

    for (const perfil of perfisDashboard) {

        if (perfil.id == id) {

            const categorias = {
                cpu: "CPU",
                carga: "Carga",
                ram: "RAM",
                rede: "Rede",
                swap: "Swap",
                disco: "Disco"
            };

            const grupos = {};

            for (const metrica of perfil.limites) {

                const categoria = categorias[metrica.categoria] || "Outros";

                if (!grupos[categoria]) {
                    grupos[categoria] = [];
                }

                grupos[categoria].push(metrica);
            }

            if (perfil.limites.length === 0) {
                area.textContent = "Nenhuma métrica configurada neste perfil.";
            }

            for (const categoria in grupos) {

                let html = `
                    <details class="componente-limites">
                        <summary>
                            <span>${categoria}</span>
                            <small>Ver métricas e limites</small>
                        </summary>

                        <div class="tabela-limites-area">
                            <table class="tabela-limites">
                                <caption>Métricas de ${categoria}</caption>
                                <thead>
                                    <tr>
                                        <th>Métrica</th>
                                        <th>Atenção</th>
                                        <th>Crítico</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                for (const metrica of grupos[categoria]) {

                    html += `
                        <tr>
                            <th>${escaparHtml(metrica.nome)}</th>
                            <td>${escaparHtml(formatarLimite(metrica, "atencao"))}</td>
                            <td>${escaparHtml(formatarLimite(metrica, "critico"))}</td>
                        </tr>
                    `;
                }

                html += `
                                </tbody>
                            </table>
                        </div>
                    </details>
                `;

                area.innerHTML += html;
            }

            return;
        }
    }

    area.textContent = "Nenhuma métrica configurada neste perfil.";
}



document.getElementById("perfil-limites")
    .addEventListener("change", atualizarLimites);

const limitesExemplo = [
    { categoria: "cpu", nome: "Uso da CPU", unidade: "%", operador: ">=", atencao: 80, critico: 90 },
    { categoria: "cpu", nome: "Espera por E/S", unidade: "%", operador: ">=", atencao: 10, critico: 20 },
    { categoria: "ram", nome: "Uso da memória", unidade: "%", operador: ">=", atencao: 80, critico: 90 },
    { categoria: "ram", nome: "Memória disponível", unidade: "GiB", operador: "<=", atencao: 2, critico: 1 },
    { categoria: "rede", nome: "Tráfego recebido", unidade: "MiB/s", operador: ">=", atencao: 80, critico: 100 },
    { categoria: "rede", nome: "Tráfego enviado", unidade: "MiB/s", operador: ">=", atencao: 80, critico: 100 },
    { categoria: "swap", nome: "Uso de swap", unidade: "%", operador: ">=", atencao: 50, critico: 80 },
    { categoria: "swap", nome: "Espaço livre em swap", unidade: "GiB", operador: "<=", atencao: 1, critico: 0.5 },
    { categoria: "disco", nome: "Ocupação do disco", unidade: "%", operador: ">=", atencao: 80, critico: 90 },
    { categoria: "disco", nome: "Uso de inodes", unidade: "%", operador: ">=", atencao: 80, critico: 90 }
];

perfisDashboard = [
    { id: 1, nome: "Carrinho", totalServidores: 12, ativos: 10, inativos: 2, normais: 7, atencao: 2, criticos: 1, indisponiveis: 2, limites: limitesExemplo },
    { id: 2, nome: "Catálogo", totalServidores: 15, ativos: 12, inativos: 3, normais: 3, atencao: 2, criticos: 7, indisponiveis: 3, limites: limitesExemplo },
    { id: 3, nome: "Financeiro", totalServidores: 13, ativos: 13, inativos: 0, normais: 5, atencao: 1, criticos: 7, indisponiveis: 0, limites: limitesExemplo },
    { id: 4, nome: "Pedido", totalServidores: 0, ativos: 0, inativos: 0, normais: 0, atencao: 0, criticos: 0, indisponiveis: 0, limites: limitesExemplo }
];

const nomesExemplo = [];
const totaisExemplo = [];
const filtroLimitesExemplo = document.getElementById("perfil-limites");
const tabelaExemplo = document.getElementById("status-perfis");
let totalInativosExemplo = 0;
let perfisAtivosExemplo = 0;
let maiorQuantidadeExemplo = 0;
const rankingExemplo = [];

for (const perfil of perfisDashboard) {
    nomesExemplo.push(perfil.nome);
    totaisExemplo.push(perfil.totalServidores);
    filtroLimitesExemplo.add(new Option(perfil.nome, perfil.id));
    totalInativosExemplo += perfil.inativos;
    if (perfil.ativos > 0) perfisAtivosExemplo++;
    if (perfil.criticos > maiorQuantidadeExemplo) maiorQuantidadeExemplo = perfil.criticos;
    let percentual = 0;
    if (perfil.totalServidores > 0) percentual = Math.round(perfil.criticos / perfil.totalServidores * 10000) / 100;
    rankingExemplo.push({ nome: perfil.nome, percentual: percentual });
}

const maisCriticosExemplo = [];
for (const perfil of perfisDashboard) {
    if (maiorQuantidadeExemplo > 0 && perfil.criticos === maiorQuantidadeExemplo) maisCriticosExemplo.push(perfil.nome);
}
rankingExemplo.sort(function(a, b) { return b.percentual - a.percentual; });
const nomesRankingExemplo = [];
const percentuaisExemplo = [];
for (const perfil of rankingExemplo) {
    nomesRankingExemplo.push(perfil.nome);
    percentuaisExemplo.push(perfil.percentual);
}

atualizarGrafico(graficoServidores, nomesExemplo, totaisExemplo);
atualizarGrafico(graficoCriticos, nomesRankingExemplo, percentuaisExemplo);
filtroLimitesExemplo.disabled = false;
filtroLimitesExemplo.value = "3";
atualizarLimites();
document.getElementById("indicador-perfis-configurados").textContent = perfisDashboard.length;
document.getElementById("indicador-perfis-ativos").textContent = perfisAtivosExemplo;
document.getElementById("indicador-servidores-inativos").textContent = totalInativosExemplo;
document.getElementById("indicador-perfil-critico").textContent = maisCriticosExemplo[0] || "Nenhum";
const feedbackDashboard = document.getElementById("dashboard-feedback");
feedbackDashboard.textContent = "";
feedbackDashboard.hidden = true;
ctxServidores.setAttribute("aria-label", "Dados de exemplo: servidores por perfil.");
ctxCriticos.setAttribute("aria-label", "Dados de exemplo: percentual de servidores críticos por perfil.");

/*
Os dados acima são exemplos locais para mostrar os gráficos e KPIs sem backend.
Os totais e percentuais são calculados a partir da mesma lista para manter coerência.
Os filtros continuam funcionando e os limites também são exemplos. Nenhuma chamada
é feita ao banco, à API ou ao S3.
*/

const historicoStatusExemplo = {
    "30": [10, 12, 13, 0],
    "60": [11, 13, 12, 0],
    "420": [12, 14, 13, 0],
    "1440": [9, 11, 12, 0]
};
const filtroHistoricoStatus = document.getElementById("historico-status");

function atualizarHistoricoStatus() {
    const ativosPorPerfil = historicoStatusExemplo[filtroHistoricoStatus.value];
    tabelaExemplo.innerHTML = "";
    for (let i = 0; i < perfisDashboard.length; i++) {
        const perfil = perfisDashboard[i];
        const linha = tabelaExemplo.insertRow();
        linha.insertCell().textContent = perfil.nome;
        linha.insertCell().textContent = ativosPorPerfil[i];
        linha.insertCell().textContent = perfil.totalServidores - ativosPorPerfil[i];
    }
    const opcao = filtroHistoricoStatus.options[filtroHistoricoStatus.selectedIndex];
    document.getElementById("descricao-historico-status").textContent =
        "Histórico demonstrativo: " + opcao.text.toLowerCase();
}

filtroHistoricoStatus.addEventListener("change", atualizarHistoricoStatus);
atualizarHistoricoStatus();

/*
O seletor mostra exemplos do status em quatro momentos anteriores. Cada opção
atualiza somente a tabela de status, mantendo os KPIs e os demais gráficos como
estão. Ativos e inativos somam o total de servidores de cada perfil. Estes valores
são simulados; não representam consultas ao banco nem um histórico real.
*/
