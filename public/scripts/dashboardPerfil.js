
const ctxServidores = document.getElementById("grafico-servidores-perfil");

new Chart(ctxServidores, {
    type: "bar",
    data: {
        labels: ["Carrinho", "Catálogo", "Financeiro", "Pedido"],
        datasets: [{
            label: "Servidores",
            data: [12, 15, 13, 0],
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


const ctxSaude = document.getElementById("grafico-saude-perfil");
const filtroPerfil = document.getElementById("health-profile");
const dadosSaude = {
    "Catálogo": [3, 2, 7, 3],
    "Financeiro": [5, 1, 7, 0],
    "Carrinho": [7, 2, 1, 2],
    "Pedido": [0, 0, 0, 0]
};

const graficoSaude = new Chart(ctxSaude, {
    type: "doughnut",
    data: {
        labels: ["Normal", "Atenção", "Crítico", "Dados inativos"],
        datasets: [{
            data: dadosSaude[filtroPerfil.value],
            backgroundColor: ["#138c62", "#b77909", "#cc0301", "#7e7b82"],
            borderWidth: 0
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "75%",
        plugins: {
            legend: {
                position: "right",
                labels: {
                    usePointStyle: true,
                    pointStyle: "circle",
                    boxWidth: 6,
                    boxHeight: 6,
                    padding: 16
                }
            }
        }
    },
    // Desenha o total no centro da rosca.
    plugins: [{
        id: "totalMaquinas",
        afterDraw(grafico) {
            const arco = grafico.getDatasetMeta(0).data[0];
            const total = grafico.data.datasets[0].data.reduce((soma, valor) => soma + valor, 0);
            const ctx = grafico.ctx;

            ctx.save();
            ctx.textAlign = "center";
            ctx.fillStyle = "#29262c";
            ctx.font = "600 24px Arial";
            ctx.fillText(total, arco.x, arco.y);
            ctx.fillStyle = "#79757e";
            ctx.font = "10px Arial";
            ctx.fillText("Máquinas", arco.x, arco.y + 20);
            ctx.restore();
        }
    }]
});

filtroPerfil.addEventListener("change", function () {
    const valores = dadosSaude[this.value];
    const total = valores.reduce((soma, valor) => soma + valor, 0);

    graficoSaude.data.datasets[0].data = valores;
    graficoSaude.update();
    ctxSaude.setAttribute("aria-label", `Saúde do perfil ${this.value}: ${total} máquinas. Normal: ${valores[0]}; Atenção: ${valores[1]}; Crítico: ${valores[2]}; Dados inativos: ${valores[3]}.`);
    document.querySelector(".saude .cabecalho-painel p").textContent = `Distribuição das ${total} máquinas do perfil`;
});

const ctxCriticos = document.getElementById("grafico-perfis-criticos");

new Chart(ctxCriticos, {
    type: "bar",
    data: {
        labels: ["Catálogo", "Financeiro", "Carrinho", "Pedidos"],
        datasets: [{
            label: "Servidores críticos",
            data: [60, 55, 10, 0],
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
