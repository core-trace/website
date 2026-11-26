(() => {
    // riscos e perguntasProntas ainda sao mock, falta o assistente e a previsao pra
    // calcular isso de verdade. o resto (estado, cobertura, indicadores, perfis,
    // resumo, acoes, evolucao) ja e tudo real, vem da rota /geral/resumo
    const dado = geralMock;

    // ultimo resumo guardado, pra trocar o filtro de perfil sem precisar buscar tudo
    // de novo no servidor
    let ultimoResumo = null;
    let graficoEvolucao = null;

    const texto = (id, valor) => { document.getElementById(id).textContent = valor; };

    function filtrarEvolucaoPorPerfil(evolucao, nomePerfil) {
        if (!evolucao || !Array.isArray(evolucao.porServidor) || !nomePerfil) return evolucao;
        return {
            ...evolucao,
            porServidor: evolucao.porServidor.filter(servidor => servidor.nome_perfil === nomePerfil)
        };
    }

    function contarServidoresPorBalde(evolucao, estado) {
        const horarios = evolucao?.horarios ?? [];
        if (Array.isArray(evolucao?.porServidor)) {
            return horarios.map((_, indice) => evolucao.porServidor.filter(servidor => servidor.estados[indice] === estado).length);
        }
        const chave = estado === "critico" ? "criticos" : "atencao";
        return evolucao?.[chave] ?? horarios.map(() => 0);
    }

    function mostrarCabecalho(estado) {
        document.getElementById("estado-titulo").textContent = estado.titulo;
    }

    function mostrarIndicadores(cobertura, indicadores) {
        texto("indicador-cobertura", `${cobertura.avaliados}/${cobertura.esperados}`);
        texto("indicador-criticos", indicadores.criticos);
        texto("indicador-criticos-legenda", indicadores.criticosLegenda);
        texto("indicador-atencao", indicadores.atencao);
        texto("indicador-atencao-legenda", indicadores.atencaoLegenda);
        texto("indicador-sem-dados", indicadores.semDadosRecentes);
        texto("indicador-sem-dados-legenda", indicadores.semDadosLegenda);
    }

    function mostrarSinaisExternos(sinaisExternos) {
        const chip = document.getElementById("chip-proximo-evento");
        const proximoFeriado = sinaisExternos?.proximoFeriado;
        if (!proximoFeriado) {
            chip.hidden = true;
            return;
        }
        chip.hidden = false;
        chip.textContent = `Evento em ${proximoFeriado.diasRestantes} ${proximoFeriado.diasRestantes === 1 ? "dia" : "dias"}`;
        chip.title = `${proximoFeriado.nome} — fique de olho nos perfis de criticidade alta.`;
    }

    // recalcula tudo so pro perfil escolhido, usando o resumo que ja ta guardado,
    // sem bater no servidor de novo
    function filtrarPorPerfil(resumo, nomePerfil) {
        if (!nomePerfil) return resumo; // "Todos perfis": mostra o resumo inteiro

        const perfil = resumo.perfis.find(item => item.nome === nomePerfil);
        if (!perfil) return resumo; // perfil sem nenhum servidor nesse resumo - nao deveria acontecer

        const distribuicao = perfil.distribuicao;
        const avaliados = distribuicao.critico + distribuicao.atencao + distribuicao.normal;
        const esperados = avaliados + distribuicao.semDados;

        return {
            estado: resumo.estado,
            cobertura: { avaliados, esperados },
            indicadores: {
                criticos: distribuicao.critico, criticosLegenda: "",
                atencao: distribuicao.atencao, atencaoLegenda: "",
                semDadosRecentes: distribuicao.semDados, semDadosLegenda: ""
            },
            perfis: [perfil],
            // com um perfil so selecionado nao da pra comparar nada (resumo/acoes
            // comparam ENTRE perfis), entao fica null e renderizarResumo esconde essa
            // parte da tela
            resumo: null,
            acoes: null,
            riscos: (resumo.riscos ?? []).filter(risco => risco.nome_perfil === perfil.nome),
            sinaisExternos: resumo.sinaisExternos,
            evolucao: filtrarEvolucaoPorPerfil(resumo.evolucao, perfil.nome),
            evolucaoLegenda: perfil.evolucaoLegenda ?? resumo.evolucaoLegenda
        };
    }

    function alternarSecaoResumo(mostrar) {
        // hidden nao funciona aqui, o display:grid do css ganha. por isso uso
        // style.display direto
        document.querySelector(".geral-resumo-linha").style.display = mostrar ? "" : "none";
    }

    function renderizarResumo(resumo) {
        mostrarCabecalho(resumo.estado);
        mostrarIndicadores(resumo.cobertura, resumo.indicadores);
        mostrarPerfis(resumo.perfis, resumo.sinaisExternos);
        mostrarSinaisExternos(resumo.sinaisExternos);
        mostrarGraficoEvolucao(resumo);
        mostrarRiscos(resumo.riscos ?? []);

        alternarSecaoResumo(resumo.resumo !== null);
        if (resumo.resumo !== null) {
            mostrarResumo(resumo.resumo);
            mostrarAcoes(resumo.acoes);
        }
    }

    function configurarFiltroPerfil() {
        document.getElementById("filtro-perfil").addEventListener("change", function (evento) {
            if (ultimoResumo) renderizarResumo(filtrarPorPerfil(ultimoResumo, evento.target.value));
        });
    }

    // busca o resumo real, se der erro usa o mock pra tela nao ficar vazia
    async function carregarDadosReais() {
        texto("evolucao-legenda-texto", "Carregando evolução dos servidores…");
        try {
            const resposta = await fetch("/geral/resumo");
            if (!resposta.ok) throw new Error("Não foi possível carregar o resumo geral.");
            ultimoResumo = await resposta.json();
        } catch (erro) {
            console.error("Erro ao carregar o resumo geral, usando dados mocados:", erro.message);
            ultimoResumo = {
                estado: dado.estado, cobertura: dado.cobertura, indicadores: dado.indicadores, perfis: dado.perfis,
                resumo: dado.resumo, acoes: dado.acoes, riscos: dado.riscos,
                evolucao: dado.evolucao, evolucaoLegenda: dado.evolucaoLegenda
            };
        }
        const perfilEscolhido = document.getElementById("filtro-perfil").value;
        renderizarResumo(filtrarPorPerfil(ultimoResumo, perfilEscolhido));
    }

    function mostrarResumo(resumo) {
        texto("resumo-titulo", resumo.titulo);
        texto("resumo-motivo", resumo.motivo);
        texto("resumo-cobertura", resumo.cobertura);

        const comparacao = document.getElementById("resumo-comparacao");
        comparacao.replaceChildren(...resumo.comparacao.map(item => {
            const bloco = document.createElement("div");
            bloco.className = "geral-comparacao-item";
            bloco.innerHTML = `<strong>${item.perfil}</strong><span class="geral-comparacao-afetados">${item.afetados}</span><span>${item.duracao}</span>`;
            return bloco;
        }));
    }

    function mostrarAcoes(acoes) {
        const lista = document.getElementById("lista-acoes");
        lista.replaceChildren(...acoes.map((acao, indice) => {
            const item = document.createElement("li");
            item.innerHTML = `
                <span class="geral-acao-numero">${indice + 1}</span>
                <span class="geral-acao-texto">
                    <strong>${acao.titulo}</strong>
                    <span>${acao.destino}</span>
                </span>`;
            return item;
        }));
    }

    function barraSegmento(classe, quantidade, total) {
        if (quantidade === 0) return "";
        const largura = (quantidade / total * 100).toFixed(2);
        return `<span class="geral-barra-segmento ${classe}" style="width:${largura}%"></span>`;
    }

    // leva pra Servidores ja filtrado  mesmo padrao usado pelos KPIs e pelos riscos
    function abrirServidoresFiltrado(parametros) {
        window.location.href = `servidores.html?${new URLSearchParams(parametros).toString()}`;
    }

    function mostrarPerfis(perfis, sinaisExternos) {
        const lista = document.getElementById("lista-perfis");
        lista.replaceChildren(...perfis.map(perfil => {
            const linha = document.createElement("div");
            linha.className = "geral-linha-perfil";
            linha.tabIndex = 0;
            linha.setAttribute("role", "button");
            linha.setAttribute("aria-label", `Ver servidores do perfil ${perfil.nome} em Servidores`);
            const irParaServidores = () => abrirServidoresFiltrado({ perfil: perfil.nome });
            linha.addEventListener("click", irParaServidores);
            linha.addEventListener("keydown", evento => {
                if (evento.key === "Enter" || evento.key === " ") {
                    evento.preventDefault();
                    irParaServidores();
                }
            });
            const total = perfil.distribuicao.critico + perfil.distribuicao.atencao
                + perfil.distribuicao.normal + perfil.distribuicao.semDados;
            const mostraSinalPagamento = perfil.nome === "Financeiro" && sinaisExternos?.statusPagamento;
            linha.innerHTML = `
                <span class="geral-perfil-nome">
                    <strong>${perfil.nome}${mostraSinalPagamento ? '<span class="geral-sinal-pagamento" tabindex="0"></span>' : ""}</strong>
                    <span>${perfil.sinal}</span>
                </span>
                <span class="geral-perfil-afetados">
                    <strong>${perfil.afetados}</strong>
                    <span>${perfil.proporcao}</span>
                </span>
                <span class="geral-perfil-distribuicao">
                    <span class="geral-barra">
                        ${barraSegmento("geral-barra-critico", perfil.distribuicao.critico, total)}
                        ${barraSegmento("geral-barra-atencao", perfil.distribuicao.atencao, total)}
                        ${barraSegmento("geral-barra-normal", perfil.distribuicao.normal, total)}
                        ${barraSegmento("geral-barra-sem-dados", perfil.distribuicao.semDados, total)}
                    </span>
                    <span class="geral-perfil-descricao">${perfil.descricao}</span>
                </span>
                <span class="geral-perfil-duracao">
                    <strong>${perfil.duracao}</strong>
                    <span>${perfil.referencia}</span>
                </span>
                <span class="geral-perfil-chev">
                    <img src="../assets/icons/icone-chevron.svg" alt="" width="16" height="16">
                </span>`;

            if (mostraSinalPagamento) {
                const sinal = linha.querySelector(".geral-sinal-pagamento");
                const { operacional, descricao } = sinaisExternos.statusPagamento;
                sinal.classList.toggle("geral-sinal-pagamento-incidente", !operacional);
                sinal.title = descricao;
            }

            return linha;
        }));
    }

    function mostrarRiscos(riscos) {
        const lista = document.getElementById("lista-riscos");

        if (riscos.length === 0) {
            lista.innerHTML = `<p class="geral-sem-riscos">Nenhum risco em acompanhamento no momento.</p>`;
            return;
        }

       
        lista.replaceChildren(...riscos.map(risco => {
            const item = document.createElement("div");
            item.className = "geral-risco";
            item.innerHTML = `
                <span class="geral-risco-corpo">
                    <span class="geral-risco-tag geral-risco-tag-${risco.tom}">${risco.tag}</span>
                    <strong>${risco.titulo}</strong>
                    <span>${risco.detalhe}</span>
                    <span class="geral-risco-acao"><strong>Ação recomendada:</strong> ${risco.acao}</span>
                </span>`;
            return item;
        }));
    }

    function mostrarGraficoEvolucao(resumo) {
        const evolucao = resumo?.evolucao ?? { horarios: [], porServidor: [] };
        const horarios = evolucao.horarios ?? [];
        texto("evolucao-legenda-texto", resumo?.evolucaoLegenda ?? "Nenhuma variação registrada ainda.");
        texto("evolucao-periodo", horarios.length > 0
            ? `Histórico · ${horarios[0]}–${horarios[horarios.length - 1]} BRT · críticos e em atenção`
            : "Histórico indisponível · críticos e em atenção");

        if (!graficoEvolucao) {
            graficoEvolucao = new Chart(document.getElementById("grafico-evolucao"), {
                type: "bar",
                data: {
                    labels: [],
                    datasets: [
                        { label: "Em atenção", data: [], backgroundColor: "#a96808", stack: "total" },
                        { label: "Críticos", data: [], backgroundColor: "#cc0301", stack: "total" }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        }

        graficoEvolucao.data.labels = horarios;
        graficoEvolucao.data.datasets[0].data = contarServidoresPorBalde(evolucao, "atencao");
        graficoEvolucao.data.datasets[1].data = contarServidoresPorBalde(evolucao, "critico");
        graficoEvolucao.update();
    }

    // leva pra tela do carlos com filtro
    function configurarNavegacao() {
        document.getElementById("kpi-cobertura").addEventListener("click", () => {
            window.location.href = "DashboardPerfil.html";
        });
        document.getElementById("kpi-criticos").addEventListener("click", () => {
            abrirServidoresFiltrado({ indicador: "critico" });
        });
        document.getElementById("kpi-atencao").addEventListener("click", () => {
            abrirServidoresFiltrado({ indicador: "atencao" });
        });
        document.getElementById("kpi-sem-dados").addEventListener("click", () => {
            abrirServidoresFiltrado({ indicador: "sem-dados" });
        });
        document.getElementById("botao-historico-alertas").addEventListener("click", () => {
            const perfil = document.getElementById("filtro-perfil").value;
            window.location.href = perfil
                ? `alertas.html?${new URLSearchParams({ perfil }).toString()}`
                : "alertas.html";
        });
    }

    function configurarExportar() {
        document.getElementById("botao-exportar").addEventListener("click", () => {
            // baixa o pdf que ja ta pronto no s3, nao gera nada na hora do clique
            window.location.href = "/geral/relatorio";
        });
    }

    function configurarAssistente() {
        const botao = document.getElementById("botao-assistente");
        const painel = document.getElementById("painel-assistente");
        const resposta = document.getElementById("assistente-resposta");
        const lista = document.getElementById("assistente-perguntas");

        function mostrarResposta(texto) {
            resposta.textContent = texto;
            resposta.hidden = false;
            painel.hidden = false;
            botao.setAttribute("aria-expanded", "true");
        }

        // pergunta pro gemini de verdade, com o texto fixo do mock so se der erro
        async function responderPerguntaReal(perguntaTexto, respostaFallback) {
            mostrarResposta("Pensando...");
            try {
                const resposta = await fetch("/api/assistente/responder", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pergunta: perguntaTexto })
                });
                const dado = await resposta.json();
                mostrarResposta(dado.resposta ?? respostaFallback);
            } catch {
                mostrarResposta(respostaFallback);
            }
        }

        lista.replaceChildren(...dado.perguntasProntas.map(item => {
            const li = document.createElement("li");
            const perguntaBotao = document.createElement("button");
            perguntaBotao.type = "button";
            perguntaBotao.textContent = item.pergunta;
            perguntaBotao.addEventListener("click", () => responderPerguntaReal(item.pergunta, item.resposta));
            li.append(perguntaBotao);
            return li;
        }));

        botao.addEventListener("click", () => {
            const aberto = painel.hidden;
            painel.hidden = !aberto;
            botao.setAttribute("aria-expanded", String(aberto));
        });

        document.getElementById("botao-pergunta-evolucao").addEventListener("click", () => {
            const pergunta = dado.perguntasProntas.find(item => item.pergunta === "O que mudou recentemente?");
            if (pergunta) responderPerguntaReal(pergunta.pergunta, pergunta.resposta);
        });
    }

    configurarFiltroPerfil();
    carregarDadosReais();
    configurarExportar();
    configurarAssistente();
    configurarNavegacao();
})();
