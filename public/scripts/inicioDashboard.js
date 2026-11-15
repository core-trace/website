// Tela Geral. Por enquanto lê o dado de geralMock.js (cenário da Black Friday).
// Quando a leitura da Gold estiver pronta, isso troca pra um fetch de verdade.
(() => {
    const dado = geralMock;

    const texto = (id, valor) => { document.getElementById(id).textContent = valor; };

    function mostrarCabecalho() {
        document.getElementById("estado-titulo").textContent = dado.estado.titulo;
    }

    function mostrarIndicadores() {
        texto("indicador-cobertura", `${dado.cobertura.avaliados}/${dado.cobertura.esperados}`);
        texto("indicador-criticos", dado.indicadores.criticos);
        texto("indicador-criticos-legenda", dado.indicadores.criticosLegenda);
        texto("indicador-atencao", dado.indicadores.atencao);
        texto("indicador-atencao-legenda", dado.indicadores.atencaoLegenda);
        texto("indicador-sem-dados", dado.indicadores.semDadosRecentes);
        texto("indicador-sem-dados-legenda", dado.indicadores.semDadosLegenda);
    }

    function mostrarResumo() {
        texto("resumo-titulo", dado.resumo.titulo);
        texto("resumo-motivo", dado.resumo.motivo);
        texto("resumo-cobertura", dado.resumo.cobertura);

        const comparacao = document.getElementById("resumo-comparacao");
        comparacao.replaceChildren(...dado.resumo.comparacao.map(item => {
            const bloco = document.createElement("div");
            bloco.className = "geral-comparacao-item";
            bloco.innerHTML = `<strong>${item.perfil}</strong><span class="geral-comparacao-afetados">${item.afetados}</span><span>${item.duracao}</span>`;
            return bloco;
        }));
    }

    function mostrarAcoes() {
        const lista = document.getElementById("lista-acoes");
        lista.replaceChildren(...dado.acoes.map((acao, indice) => {
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

    function mostrarPerfis() {
        const lista = document.getElementById("lista-perfis");
        lista.replaceChildren(...dado.perfis.map(perfil => {
            const linha = document.createElement("div");
            linha.className = "geral-linha-perfil";
            const total = perfil.distribuicao.critico + perfil.distribuicao.atencao
                + perfil.distribuicao.normal + perfil.distribuicao.semDados;
            linha.innerHTML = `
                <span class="geral-perfil-nome">
                    <strong>${perfil.nome}</strong>
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

    function mostrarGraficoEvolucao() {
        texto("evolucao-legenda-texto", dado.evolucaoLegenda);
        const canvas = document.getElementById("grafico-evolucao");
        new Chart(canvas, {
            type: "bar",
            data: {
                labels: dado.evolucao.horarios,
                datasets: [
                    { label: "Em atenção", data: dado.evolucao.atencao, backgroundColor: "#a96808", stack: "total" },
                    { label: "Críticos", data: dado.evolucao.criticos, backgroundColor: "#cc0301", stack: "total" }
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

    function configurarExportar() {
        document.getElementById("botao-exportar").addEventListener("click", () => {
            // Exportação de verdade ainda não existe (hipótese B). Por enquanto só avisa.
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

    mostrarCabecalho();
    mostrarIndicadores();
    mostrarResumo();
    mostrarAcoes();
    mostrarPerfis();
    mostrarRiscos();
    mostrarGraficoEvolucao();
    configurarExportar();
    configurarAssistente();
})();
