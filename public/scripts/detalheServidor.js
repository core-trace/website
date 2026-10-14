(() => {
    const dialogo = document.getElementById("detalhes-servidor");
    const conteudo = document.getElementById("detalhes-conteudo");
    const graficos = [];
    let servidorAtual;
    let botaoOrigem;
    let selecao;

    const numero = (valor) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const memoria = (valor) => `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GB`;
    const prazo = (dias) => Number.isFinite(dias) && dias >= 0 ? `${numero(dias)} ${dias === 1 ? "dia" : "dias"}` : "Sem previsão disponível";
    const texto = (id, valor) => { document.getElementById(id).textContent = valor; };
    const canvas = (id, descricao) => `<div class="servidor-grafico"><canvas id="servidor-chart-${id}" role="img" aria-label="${descricao}">${descricao}</canvas></div>`;
    const seletor = (id, descricao, opcoes) => `<label class="servidor-periodo servidor-seletor"><select id="${id}" aria-label="${descricao}">${opcoes}</select></label>`;
    const opcoesDispositivos = (itens) => itens.map((item, indice) => `<option value="${indice}">${item.nome}</option>`).join("");
    const periodo = '<span data-periodo>30</span>';

    function destruirGraficos() {
        graficos.splice(0).forEach((grafico) => grafico.destroy());
    }

    function renderizarPainel(servidor, cenario) {
        texto("detalhes-titulo", servidor.nome);
        texto("detalhes-status", "Crítico · simulação");
        texto("detalhes-perfil", `${servidor.perfil} · ${servidor.sistemaOperacional} · 8 CPUs lógicas · uptime ${servidor.uptime}`);
        texto("detalhes-coleta", "Coleta simulada · últimos dados às 14:31:40 · métricas ilustrativas");
        const nucleos = Array.from({ length: 8 }, (_, indice) => `<div class="servidor-nucleo"><label for="nucleo-${indice}">CPU ${indice}</label><meter id="nucleo-${indice}" min="0" max="100" value="0">0%</meter><span id="nucleo-valor-${indice}"></span></div>`).join("");
        const executando = cenario.containers.filter((item) => item.estado === "Executando").length;
        const parados = cenario.containers.length - executando;

        // Somente os cenários fixos da demonstração são interpolados em HTML.
        // Nome e perfil provenientes do cadastro são atribuídos acima via textContent.
        conteudo.innerHTML = `
            <div class="servidor-alerta"><strong>${cenario.alerta}</strong><p>${cenario.regra}</p></div>
            <section class="servidor-card" aria-labelledby="titulo-cpu">
                <div class="servidor-card-cabecalho">
                    <h3 id="titulo-cpu">Uso de CPU</h3><span class="servidor-cpu-valor">${servidor.cpu}</span>
                    ${seletor("detalhes-periodo", "Período de todos os gráficos", '<option value="30">Últimos 30 minutos</option><option value="15">Últimos 15 minutos</option>')}
                </div>
                ${canvas("cpu", "Histórico de uso total de CPU em porcentagem")}
                <h4>Uso por CPU lógica · média nos últimos ${periodo} minutos</h4>
                <div class="servidor-nucleos">${nucleos}</div>
                <p class="servidor-notas">Carga por CPU lógica · 5 min: ${numero(cenario.carga5)} · 15 min: ${numero(cenario.carga15)}</p>
                <p class="servidor-legenda">Espera por I/O: ${cenario.iowait}%</p>
                <div class="servidor-subcabecalho">
                    ${seletor("detalhes-cpu-logica", "CPU lógica", Array.from({ length: 8 }, (_, indice) => `<option value="${indice}"${indice === 3 ? ' selected' : ''}>CPU lógica ${indice}</option>`).join(""))}
                    <span class="servidor-legenda">Uso nos últimos ${periodo} minutos</span>
                </div>
                ${canvas("cpu-logica", "Histórico da CPU lógica selecionada em porcentagem")}
            </section>
            <section class="servidor-card" aria-labelledby="titulo-ram">
                <h3 id="titulo-ram">Memória disponível · ${memoria(cenario.disponivel)} de ${numero(cenario.capacidade)} GB (${numero(cenario.disponivel / cenario.capacidade * 100)}%)</h3>
                <p class="servidor-legenda">Histórico de ocupação da RAM (%)</p>
                ${canvas("ram", "Histórico de ocupação da memória RAM em porcentagem")}
                <p class="servidor-notas">Ocupação da RAM: ${servidor.ram} · última leitura simulada</p>
                <p class="servidor-notas"><span>Swap: ${cenario.swap}% ocupado</span><span>Entrada: 0 bytes/s · saída: 0 bytes/s</span></p>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-oom">
                <h3 id="titulo-oom">Encerramentos por falta de memória (OOM) · <span id="detalhes-oom-total"></span> no período</h3>
                <p class="servidor-legenda" id="detalhes-oom-descricao" role="status"></p>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-previsao-volumes">
                <h3 id="titulo-previsao-volumes">Previsão de esgotamento por volume</h3>
                <div class="servidor-tabela-scroll" role="region" aria-label="Previsão de esgotamento por volume" tabindex="0">
                    <table class="servidor-tabela"><thead><tr><th scope="col">Volume</th><th scope="col">Espaço livre</th><th scope="col">Espaço: dias restantes</th><th scope="col">Inodes usados</th><th scope="col">Inodes: dias restantes</th></tr></thead>
                    <tbody>${cenario.volumes.map((volume) => `<tr><td>${volume.nome}</td><td>${numero(volume.livre)} GB</td><td>${prazo(volume.diasEspaco)}</td><td>${numero(volume.inodesUsados)}%</td><td>${prazo(volume.diasInodes)}</td></tr>`).join("")}</tbody></table>
                </div>
                <p class="servidor-legenda">Estimativas ilustrativas por volume, baseadas no crescimento diário. Inodes representam a capacidade de registrar arquivos e diretórios. Sem histórico suficiente ou crescimento positivo, não há previsão disponível.</p>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-disco">
                <div class="servidor-card-cabecalho">
                    <h3 id="titulo-disco">Atividade de disco</h3>
                    ${seletor("detalhes-disco", "Dispositivo de disco", opcoesDispositivos(cenario.discos))}
                </div>
                <p class="servidor-notas"><strong id="detalhes-disco-leitura" class="servidor-leitura"></strong><span id="detalhes-disco-escrita" class="servidor-escrita"></span><span id="detalhes-disco-iops"></span></p>
                <p class="servidor-legenda">Azul: leitura · laranja: escrita · 1 MB = 1.000.000 bytes</p>
                ${canvas("disco", "Histórico de leitura e escrita do disco em MB por segundo")}
            </section>
            <section class="servidor-card" aria-labelledby="titulo-io">
                <h3 id="titulo-io">Tempo médio das operações e fila de I/O</h3>
                <p class="servidor-legenda">Dispositivo <span id="detalhes-io-dispositivo"></span> · histórico dos últimos ${periodo} minutos</p>
                <p class="servidor-notas" id="detalhes-io-leitura"></p>
                <h4>Tempo médio estimado de leitura e escrita</h4>
                ${canvas("latencia", "Tempo médio de leitura e escrita em milissegundos")}
                <h4>Fila média de I/O</h4>
                ${canvas("fila", "Quantidade média de operações na fila de I/O")}
                <p class="servidor-legenda">Fila inclui operações em andamento.</p>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-rede">
                <div class="servidor-card-cabecalho">
                    <h3 id="titulo-rede">Rede</h3>
                    ${seletor("detalhes-interface", "Interface de rede", opcoesDispositivos(cenario.redes))}
                    <span class="servidor-legenda" id="detalhes-rede-estado"></span>
                </div>
                <p class="servidor-notas"><strong class="servidor-leitura" id="detalhes-rede-recebimento"></strong><strong class="servidor-envio" id="detalhes-rede-envio"></strong></p>
                <p class="servidor-legenda">Tráfego em MB/s · azul: recebidos · verde: enviados</p>
                ${canvas("rede", "Histórico de recebimento e envio de rede em MB por segundo")}
                <p class="servidor-notas" id="detalhes-rede-erros"></p>
                <p class="servidor-legenda">Erros e descartes: vermelho = entrada/recebimento · azul = saída/envio</p>
                <h4>Erros de recebimento e envio</h4>
                ${canvas("erros", "Erros de recebimento e envio em eventos por segundo")}
                <h4>Descartes de entrada e saída</h4>
                ${canvas("descartes", "Descartes de entrada e saída em pacotes por segundo")}
            </section>
            <section class="servidor-card" aria-labelledby="titulo-processos">
                <h3 id="titulo-processos">Processos monitorados</h3>
                <p class="servidor-legenda">Identidade, estado, CPU e RAM · dados ilustrativos</p>
                <div class="servidor-tabela-scroll" role="region" aria-label="Processos monitorados do servidor" tabindex="0">
                    <table class="servidor-tabela"><thead><tr><th scope="col">PID</th><th scope="col">Nome</th><th scope="col">Estado</th><th scope="col">CPU¹</th><th scope="col">RAM</th></tr></thead>
                    <tbody>${cenario.processos.map((processo) => `<tr><td>${processo.pid}</td><td>${processo.nome}</td><td>${processo.estado}</td><td>${numero(processo.cpu)}%</td><td>${memoria(processo.memoria)}</td></tr>`).join("")}</tbody></table>
                </div>
                <p class="servidor-legenda">¹ 100% equivale a uma CPU lógica; o uso pode ultrapassar 100%.</p>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-containers">
                <h3 id="titulo-containers">Containers Docker · ${cenario.containers.length} encontrados</h3>
                <p class="servidor-legenda">Monitoramento ilustrativo · última coleta Docker simulada: 14:31:35</p>
                <p class="servidor-notas">${executando} em execução · ${parados} ${parados === 1 ? "parado" : "parados"}</p>
                <div class="servidor-tabela-scroll" role="region" aria-label="Containers do servidor" tabindex="0">
                    <table class="servidor-tabela"><thead><tr><th scope="col">Container / ID</th><th scope="col">Estado</th><th scope="col">CPU¹</th><th scope="col">RAM</th><th scope="col">Leitura</th><th scope="col">Escrita</th></tr></thead>
                    <tbody>${cenario.containers.map((container) => {
                        const ativo = container.estado === "Executando";
                        return `<tr><td>${container.nome} <span class="servidor-container-id">· ${container.id}</span></td><td class="${ativo ? "servidor-envio" : "servidor-escrita"}">${container.estado}</td><td>${ativo ? `${numero(container.cpu)}%` : "—"}</td><td>${ativo ? memoria(container.memoria) : "—"}</td><td>${ativo ? `${numero(container.leitura)} B/s` : "—"}</td><td>${ativo ? `${numero(container.escrita)} B/s` : "—"}</td></tr>`;
                    }).join("")}</tbody></table>
                </div>
                <p class="servidor-legenda">¹ CPU na convenção Docker: 100% equivale a uma CPU lógica; pode ultrapassar 100%. Estado do container não confirma saúde da aplicação.</p>
            </section>`;
    }

    function atualizarMetricas(historico) {
        const disco = historico.discos[selecao.disco];
        const rede = historico.redes[selecao.rede];
        const ultimo = (valores) => numero(valores.at(-1));
        conteudo.querySelectorAll("[data-periodo]").forEach((elemento) => { elemento.textContent = selecao.minutos; });
        historico.nucleos.forEach((valores, indice) => {
            const media = Math.round(valores.reduce((total, valor) => total + valor, 0) / valores.length);
            const medidor = document.getElementById(`nucleo-${indice}`);
            medidor.value = media;
            medidor.textContent = `${media}%`;
            texto(`nucleo-valor-${indice}`, `${media}%`);
        });
        texto("detalhes-oom-total", historico.oom.length);
        texto("detalhes-oom-descricao", historico.oom.length
            ? `Novos registros nos últimos ${selecao.minutos} minutos · última detecção na coleta das ${historico.oom.at(-1)}.`
            : `Nenhum novo registro nos últimos ${selecao.minutos} minutos.`);
        texto("detalhes-disco-leitura", `Leitura: ${ultimo(disco.leitura)} MB/s`);
        texto("detalhes-disco-escrita", `Escrita: ${ultimo(disco.escrita)} MB/s`);
        texto("detalhes-disco-iops", `IOPS: ${disco.iopsLeitura} leitura · ${disco.iopsEscrita} escrita`);
        texto("detalhes-io-dispositivo", disco.nome);
        texto("detalhes-io-leitura", `Última leitura · leitura: ${ultimo(disco.latenciaLeitura)} ms · escrita: ${ultimo(disco.latenciaEscrita)} ms · fila média: ${ultimo(disco.fila)} operação`);
        texto("detalhes-rede-estado", rede.ativa ? "Interface ativa" : "Interface inativa");
        texto("detalhes-rede-recebimento", `Recebimento: ${ultimo(rede.recebimento)} MB/s`);
        texto("detalhes-rede-envio", `Envio: ${ultimo(rede.envio)} MB/s`);
        texto("detalhes-rede-erros", `Última leitura · erros: ${ultimo(rede.errosEntrada)} / ${ultimo(rede.errosSaida)} eventos/s · descartes: ${ultimo(rede.descartesEntrada)} / ${ultimo(rede.descartesSaida)} pacotes/s`);
    }

    function criarGraficos() {
        destruirGraficos();
        const historico = monitoramentoMock.historico(servidorAtual.modelo, selecao.minutos);
        atualizarMetricas(historico);
        if (typeof Chart === "undefined") {
            conteudo.querySelectorAll(".servidor-grafico").forEach((area) => {
                area.textContent = "Não foi possível carregar os gráficos. Recarregue a página para tentar novamente.";
            });
            return;
        }
        const disco = historico.discos[selecao.disco];
        const rede = historico.redes[selecao.rede];
        const serie = (label, data, cor) => ({ label, data, borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, spanGaps: false });
        const azul = "#477da7", laranja = "#a76800", vermelho = "#cc0301", verde = "#15865c";
        const configuracoes = [
            ["cpu", [serie("CPU", historico.cpu, vermelho)], "%", 100],
            ["cpu-logica", [serie(`CPU lógica ${selecao.nucleo}`, historico.nucleos[selecao.nucleo], vermelho)], "%", 100],
            ["ram", [serie("RAM", historico.ram, azul)], "%", 100],
            ["disco", [serie("Leitura", disco.leitura, azul), serie("Escrita", disco.escrita, laranja)], " MB/s", 20],
            ["latencia", [serie("Leitura", disco.latenciaLeitura, azul), serie("Escrita", disco.latenciaEscrita, laranja)], " ms", 8],
            ["fila", [serie("Fila média", disco.fila, azul)], " op.", 2],
            ["rede", [serie("Recebimento", rede.recebimento, azul), serie("Envio", rede.envio, verde)], " MB/s", 3],
            ["erros", [serie("Recebimento", rede.errosEntrada, vermelho), serie("Envio", rede.errosSaida, azul)], " eventos/s", 4],
            ["descartes", [serie("Entrada", rede.descartesEntrada, vermelho), serie("Saída", rede.descartesSaida, azul)], " pacotes/s", 4]
        ];
        configuracoes.forEach(([id, datasets, unidade, maximo]) => {
            const elemento = document.getElementById(`servidor-chart-${id}`);
            const origem = ["disco", "latencia", "fila"].includes(id) ? `Dispositivo ${disco.nome}. `
                : ["rede", "erros", "descartes"].includes(id) ? `Interface ${rede.nome}. `
                : id === "cpu-logica" ? `CPU lógica ${selecao.nucleo}. ` : "";
            elemento.setAttribute("aria-label", `${elemento.textContent}. ${origem}Últimos ${selecao.minutos} minutos.`);
            graficos.push(new Chart(elemento, {
                type: "line",
                data: { labels: historico.rotulos, datasets },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false,
                    locale: "pt-BR", interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 12, boxHeight: 2, color: "#777278", font: { family: "Poppins", size: 10 } } },
                        tooltip: { callbacks: { label: (contexto) => `${contexto.dataset.label}: ${numero(contexto.parsed.y)}${unidade}` } }
                    },
                    scales: {
                        x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: function (valor, indice, marcas) {
                            const intervalo = Math.max(1, Math.ceil((marcas.length - 1) / 4));
                            return indice % intervalo === 0 || indice === marcas.length - 1 ? this.getLabelForValue(valor) : null;
                        }, color: "#777278", font: { family: "Poppins", size: 10 } } },
                        y: { min: 0, ...(unidade === "%" ? { max: maximo } : { suggestedMax: maximo }), border: { display: false }, grid: { color: "#e8e8e8" }, ticks: { maxTicksLimit: 3, color: "#777278", font: { family: "Poppins", size: 10 }, callback: (valor) => `${numero(valor)}${unidade}` } }
                    }
                }
            }));
        });
    }

    document.addEventListener("abrir-detalhes-servidor", (evento) => {
        const servidor = evento.detail;
        if (!monitoramentoMock.cenario(servidor.modelo)) return;
        botaoOrigem = document.activeElement;
        servidorAtual = servidor;
        selecao = { minutos: 30, nucleo: 3, disco: 0, rede: 0 };
        destruirGraficos();
        renderizarPainel(servidor, monitoramentoMock.cenario(servidor.modelo));
        dialogo.showModal();
        dialogo.scrollTop = 0;
        criarGraficos();
    });

    conteudo.addEventListener("change", (evento) => {
        const campos = { "detalhes-periodo": "minutos", "detalhes-cpu-logica": "nucleo", "detalhes-disco": "disco", "detalhes-interface": "rede" };
        const campo = campos[evento.target.id];
        if (!campo) return;
        selecao[campo] = Number(evento.target.value);
        criarGraficos();
    });

    dialogo.addEventListener("click", (evento) => {
        if (evento.target !== dialogo) return;
        const limites = dialogo.getBoundingClientRect();
        if (evento.clientX < limites.left || evento.clientX > limites.right || evento.clientY < limites.top || evento.clientY > limites.bottom) dialogo.close();
    });
    dialogo.addEventListener("close", () => {
        destruirGraficos();
        if (botaoOrigem?.isConnected) botaoOrigem.focus({ preventScroll: true });
    });
})();
