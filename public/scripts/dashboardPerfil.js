// Gráfico 1: dados demonstrativos da referência visual.
(async function criarGraficoServidoresPorPerfil() {
    const elemento = document.getElementById('grafico-servidores-perfil');
    if (!elemento || typeof Chart === 'undefined') return;

    // Aguarda a fonte local para que o canvas use a mesma tipografia da página.
    await document.fonts.ready;

    new Chart(elemento, {
        type: 'bar',
        data: {
            labels: ['Carrinho', 'Catálogo', 'Financeiro', 'Pedido'],
            datasets: [{
                label: 'Servidores',
                data: [12, 15, 13, 0],
                backgroundColor: '#44779f',
                borderRadius: 3,
                borderSkipped: false,
                maxBarThickness: 14
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            locale: 'pt-BR',
            animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    titleFont: { family: 'Poppins' },
                    bodyFont: { family: 'Poppins' },
                    callbacks: {
                        label: contexto => `${contexto.parsed.x} servidores`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    suggestedMax: 15,
                    border: { color: '#e4e4e7' },
                    grid: { color: '#eeeeef', drawTicks: false },
                    ticks: {
                        stepSize: 5,
                        precision: 0,
                        color: '#79757e',
                        padding: 8,
                        font: { family: 'Poppins', size: 10 }
                    },
                    title: {
                        display: true,
                        text: 'Nº de servidores',
                        align: 'start',
                        color: '#79757e',
                        font: { family: 'Poppins', size: 10 }
                    }
                },
                y: {
                    border: { display: false },
                    grid: { display: false },
                    ticks: {
                        color: '#79757e',
                        padding: 10,
                        font: { family: 'Poppins', size: 10 }
                    }
                }
            }
        }
    });
})();
