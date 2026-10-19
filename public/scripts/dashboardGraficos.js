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
        document.getElementById('graficos-periodo').textContent = `Cenário simulado iFood · ${dataHora(resumo.inicio)} até ${dataHora(resumo.fim)} · horário de Brasília · ${resumo.totalServidores} servidores no histórico. O período selecionado se aplica aos dois gráficos.`;
        document.getElementById('evolucao-granularidade').textContent = resumo.granularidade === 5
            ? 'Coletas a cada 5 minutos.'
            : `Coletas de 5 minutos; picos e vales preservados em janelas de ${resumo.granularidade < 60 ? `${resumo.granularidade} min` : `${resumo.granularidade / 60} h`}.`;
        document.getElementById('recursos-resumo').textContent = recursos.map(recurso => {
            const item = resumo.recursos[recurso];
            return `${recurso}: ${item.atencao} em atenção, ${item.critico} críticos no período.`;
        }).join(' ');
        document.getElementById('evolucao-resumo').textContent = resumo.evolucao.map(item => `${dataHora(item.instante)}: ${item.atencao} em atenção, ${item.critico} críticos.`).join(' ');
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
                backgroundColor: cores[nivel], borderColor: cores[nivel], borderWidth: evolucao ? 2 : 0,
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
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 18, color: '#777278', font: { family: 'Poppins', size: 11 } } },
                        tooltip: { callbacks: {
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
                            title: { display: true, text: evolucao ? 'Tempo · horário de Brasília' : 'Recurso', color: '#777278', font: { family: 'Poppins', size: 10 } },
                            grid: { display: false }, border: { display: false },
                            ticks: {
                                ...(evolucao ? { callback: valor => resumo.periodo >= 10080 ? dataHora(valor).split(',')[0]
                                    : resumo.periodo >= 1440 ? dataHora(valor).split(',').map(parte => parte.trim()) : horario(valor) } : {}),
                                maxRotation: 0, maxTicksLimit: evolucao ? (resumo.periodo >= 10080 ? 8 : 5) : 4,
                                color: '#777278', font: { family: 'Poppins', size: 10 }
                            }
                        },
                        y: { beginAtZero: true, max: resumo.totalServidores, border: { display: false }, title: { display: true, text: evolucao ? 'Servidores' : 'Servidores distintos', color: '#777278', font: { family: 'Poppins', size: 10 } }, ticks: { precision: 0, maxTicksLimit: 5, color: '#777278', font: { family: 'Poppins', size: 10 } }, grid: { color: '#eee' } }
                    }
                }
            }));
        }
    }
    return { renderizar };
})();
