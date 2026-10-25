const acessoPerfis = {
    carregar() {
        const nivel = Number(sessionStorage.ID_NIVEL_ACESSO);
        const administrador = nivel === 1 || nivel === 2;
        return { criar: administrador, editar: administrador, limites: administrador || nivel === 3 };
    }
};

(() => {
    let carregamentoWizard;
    let botaoOrigem;

    function configurarWizard(dialogo) {
        const formulario = dialogo.querySelector("form");
        const nome = formulario.elements.nome;
        const descricao = formulario.elements.descricao;
        const contador = dialogo.querySelector("#perfil-contador");
        const titulo = dialogo.querySelector("#wizard-titulo");
        const introducao = dialogo.querySelector("#wizard-descricao");
        const conteudo = dialogo.querySelector(".wizard-conteudo");
        const proximo = dialogo.querySelector(".wizard-proximo");
        const recomendar = dialogo.querySelector(".wizard-recomendar");
        const metricas = dialogo.querySelector(".wizard-metricas");
        const lista = dialogo.querySelector(".wizard-metricas-lista");
        const resumo = dialogo.querySelector(".wizard-metricas-resumo");
        const carregando = dialogo.querySelector(".wizard-metricas-carregando");
        const erro = dialogo.querySelector(".wizard-metricas-erro");
        const vazio = dialogo.querySelector(".wizard-metricas-vazio");
        const monitorarDocker = formulario.elements.monitorarDocker;
        const statusDocker = dialogo.querySelector(".wizard-docker-status");
        const listaAlertas = dialogo.querySelector(".wizard-alertas-lista");
        const linhasAlertas = new Map();
        let categoriasMetricas = [];
        let catalogoOriginal = [];
        let etapa = 1;
        let catalogoCarregado = false;
        let buscandoMetricas = false;
        let salvando = false;
        let idPerfilCriado = null;
        let idPerfilEdicao = null;
        let metricasSalvas = [];
        let somenteLimites = false;
        const conclusao = dialogo.querySelector(".wizard-finalizado");
        const feedbackCadastro = dialogo.querySelector(".wizard-cadastro-feedback");

        const icones = {
            cpu: "cpu.svg", ram: "ram.svg", disco: "disco.svg", swap: "swap.svg",
            carga: "carga.svg", rede: "carga.svg", outros: "servidor.svg"
        };

        function atualizarProximo() {
            proximo.disabled = salvando || (etapa === 2
                && (!catalogoCarregado || !lista.querySelector("input:checked")));
            dialogo.querySelector(".wizard-proximo-texto").textContent = salvando ? "Salvando..."
                : idPerfilEdicao && etapa === 4 ? "Salvar alterações"
                : etapa === 4 ? "Concluir configuração" : "Próximo";
        }

        function atualizarDocker() {
            const ativo = monitorarDocker.checked;
            statusDocker.classList.toggle("ativo", ativo);
            statusDocker.querySelector(".wizard-docker-status-titulo").textContent = ativo
                ? "Monitoramento ativado" : "Monitoramento desativado";
            statusDocker.querySelector(".wizard-docker-status-descricao").textContent = ativo
                ? "Ao concluir o cadastro, o agente identificará os contêineres Docker automaticamente."
                : "Ative a opção acima para monitorar contêineres.";
        }

        function atualizarContadores() {
            let total = 0;
            let categoriasSelecionadas = 0;
            lista.querySelectorAll(".wizard-metrica-categoria").forEach((categoria) => {
                const selecionadas = categoria.querySelectorAll("input:checked").length;
                const quantidade = categoria.querySelectorAll("input").length;
                const contagem = categoria.querySelector(".wizard-metrica-contagem");
                contagem.textContent = `${selecionadas}/${quantidade}`;
                contagem.setAttribute("aria-label", `${selecionadas} de ${quantidade} métricas selecionadas`);
                total += selecionadas;
                if (selecionadas > 0) categoriasSelecionadas++;
            });

            resumo.textContent = total === 0
                ? "Selecione ao menos uma métrica para este perfil."
                : `${total} ${total === 1 ? "métrica selecionada" : "métricas selecionadas"} em ${categoriasSelecionadas} ${categoriasSelecionadas === 1 ? "categoria" : "categorias"}`;
            resumo.classList.toggle("sem-selecao", total === 0);
            atualizarProximo();
        }

        function criarCategoria(categoria, indice) {
            const card = document.createElement("section");
            card.className = "wizard-metrica-categoria";
            card.setAttribute("aria-labelledby", `metricas-categoria-${indice}`);
            const cabecalho = document.createElement("header");
            cabecalho.className = "wizard-metrica-cabecalho";
            const icone = document.createElement("img");
            icone.src = `../assets/icons/${icones[categoria.id] || icones.outros}`;
            icone.alt = "";
            icone.width = 30;
            icone.height = 30;
            const nomeCategoria = document.createElement("h3");
            nomeCategoria.id = `metricas-categoria-${indice}`;
            nomeCategoria.textContent = categoria.nome;
            const contagem = document.createElement("span");
            contagem.className = "wizard-metrica-contagem";
            cabecalho.append(icone, nomeCategoria, contagem);
            card.append(cabecalho);

            categoria.metricas.forEach((metrica) => {
                const label = document.createElement("label");
                label.className = "wizard-metrica-opcao";
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.name = "metricas";
                checkbox.value = metrica.id;
                checkbox.checked = metrica.essencial === true || metricasSalvas.some(function (salva) {
                    return salva.id === metrica.id;
                });
                checkbox.dataset.recomendada = String(metrica.recomendada === true);
                checkbox.dataset.essencial = String(metrica.essencial === true);
                checkbox.disabled = metrica.essencial === true;
                if (metrica.essencial) {
                    label.title = "Métricas essenciais ficam sempre selecionadas.";
                    label.tabIndex = 0;
                    label.setAttribute("aria-label", metrica.nome + ". Métrica essencial, sempre selecionada.");
                }
                const texto = document.createElement("span");
                texto.textContent = metrica.nome;
                label.append(checkbox, texto);
                card.append(label);
            });
            return card;
        }

        function validarLimites(linha) {
            const mensagem = linha.querySelector(".wizard-alerta-erro");
            const segundoOperador = linha.querySelector('[data-segundo-operador]');
            const faixaAtiva = segundoOperador && !segundoOperador.disabled;
            const campos = [...linha.querySelectorAll('input[type="number"]')];
            campos.forEach(campo => campo.setCustomValidity(""));
            const erros = [];
            for (const sufixo of faixaAtiva ? ["", "-segundo"] : [""]) {
                const operador = sufixo ? segundoOperador.value : linha.querySelector("select").value;
                const atencao = linha.querySelector(`[data-limite="atencao${sufixo}"]`);
                const critico = linha.querySelector(`[data-limite="critico${sufixo}"]`);
                const faixa = sufixo ? "Segunda faixa" : "Primeira faixa";
                let erro = "";
                if (sufixo) {
                    const direcao = operador.startsWith("<") ? "inferior" : "superior";
                    for (const [campo, nome] of [[atencao, "de atenção"], [critico, "crítico"]]) {
                        const rotulo = `Limite ${nome} ${direcao}`;
                        campo.closest('.wizard-alerta-segundo').querySelector('span').textContent = rotulo;
                        campo.setAttribute('aria-label', `${rotulo}: ${linha.querySelector('th').textContent}`);
                    }
                }
                if (!atencao.validity.valid || !critico.validity.valid) {
                    erro = atencao.max === "100" ? "Informe limites entre 0 e 100%." : "Informe limites numéricos válidos.";
                } else if (faixaAtiva && (atencao.value === "" || critico.value === "")) {
                    erro = "Preencha os limites de atenção e crítico desta faixa.";
                } else if ((atencao.value === "") !== (critico.value === "")) {
                    erro = "Preencha os dois limites ou deixe ambos vazios.";
                } else if (atencao.value !== "" && critico.value !== "") {
                    const crescente = operador.startsWith(">");
                    const valido = crescente ? critico.valueAsNumber > atencao.valueAsNumber
                        : critico.valueAsNumber < atencao.valueAsNumber;
                    if (!valido) erro = `Com o operador ${operador}, o limite crítico deve ser ${crescente ? "maior" : "menor"} que o de atenção. Os valores devem ser diferentes.`;
                }
                if (erro) {
                    const texto = `${faixa}: ${erro}`;
                    critico.setCustomValidity(texto);
                    erros.push(texto);
                }
            }
            campos.forEach(campo => campo.setAttribute("aria-invalid", String(!campo.disabled && !campo.validity.valid)));
            mensagem.textContent = erros.join(" ");
            mensagem.hidden = !erros.length;
        }

        function criarLinhaAlerta(metrica) {
            const linha = document.createElement("tr");
            const identificador = `alerta-${metrica.id}`;
            const nomeMetrica = document.createElement("th");
            nomeMetrica.scope = "row";
            nomeMetrica.textContent = metrica.nome;
            linha.append(nomeMetrica);
            const celulaOperador = document.createElement("td");
            celulaOperador.dataset.rotulo = "Operador";
            const operador = document.createElement("select");
            operador.name = `alertas[${metrica.id}][operador]`;
            operador.setAttribute("aria-label", `Operador de ${metrica.nome}`);
            [[">", "Maior que"], [">=", "Maior ou igual a"], ["<", "Menor que"], ["<=", "Menor ou igual a"]]
                .forEach(([valor, descricao]) => {
                    const opcao = document.createElement("option");
                    opcao.value = valor;
                    opcao.textContent = valor;
                    opcao.setAttribute("aria-label", descricao);
                    operador.append(opcao);
                });
            celulaOperador.append(operador);
            linha.append(celulaOperador);

            ["atencao", "critico"].forEach((nivel) => {
                const rotulo = nivel === "atencao" ? "Atenção" : "Crítico";
                const celula = document.createElement("td");
                celula.dataset.rotulo = rotulo;
                const campo = document.createElement("div");
                campo.className = `wizard-alerta-limite wizard-alerta-${nivel}`;
                const icone = document.createElement("img");
                icone.src = `../assets/icons/alerta_${nivel === "atencao" ? "amarelo" : "vermelho"}.svg`;
                icone.alt = "";
                icone.width = 13;
                icone.height = 12;
                const input = document.createElement("input");
                input.type = "number";
                input.step = "any";
                input.name = `alertas[${metrica.id}][${nivel}]`;
                input.dataset.limite = nivel;
                input.setAttribute("aria-label", `${rotulo}: ${metrica.nome}${metrica.unidade ? ` (${metrica.unidade})` : ""}`);
                input.setAttribute("aria-describedby", `${identificador}-erro`);
                input.placeholder = "—";
                if (metrica.unidade === "%") {
                    input.min = "0";
                    input.max = "100";
                    input.value = nivel === "atencao" ? "70" : "90";
                }
                const unidade = document.createElement("span");
                unidade.className = "wizard-alerta-unidade";
                unidade.textContent = metrica.unidade || "—";
                unidade.setAttribute("aria-hidden", "true");
                campo.append(icone, input, unidade);
                celula.append(campo);
                if (nivel === "critico") {
                    const erroLimite = document.createElement("p");
                    erroLimite.id = `${identificador}-erro`;
                    erroLimite.className = "wizard-alerta-erro";
                    erroLimite.setAttribute("aria-live", "polite");
                    erroLimite.hidden = true;
                    celula.append(erroLimite);
                }
                linha.append(celula);
            });
            const salva = metricasSalvas.find(function (item) {
                return item.id === metrica.id;
            });
            if (salva) {
                operador.value = salva.operador;
                linha.querySelector('[data-limite="atencao"]').value = salva.atencao === null ? "" : salva.atencao;
                linha.querySelector('[data-limite="critico"]').value = salva.critico === null ? "" : salva.critico;
            }
            const adicionarFaixa = document.createElement("button");
            adicionarFaixa.type = "button";
            adicionarFaixa.className = "wizard-alerta-adicionar-faixa";
            adicionarFaixa.textContent = "+ Segundo operador";
            adicionarFaixa.setAttribute("aria-label", `Adicionar segundo operador para ${metrica.nome}`);
            adicionarFaixa.setAttribute("aria-expanded", "false");
            const grupoOperador = document.createElement("div");
            grupoOperador.className = "wizard-alerta-segundo";
            grupoOperador.id = `${identificador}-faixa`;
            grupoOperador.hidden = true;
            adicionarFaixa.setAttribute("aria-controls", grupoOperador.id);
            const conjuncao = document.createElement("span");
            conjuncao.textContent = "ou";
            const segundoOperador = operador.cloneNode(true);
            segundoOperador.name = `alertas[${metrica.id}][segundoOperador]`;
            segundoOperador.dataset.segundoOperador = "true";
            segundoOperador.setAttribute("aria-label", `Segundo operador de ${metrica.nome}`);
            segundoOperador.disabled = true;
            grupoOperador.append(conjuncao, segundoOperador);
            celulaOperador.append(grupoOperador, adicionarFaixa);
            const segundosCampos = ["atencao", "critico"].map(nivel => {
                const primeiro = linha.querySelector(`[data-limite="${nivel}"]`);
                const grupo = document.createElement("div");
                grupo.className = "wizard-alerta-segundo";
                grupo.hidden = true;
                const rotulo = document.createElement("span");
                rotulo.textContent = "Segundo limite";
                const campo = primeiro.parentElement.cloneNode(true);
                const segundo = campo.querySelector("input");
                segundo.name = `alertas[${metrica.id}][${nivel}Segundo]`;
                segundo.dataset.limite = `${nivel}-segundo`;
                segundo.setAttribute("aria-label", `Segundo limite de ${nivel === "atencao" ? "atenção" : "crítico"}: ${metrica.nome}`);
                segundo.value = "";
                segundo.disabled = true;
                grupo.append(rotulo, campo);
                primeiro.parentElement.after(grupo);
                return grupo;
            });
            adicionarFaixa.addEventListener("click", () => {
                const ativar = segundoOperador.disabled;
                if (ativar) segundoOperador.value = operador.value.startsWith(">") ? "<=" : ">=";
                segundoOperador.disabled = !ativar;
                grupoOperador.hidden = !ativar;
                segundosCampos.forEach(grupo => {
                    grupo.hidden = !ativar;
                    grupo.querySelector("input").disabled = !ativar;
                });
                adicionarFaixa.textContent = ativar ? "Remover faixa" : "+ Segundo operador";
                adicionarFaixa.setAttribute("aria-expanded", String(ativar));
                adicionarFaixa.setAttribute("aria-label", `${ativar ? "Remover faixa" : "Adicionar segundo operador"} de ${metrica.nome}`);
                validarLimites(linha);
                if (ativar) segundoOperador.focus();
            });
            if (salva?.operador2) {
                adicionarFaixa.click();
                segundoOperador.value = salva.operador2;
                linha.querySelector('[data-limite="atencao-segundo"]').value = salva.atencao2 ?? "";
                linha.querySelector('[data-limite="critico-segundo"]').value = salva.critico2 ?? "";
                validarLimites(linha);
            }
            linha.addEventListener("input", () => validarLimites(linha));
            linha.addEventListener("change", () => validarLimites(linha));
            return linha;
        }

        function atualizarAlertas() {
            const selecionadas = new Set([...lista.querySelectorAll("input:checked")].map(input => input.value));
            const grupos = [];
            categoriasMetricas.forEach((categoria) => {
                const metricasSelecionadas = categoria.metricas.filter(metrica => selecionadas.has(String(metrica.id)));
                if (!metricasSelecionadas.length) return;
                const grupo = document.createElement("div");
                grupo.className = "wizard-alertas-categoria";
                const tabela = document.createElement("table");
                tabela.setAttribute("aria-label", `Limites de alerta: ${categoria.nome}`);
                const cabecalho = tabela.createTHead().insertRow();
                [categoria.nome, "Operador", "Atenção", "Crítico"].forEach((texto, indice) => {
                    const coluna = document.createElement("th");
                    coluna.scope = "col";
                    const rotulo = document.createElement("span");
                    rotulo.textContent = texto;
                    if (indice !== 1) {
                        const icone = document.createElement("img");
                        icone.alt = "";
                        icone.src = `../assets/icons/${indice === 0 ? (icones[categoria.id] || icones.outros)
                            : indice === 2 ? "alerta_amarelo.svg" : "alerta_vermelho.svg"}`;
                        if (indice === 0) coluna.append(icone, rotulo);
                        else coluna.append(rotulo, icone);
                    } else coluna.append(rotulo);
                    cabecalho.append(coluna);
                });
                const corpo = tabela.createTBody();
                metricasSelecionadas.forEach((metrica) => {
                    const id = String(metrica.id);
                    if (!linhasAlertas.has(id)) linhasAlertas.set(id, criarLinhaAlerta(metrica));
                    corpo.append(linhasAlertas.get(id));
                });
                grupo.append(tabela);
                grupos.push(grupo);
            });
            listaAlertas.replaceChildren(...grupos);
        }

        function renderizarMetricas(preservar = false) {
            const selecao = new Map([...lista.querySelectorAll('input')].map(input => [input.value, input.checked]));
            const anteriores = new Map(categoriasMetricas.flatMap(categoria => categoria.metricas).map(metrica => [String(metrica.id), metrica]));
            categoriasMetricas = metricasPlataforma.adaptar(catalogoOriginal, formulario.elements.sistemaOperacional.value);
            lista.replaceChildren(...categoriasMetricas.map(criarCategoria));
            if (preservar) lista.querySelectorAll('input').forEach(input => {
                if (selecao.has(input.value)) input.checked = input.disabled || selecao.get(input.value);
            });
            vazio.hidden = categoriasMetricas.length > 0;
            lista.hidden = categoriasMetricas.length === 0;
            resumo.hidden = categoriasMetricas.length === 0;
            recomendar.disabled = categoriasMetricas.length === 0;
            // Preserva os limites comuns; substituições podem mudar a unidade.
            const atuais = new Map(categoriasMetricas.flatMap(categoria => categoria.metricas).map(metrica => [String(metrica.id), metrica]));
            for (const id of linhasAlertas.keys()) {
                const anterior = anteriores.get(id), atual = atuais.get(id);
                if (!atual || anterior?.nome !== atual.nome || anterior?.unidade !== atual.unidade) linhasAlertas.delete(id);
            }
            listaAlertas.replaceChildren();
            atualizarContadores();
            atualizarProximo();
        }

        async function carregarMetricas() {
            if (catalogoCarregado || buscandoMetricas) return;
            buscandoMetricas = true;
            metricas.setAttribute("aria-busy", "true");
            carregando.hidden = false;
            erro.hidden = true;
            vazio.hidden = true;
            lista.hidden = true;
            resumo.hidden = true;
            recomendar.disabled = true;

            try {
                const resposta = await fetch("/servidor/metricas");
                if (!resposta.ok) throw new Error("Falha ao consultar métricas.");
                const dados = await resposta.json();
                if (!Array.isArray(dados.categorias)
                    || !dados.categorias.every((categoria) => Array.isArray(categoria.metricas))) {
                    throw new Error("Catálogo de métricas inválido.");
                }

                catalogoOriginal = dados.categorias;
                renderizarMetricas();
                catalogoCarregado = true;
            } catch (falha) {
                erro.hidden = false;
            } finally {
                carregando.hidden = true;
                metricas.setAttribute("aria-busy", "false");
                buscandoMetricas = false;
                atualizarProximo();
            }
        }

        function mostrarEtapa(numero) {
            if (somenteLimites && numero !== 4) return;
            etapa = numero;
            dialogo.dataset.etapa = numero;
            dialogo.style.setProperty("--wizard-etapas-concluidas", numero - 1);
            dialogo.querySelectorAll("[data-etapa]").forEach((painel) => {
                painel.hidden = Number(painel.dataset.etapa) !== numero;
            });
            dialogo.querySelectorAll(".wizard-etapas li").forEach((item, indice) => {
                item.classList.toggle("wizard-etapa-concluida", indice + 1 < numero);
                if (indice + 1 === numero) item.setAttribute("aria-current", "step");
                else item.removeAttribute("aria-current");
            });

            const nomesEtapas = ["Informações básicas", "Métricas", "Contêineres", "Alertas"];
            const descricoesEtapas = [
                "Comece dando um nome ao perfil do servidor e escolha o sistema operacional que será utilizado.",
                "Selecione as métricas que deseja monitorar. Você pode adicionar ou alterar métricas e alertas ao editar o perfil.",
                "Habilite o monitoramento de contêineres Docker e acompanhe CPU, RAM, I/O Disco, Rede e Status dos contêineres.",
                "Defina os limites de alerta para cada métrica. Você será notificado quando os valores excederem os limites configurados."
            ];
            const nomeEtapa = nomesEtapas[numero - 1];
            titulo.textContent = numero === 4 ? "Configuração de alertas e limites"
                : numero === 3 ? "Monitoramento de Contêineres Docker" : nomeEtapa;
            if (idPerfilEdicao && numero === 1) titulo.textContent = "Editar perfil de servidor";
            introducao.textContent = descricoesEtapas[numero - 1];
            dialogo.querySelector(".wizard-docker-introducao").hidden = numero !== 3;
            dialogo.querySelector(".wizard-topo").hidden = somenteLimites;
            dialogo.querySelector(".wizard-voltar").hidden = somenteLimites;
            dialogo.querySelector(".wizard-etapa-contagem").textContent = `Etapa ${numero} de 4`;
            dialogo.querySelector(".wizard-etapa-atual").textContent = nomeEtapa;
            recomendar.hidden = numero !== 2;

            atualizarProximo();
            conteudo.scrollTop = 0;
            titulo.focus({ preventScroll: true });
            if (numero === 2) carregarMetricas();
            if (numero === 4) atualizarAlertas();
        }

        function obterMetricasSelecionadas() {
            const metricasSelecionadas = [];
            lista.querySelectorAll("input:checked").forEach(function (input) {
                const linha = linhasAlertas.get(input.value);
                const atencao = linha.querySelector('[data-limite="atencao"]');
                const critico = linha.querySelector('[data-limite="critico"]');
                metricasSelecionadas.push({
                    id: Number(input.value),
                    operador: linha.querySelector("select").value,
                    atencao: atencao.value === "" ? null : atencao.valueAsNumber,
                    critico: critico.value === "" ? null : critico.valueAsNumber,
                    operador2: linha.querySelector('[data-segundo-operador]').disabled ? null
                        : linha.querySelector('[data-segundo-operador]').value,
                    atencao2: linha.querySelector('[data-segundo-operador]').disabled ? null
                        : linha.querySelector('[data-limite="atencao-segundo"]').valueAsNumber,
                    critico2: linha.querySelector('[data-segundo-operador]').disabled ? null
                        : linha.querySelector('[data-limite="critico-segundo"]').valueAsNumber
                });
            });
            // Componentes técnicos fora dos cards continuam vinculados e preservados.
            return somenteLimites ? metricasSalvas.map(salva =>
                metricasSelecionadas.find(metrica => metrica.id === salva.id) || salva) : metricasSelecionadas;
        }

        function mostrarConclusao(dados) {
            formulario.hidden = true;
            dialogo.querySelector(".wizard-topo").hidden = true;
            conclusao.hidden = false;
            dialogo.dataset.etapa = "finalizado";
            dialogo.setAttribute("aria-labelledby", "wizard-finalizado-titulo");
            dialogo.setAttribute("aria-describedby", "wizard-finalizado-descricao");
            dialogo.querySelector(".wizard-finalizado-nome").textContent = dados.nome;
            const sistema = dados.sistemaOperacional === "linux" ? "Linux" : "Windows";
            const total = dados.metricas.length;
            dialogo.querySelector(".wizard-finalizado-resumo").textContent = "Servidor " + sistema + " • "
                + total + (total === 1 ? " métrica monitorada" : " métricas monitoradas");
            dialogo.querySelector(".wizard-download-feedback").hidden = true;
            dialogo.querySelector(".wizard-baixar-agente").hidden = somenteLimites;
            dialogo.querySelector("#wizard-finalizado-titulo").textContent = idPerfilEdicao
                ? "Perfil atualizado com sucesso" : "Perfil criado com sucesso";
            dialogo.querySelector(".wizard-finalizado-status").textContent = idPerfilEdicao
                ? "Alterações salvas" : "Configuração concluída";
            conclusao.scrollTop = 0;
            dialogo.querySelector("#wizard-finalizado-titulo").focus();
        }

        function limparCadastro() {
            somenteLimites = false;
            idPerfilCriado = null;
            idPerfilEdicao = null;
            metricasSalvas = [];
            dialogo.classList.remove("wizard-editando");
            feedbackCadastro.hidden = true;
            formulario.reset();
            if (catalogoCarregado) renderizarMetricas();
            linhasAlertas.clear();
            contador.textContent = "0/500";
            lista.querySelectorAll("input").forEach(function (input) {
                input.checked = input.dataset.essencial === "true";
            });
            conclusao.hidden = true;
            formulario.hidden = false;
            dialogo.querySelector(".wizard-topo").hidden = false;
            dialogo.setAttribute("aria-labelledby", "wizard-titulo");
            dialogo.setAttribute("aria-describedby", "wizard-descricao");
            atualizarContadores();
            atualizarDocker();
            mostrarEtapa(1);
        }

        dialogo.querySelector(".wizard-baixar-agente").addEventListener("click", function () {
            baixarAgente(idPerfilCriado, this, dialogo.querySelector(".wizard-download-feedback"));
        });

        dialogo.querySelector(".wizard-ir-perfis").addEventListener("click", function () {
            window.location.href = "perfisServidor.html";
        });

        dialogo.abrirEdicao = async function (perfil, restrito) {
            limparCadastro();
            somenteLimites = restrito;
            idPerfilEdicao = perfil.id_perfil_servidor;
            metricasSalvas = perfil.metricas;
            dialogo.classList.add("wizard-editando");
            nome.value = perfil.nome;
            descricao.value = perfil.descricao || "";
            contador.textContent = descricao.value.length + "/500";
            formulario.elements.sistemaOperacional.value = perfil.sistema_operacional;
            await carregarMetricas();
            if (!catalogoCarregado) throw new Error("Não foi possível carregar as métricas. Tente novamente.");
            renderizarMetricas();
            monitorarDocker.checked = Boolean(Number(perfil.monitorar_docker));
            lista.querySelectorAll("input").forEach(function (input) {
                input.checked = (!somenteLimites && input.dataset.essencial === "true") || metricasSalvas.some(function (metrica) {
                    return metrica.id === Number(input.value);
                });
            });
            atualizarContadores();
            atualizarDocker();
            mostrarEtapa(somenteLimites ? 4 : 1);
        };

        function salvarPerfil() {
            if (salvando || idPerfilCriado !== null) return;
            const dados = {
                empresa: Number(sessionStorage.ID_EMPRESA),
                proprietario: Number(sessionStorage.ID_USUARIO),
                nome: nome.value.trim(),
                descricao: descricao.value.trim(),
                sistemaOperacional: formulario.elements.sistemaOperacional.value,
                monitorarDocker: monitorarDocker.checked,
                metricas: obterMetricasSelecionadas(),
                equipe: []
            };
            salvando = true;
            formulario.inert = true;
            formulario.setAttribute("aria-busy", "true");
            dialogo.querySelector(".wizard-fechar").disabled = true;
            feedbackCadastro.hidden = true;
            atualizarProximo();

            const url = idPerfilEdicao ? "/servidor/perfis/" + idPerfilEdicao : "/servidor/perfis";
            return fetch(url, {
                method: idPerfilEdicao ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dados)
            })
                .then(function (resposta) {
                    return resposta.json().then(function (resultado) {
                        if (!resposta.ok) throw new Error(resultado.mensagem);
                        return resultado;
                    });
                })
                .then(function (resultado) {
                    idPerfilCriado = resultado.id_perfil_servidor;
                    mostrarConclusao(dados);
                    document.dispatchEvent(new Event(idPerfilEdicao ? "perfil-servidor-atualizado" : "perfil-servidor-criado"));
                })
                .catch(function (erro) {
                    feedbackCadastro.textContent = erro.message || "Não foi possível salvar o perfil. Tente novamente.";
                    feedbackCadastro.hidden = false;
                })
                .finally(function () {
                    salvando = false;
                    formulario.inert = false;
                    formulario.removeAttribute("aria-busy");
                    dialogo.querySelector(".wizard-fechar").disabled = false;
                    atualizarProximo();
                });
        }

        dialogo.addEventListener("cancel", event => { if (salvando) event.preventDefault(); });

        formulario.addEventListener("submit", (event) => {
            event.preventDefault();
            if (salvando || idPerfilCriado !== null) return;
            if (etapa === 1) {
                nome.setCustomValidity(nome.value.trim() === "" ? "Informe o nome do perfil." : "");
                if (nome.reportValidity()) mostrarEtapa(2);
            } else if (etapa === 2 && catalogoCarregado && lista.querySelector("input:checked")) {
                mostrarEtapa(3);
            } else if (etapa === 3) {
                mostrarEtapa(4);
            } else if (etapa === 4) {
                listaAlertas.querySelectorAll("tbody tr").forEach(validarLimites);
                const invalido = listaAlertas.querySelector(":invalid");
                if (invalido) invalido.reportValidity();
                else salvarPerfil();
            }
        });
        dialogo.querySelector(".wizard-voltar").addEventListener("click", () => {
            if (somenteLimites || etapa === 1) dialogo.close();
            else mostrarEtapa(etapa - 1);
        });
        formulario.elements.sistemaOperacional.forEach(input => input.addEventListener("change", () => {
            if (catalogoCarregado) renderizarMetricas(true);
        }));
        monitorarDocker.addEventListener("change", atualizarDocker);
        lista.addEventListener("change", atualizarContadores);
        recomendar.addEventListener("click", () => {
            lista.querySelectorAll("input").forEach((checkbox) => {
                checkbox.checked = checkbox.dataset.essencial === "true" || checkbox.dataset.recomendada === "true";
            });
            atualizarContadores();
        });
        dialogo.querySelector(".wizard-metricas-tentar").addEventListener("click", carregarMetricas);
        dialogo.querySelector(".wizard-fechar").addEventListener("click", () => dialogo.close());
        dialogo.addEventListener("close", () => {
            if (idPerfilCriado !== null || idPerfilEdicao !== null) limparCadastro();
            document.body.classList.remove("wizard-perfil-aberto");
            botaoOrigem?.focus();
        });

        let cliqueNoFundo = false;
        function foraDoDialogo(event) {
            const limites = dialogo.getBoundingClientRect();
            return event.clientX < limites.left || event.clientX > limites.right
                || event.clientY < limites.top || event.clientY > limites.bottom;
        }
        dialogo.addEventListener("pointerdown", (event) => {
            cliqueNoFundo = event.target === dialogo && foraDoDialogo(event);
        });
        dialogo.addEventListener("click", (event) => {
            if (!salvando && cliqueNoFundo && event.target === dialogo && foraDoDialogo(event)) dialogo.close();
            cliqueNoFundo = false;
        });
        descricao.addEventListener("input", () => {
            contador.textContent = `${descricao.value.length}/500`;
        });
        nome.addEventListener("input", () => nome.setCustomValidity(""));
    }

    function carregarWizard() {
        if (!carregamentoWizard) {
            carregamentoWizard = fetch("../components/wizardPerfilServidor.html")
                .then(async (resposta) => {
                    if (!resposta.ok) throw new Error("Não foi possível abrir o formulário.");
                    const template = document.createElement("template");
                    template.innerHTML = await resposta.text();
                    const dialogo = template.content.querySelector("dialog");
                    if (!dialogo) throw new Error("Não foi possível abrir o formulário.");
                    document.body.append(dialogo);
                    configurarWizard(dialogo);
                    return dialogo;
                })
                .catch((erro) => {
                    carregamentoWizard = null;
                    throw erro;
                });
        }
        return carregamentoWizard;
    }

    let abrindoWizard = false;
    document.addEventListener("click", async function (event) {
        const botao = event.target.closest("[data-abrir-wizard-perfil], [data-editar-perfil]");
        if (!botao || abrindoWizard) return;
        abrindoWizard = true;
        botao.disabled = true;
        botao.setAttribute("aria-busy", "true");
        botao.parentElement.querySelector(".wizard-erro-abertura")?.remove();
        try {
            const acesso = await acessoPerfis.carregar();
            if (botao.dataset.editarPerfil ? !(acesso.editar || acesso.limites) : !acesso.criar) {
                throw new Error("Você não tem permissão para realizar esta ação.");
            }
            const dialogo = await carregarWizard();
            if (dialogo.open) return;
            if (botao.dataset.editarPerfil) {
                const empresa = Number(sessionStorage.ID_EMPRESA);
                const resposta = await fetch(`/servidor/perfis/${botao.dataset.editarPerfil}?empresa=${empresa}`);
                if (!resposta.ok) throw new Error("Não foi possível carregar o perfil para edição. Tente novamente.");
                const perfil = await resposta.json();
                await dialogo.abrirEdicao(perfil, !acesso.editar);
            }
            botaoOrigem = botao;
            document.body.classList.add("wizard-perfil-aberto");
            dialogo.showModal();
            dialogo.querySelector(".wizard-conteudo").scrollTop = 0;
            const foco = window.matchMedia("(max-width: 700px)").matches
                ? dialogo.querySelector("#wizard-titulo")
                : dialogo.querySelector('[data-etapa="1"]:not([hidden]) input') || dialogo.querySelector("#wizard-titulo");
            foco.focus({ preventScroll: true });
        } catch (erro) {
            const feedback = document.createElement("p");
            feedback.className = "wizard-erro-abertura";
            feedback.setAttribute("role", "alert");
            feedback.textContent = erro.message || "Não foi possível abrir o formulário. Tente novamente.";
            botao.after(feedback);
        } finally {
            abrindoWizard = false;
            botao.disabled = false;
            botao.removeAttribute("aria-busy");
        }
    });
})();
