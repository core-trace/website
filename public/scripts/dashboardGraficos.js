const dashboardGraficos = (() => {
    const graficos = [];
    const cores = { atencao: '#e5ad13', critico: '#cc0301' };
    const horario = instante => monitoramentoMock.horario(instante);
    const dataHora = instante => monitoramentoMock.dataHora(instante);

    function renderizar(resumo) {
        graficos.splice(0).forEach(grafico => grafico.destroy());
        const semServidores = resumo.totalServidores === 0;
        const semBiblioteca = typeof Chart === 'undefined';
        const recursos = dashboardAlertasMock.recursos;
        document.getElementById('graficos-periodo').textContent = '';
        document.getElementById('evolucao-granularidade').textContent = '';
        document.getElementById('recursos-resumo').textContent = '';
        document.getElementById('evolucao-resumo').textContent = '';
        for (const tipo of ['recursos', 'evolucao']) {
            const aviso = semServidores ? 'Nenhum histórico simulado para este perfil no período.' : semBiblioteca ? 'Não foi possível carregar os gráficos. Recarregue a página.' : '';
            const status = document.getElementById(`${tipo}-status`);
            status.textContent = aviso;
            status.hidden = !aviso;
            document.getElementById(`grafico-${tipo}`).hidden = !!aviso;
            if (aviso) continue;
            const evolucao = tipo === 'evolucao';
            const datasets = ['atencao', 'critico'].map(nivel => ({
                label: nivel === 'atencao' ? 'Atenção' : 'Crítico',
                data: evolucao ? resumo.evolucao.map(item => ({ x: item.instante, y: item[nivel] })) : recursos.map(recurso => resumo.recursos[recurso][nivel]),
                backgroundColor: cores[nivel], borderColor: nivel === 'atencao' ? '#9b7200' : cores[nivel], borderWidth: evolucao ? 3 : 1,
                borderRadius: evolucao ? 0 : 3, maxBarThickness: 32,
                pointRadius: 0, pointHoverRadius: 4, tension: 0, spanGaps: false
            }));
            graficos.push(new Chart(document.getElementById(`grafico-${tipo}`), {
                type: evolucao ? 'line' : 'bar',
                data: { labels: evolucao ? resumo.evolucao.map(item => horario(item.instante)) : recursos, datasets },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false, locale: 'pt-BR',
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 12, boxHeight: 12, padding: 18, color: '#4b4350', font: { family: 'Poppins', size: 14 } } },
                        tooltip: { titleFont: { size: 15 }, bodyFont: { size: 14 }, footerFont: { size: 14 }, padding: 12, callbacks: {
                            title: itens => evolucao ? dataHora(resumo.evolucao[itens[0].dataIndex].instante) : itens[0].label,
                            label: item => `${item.dataset.label}: ${item.parsed.y} ${item.parsed.y === 1 ? 'servidor' : 'servidores'}`,
                            footer: () => evolucao
                                ? `${resumo.totalServidores} servidores no perfil selecionado\nCada servidor contado na maior severidade desta coleta`
                                : 'Maior severidade por servidor/recurso em todo o período'
                        } }
                    },
                    scales: {
                        x: {
                            ...(evolucao ? {
                                type: 'linear', min: resumo.inicio, max: resumo.fim,
                                afterBuildTicks: eixo => {
                                    const intervalos = resumo.periodo >= 10080 ? 7 : 4;
                                    eixo.ticks = Array.from({ length: intervalos + 1 }, (_, indice) => ({
                                        value: resumo.inicio + (resumo.fim - resumo.inicio) * indice / intervalos
                                    }));
                                }
                            } : {}),
                            title: { display: true, text: evolucao ? 'Tempo · horário de Brasília' : 'Recurso', color: '#4b4350', font: { family: 'Poppins', size: 14 } },
                            grid: { display: false }, border: { display: false },
                            ticks: {
                                ...(evolucao ? { callback: valor => resumo.periodo >= 10080 ? dataHora(valor).split(',')[0]
                                    : resumo.periodo >= 1440 ? dataHora(valor).split(',').map(parte => parte.trim()) : horario(valor) } : {}),
                                maxRotation: 0, maxTicksLimit: evolucao ? (resumo.periodo >= 10080 ? 8 : 5) : 4,
                                color: '#4b4350', font: { family: 'Poppins', size: 14 }
                            }
                        },
                        y: { beginAtZero: true, max: resumo.totalServidores, border: { display: false }, title: { display: true, text: evolucao ? 'Servidores' : 'Servidores distintos', color: '#4b4350', font: { family: 'Poppins', size: 14 } }, ticks: { precision: 0, maxTicksLimit: 5, color: '#4b4350', font: { family: 'Poppins', size: 14 } }, grid: { color: '#d6dbe3' } }
                    }
                }
            }));
        }
    }
    return { renderizar };
})();
