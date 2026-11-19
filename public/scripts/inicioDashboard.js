(() => {
    // Divisao temporaria e intencional: "estado", "cobertura", "indicadores", "perfis",
    // "resumo", "acoes", "evolucao" e "evolucaoLegenda" ja vem de dados reais (rota
    // /geral/resumo, ver src/routes/geralRoutes.js). Os demais campos (riscos e
    // perguntasProntas) continuam vindo do mock porque dependem de hipoteses ainda nao
    // implementadas (assistente, previsao de tendencia) - nao e uma lacuna esquecida.
    const dado = geralMock;

    // Guarda o ultimo resumo (real ou, se a rota falhar, mocado) para o filtro de
    // perfil conseguir recalcular a tela na hora, sem precisar buscar de novo no
    // servidor - afinal a rota /geral/resumo ja devolve a divisao por perfil pronta.
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

    // Recalcula cobertura/indicadores/perfis/evolucao olhando so pro perfil escolhido,
    // a partir do resumo que ja temos guardado - o filtro nao busca nada novo no
    // servidor, so reaproveita a divisao por perfil que a rota /geral/resumo ja manda pronta.
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
            // Com um unico perfil selecionado nao ha o que comparar - resumo/acoes sao
            // calculados priorizando ENTRE perfis, e mostrar o resultado global (de um
            // perfil que pode nem ser o filtrado) seria informacao errada, nao so
            // incompleta. Null aqui sinaliza pra renderizarResumo esconder a secao em
            // vez de reaproveitar o resumo.resumo/resumo.acoes do agregado.
            resumo: null,
            acoes: null,
            sinaisExternos: resumo.sinaisExternos,
            evolucao: filtrarEvolucaoPorPerfil(resumo.evolucao, perfil.nome),
            evolucaoLegenda: perfil.evolucaoLegenda ?? resumo.evolucaoLegenda
        };
    }

    function alternarSecaoResumo(mostrar) {
        // Nao da pra usar o atributo "hidden" aqui: .geral-resumo-linha ja tem
        // "display: grid" proprio (geralDashboard.css), que empata em especificidade
        // com a regra nativa [hidden]{display:none} do navegador - e CSS de autor
        // sempre vence CSS do agente do usuario, entao "hidden" ficaria sem efeito
        // visual nenhum (confirmado testando ao vivo). style.display direto resolve.
        document.querySelector(".geral-resumo-linha").style.display = mostrar ? "" : "none";
    }

    function renderizarResumo(resumo) {
        mostrarCabecalho(resumo.estado);
        mostrarIndicadores(resumo.cobertura, resumo.indicadores);
        mostrarPerfis(resumo.perfis, resumo.sinaisExternos);
        mostrarSinaisExternos(resumo.sinaisExternos);
        mostrarGraficoEvolucao(resumo);

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

    // Busca os dados reais na rota /geral/resumo. Se a rota falhar por qualquer motivo,
    // cai de volta no mock desses mesmos campos, so para a tela nunca ficar vazia.
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
                resumo: dado.resumo, acoes: dado.acoes,
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

    function mostrarPerfis(perfis, sinaisExternos) {
        const lista = document.getElementById("lista-perfis");
        lista.replaceChildren(...perfis.map(perfil => {
            const linha = document.createElement("div");
            linha.className = "geral-linha-perfil";
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

    function mostrarRiscos() {
        const lista = document.getElementById("lista-riscos");
        lista.replaceChildren(...dado.riscos.map(risco => {
            const item = document.createElement("div");
            item.className = "geral-risco";
            item.innerHTML = `
                <span class="geral-risco-corpo">
                    <span class="geral-risco-tag geral-risco-tag-${risco.tom}">${risco.tag}</span>
                    <strong>${risco.titulo}</strong>
                    <span>${risco.detalhe}</span>
                    <span class="geral-risco-acao"><strong>Ação recomendada:</strong> ${risco.acao}</span>
                </span>
                <img src="../assets/icons/icone-chevron.svg" alt="" width="16" height="16">`;
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

    function configurarExportar() {
        document.getElementById("botao-exportar").addEventListener("click", () => {
            alert("Exportar relatório ainda não está implementado — isso é só o layout.");
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

        lista.replaceChildren(...dado.perguntasProntas.map(item => {
            const li = document.createElement("li");
            const perguntaBotao = document.createElement("button");
            perguntaBotao.type = "button";
            perguntaBotao.textContent = item.pergunta;
            perguntaBotao.addEventListener("click", () => mostrarResposta(item.resposta));
            li.append(perguntaBotao);
            return li;
        }));

        botao.addEventListener("click", () => {
            const aberto = painel.hidden;
            painel.hidden = !aberto;
            botao.setAttribute("aria-expanded", String(aberto));
        });

        document.getElementById("botao-pergunta-evolucao").addEventListener("click", () => {
            const pergunta = dado.perguntasProntas.find(item => item.pergunta === "O que mudou às 20h05?");
            if (pergunta) mostrarResposta(pergunta.resposta);
        });
    }

    configurarFiltroPerfil();
    carregarDadosReais();
    mostrarRiscos();
    configurarExportar();
    configurarAssistente();
})();
