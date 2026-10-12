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
        const listaEquipe = dialogo.querySelector(".wizard-equipe-lista");
        const selecionarUsuario = dialogo.querySelector("#perfil-equipe-usuario");
        const incluirUsuario = dialogo.querySelector(".wizard-equipe-incluir");
        let usuariosEmpresa = [];
        const feedbackEquipe = dialogo.querySelector("#perfil-equipe-feedback");
        const emailProprietario = (sessionStorage.EMAIL_USUARIO || "").trim().toLowerCase();
        let membrosEquipe = [];
        const linhasAlertas = new Map();
        let categoriasMetricas = [];
        let etapa = 1;
        let catalogoCarregado = false;
        let buscandoMetricas = false;
        let salvando = false;
        let idPerfilCriado = null;
        let idPerfilEdicao = null;
        let metricasSalvas = [];
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
                : etapa === 5 ? "Concluir configuração" : "Próximo";
        }

        function criarMembroEquipe(membro, proprietario) {
            const item = document.createElement("li");
            item.className = "wizard-equipe-membro";
            // O HTML é fixo; nome e email são preenchidos como texto.
            item.innerHTML = `
                <span class="wizard-equipe-avatar" aria-hidden="true"></span>
                <div class="wizard-equipe-dados">
                    <div class="wizard-equipe-identidade">
                        <strong></strong>
                        <span class="wizard-equipe-status"></span>
                    </div>
                    <p></p>
                </div>`;
            item.querySelector("strong").textContent = membro.nome;
            item.querySelector("p").textContent = membro.email;
            const partesNome = membro.nome.trim().split(/\s+/);
            let iniciais = partesNome[0].charAt(0);
            if (partesNome.length > 1) iniciais += partesNome[partesNome.length - 1].charAt(0);
            item.querySelector(".wizard-equipe-avatar").textContent = iniciais.toUpperCase();
            const status = item.querySelector(".wizard-equipe-status");
            status.textContent = membro.status === "ATIVO" ? "Ativo" : "Pendente";
            status.classList.toggle("ativo", membro.status === "ATIVO");

            if (proprietario) {
                item.classList.add("wizard-equipe-proprietario");
                const papel = document.createElement("span");
                papel.className = "wizard-equipe-papel";
                papel.innerHTML = '<img src="../assets/icons/coroa.svg" alt="" width="15" height="13"> Proprietário';
                item.appendChild(papel);
            } else {
                const papel = document.createElement("select");
                papel.setAttribute("aria-label", "Nível de acesso de " + membro.nome);
                papel.innerHTML = '<option value="administrador">Administrador</option><option value="visualizador">Visualizador</option>';
                papel.value = membro.papel;
                papel.addEventListener("change", function () {
                    membro.papel = papel.value;
                });
                const remover = document.createElement("button");
                remover.type = "button";
                remover.className = "wizard-equipe-remover";
                remover.textContent = "Remover";
                remover.setAttribute("aria-label", "Remover " + membro.nome);
                remover.addEventListener("click", function () {
                    membrosEquipe = membrosEquipe.filter(function (pessoa) {
                        return pessoa.id !== membro.id;
                    });
                    renderizarEquipe();
                    atualizarSelecaoEquipe();
                });
                item.append(papel, remover);
            }
            return item;
        }

        function renderizarEquipe() {
            listaEquipe.replaceChildren();
            listaEquipe.appendChild(criarMembroEquipe({
                nome: sessionStorage.NOME_USUARIO || "Você",
                email: emailProprietario,
                status: sessionStorage.STATUS_USUARIO
            }, true));
            membrosEquipe.forEach(function (membro) {
                listaEquipe.appendChild(criarMembroEquipe(membro, false));
            });
            const total = membrosEquipe.length + 1;
            dialogo.querySelector(".wizard-equipe-contagem").textContent = total + (total === 1 ? " pessoa" : " pessoas");
        }

        function atualizarSelecaoEquipe() {
            selecionarUsuario.innerHTML = '<option value="">Selecione um colaborador</option>';
            usuariosEmpresa.forEach(function (usuario) {
                const selecionado = membrosEquipe.some(function (membro) {
                    return membro.id === usuario.id_usuario;
                });
                if (selecionado) return;
                const opcao = document.createElement("option");
                opcao.value = usuario.id_usuario;
                opcao.textContent = usuario.nome + " — " + usuario.email;
                selecionarUsuario.appendChild(opcao);
            });
            selecionarUsuario.disabled = selecionarUsuario.options.length === 1;
            incluirUsuario.disabled = true;
            if (selecionarUsuario.disabled) {
                selecionarUsuario.options[0].textContent = "Nenhum colaborador disponível";
            }
        }

        function carregarEquipe() {
            selecionarUsuario.disabled = true;
            incluirUsuario.disabled = true;
            feedbackEquipe.textContent = "Carregando colaboradores...";
            feedbackEquipe.hidden = false;
            const tentar = dialogo.querySelector(".wizard-equipe-tentar");
            tentar.hidden = true;
            const empresa = Number(sessionStorage.ID_EMPRESA);
            const proprietario = Number(sessionStorage.ID_USUARIO);
            // No cadastro o perfil ainda não existe. O filtro também aceita um perfil existente.
            const perfil = Number(dialogo.dataset.perfilServidor || 0);

            return fetch(`/servidor/membros-disponiveis?empresa=${empresa}&proprietario=${proprietario}&perfil=${perfil}`)
                .then(function (resposta) {
                    if (!resposta.ok) throw new Error("Não foi possível carregar os colaboradores.");
                    return resposta.json();
                })
                .then(function (usuarios) {
                    usuariosEmpresa = usuarios;
                    atualizarSelecaoEquipe();
                    feedbackEquipe.hidden = true;
                })
                .catch(function (erro) {
                    feedbackEquipe.textContent = erro.message;
                    tentar.hidden = false;
                });
        }

        selecionarUsuario.addEventListener("change", function () {
            incluirUsuario.disabled = selecionarUsuario.value === "";
        });
        incluirUsuario.addEventListener("click", function () {
            const usuario = usuariosEmpresa.find(function (pessoa) {
                return pessoa.id_usuario === Number(selecionarUsuario.value);
            });
            if (!usuario) return;
            membrosEquipe.push({
                id: usuario.id_usuario, nome: usuario.nome, email: usuario.email,
                status: usuario.status, papel: "visualizador"
            });
            renderizarEquipe();
            atualizarSelecaoEquipe();
            feedbackEquipe.hidden = true;
        });
        dialogo.querySelector(".wizard-equipe-tentar").addEventListener("click", carregarEquipe);

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
                checkbox.checked = metricasSalvas.some(function (salva) {
                    return salva.id === metrica.id;
                });
                checkbox.dataset.recomendada = String(metrica.recomendada === true);
                const texto = document.createElement("span");
                texto.textContent = metrica.nome;
                label.append(checkbox, texto);
                card.append(label);
            });
            return card;
        }

        function validarLimites(linha) {
            const operador = linha.querySelector("select").value;
            const atencao = linha.querySelector('[data-limite="atencao"]');
            const critico = linha.querySelector('[data-limite="critico"]');
            const mensagem = linha.querySelector(".wizard-alerta-erro");
            critico.setCustomValidity("");
            let erroLimites = "";
            if (!atencao.validity.valid || !critico.validity.valid) {
                erroLimites = atencao.max === "100"
                    ? "Informe limites entre 0 e 100%." : "Informe limites numéricos válidos.";
            } else if ((atencao.value === "") !== (critico.value === "")) {
                erroLimites = "Preencha os dois limites ou deixe ambos vazios.";
            } else if (atencao.value !== "" && critico.value !== "") {
                const ordemValida = operador.startsWith(">")
                    ? critico.valueAsNumber > atencao.valueAsNumber
                    : critico.valueAsNumber < atencao.valueAsNumber;
                if (!ordemValida) erroLimites = operador.startsWith(">")
                    ? "O limite crítico deve ser maior que o de atenção."
                    : "O limite crítico deve ser menor que o de atenção.";
            }
            critico.setCustomValidity(erroLimites);
            atencao.setAttribute("aria-invalid", String(!atencao.validity.valid));
            critico.setAttribute("aria-invalid", String(!critico.validity.valid));
            mensagem.textContent = erroLimites;
            mensagem.hidden = !erroLimites;
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

                const categorias = dados.categorias.filter((categoria) => categoria.metricas.length > 0);
                categoriasMetricas = categorias;
                lista.replaceChildren(...categorias.map(criarCategoria));
                vazio.hidden = categorias.length > 0;
                lista.hidden = categorias.length === 0;
                resumo.hidden = categorias.length === 0;
                recomendar.disabled = categorias.length === 0;
                atualizarContadores();
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

            const nomesEtapas = ["Informações básicas", "Métricas", "Contêineres", "Alertas", "Equipe"];
            const descricoesEtapas = [
                "Comece dando um nome ao perfil do servidor e escolha o sistema operacional que será utilizado.",
                "Selecione as métricas que deseja monitorar. Você pode adicionar ou alterar métricas e alertas ao editar o perfil.",
                "Habilite o monitoramento de contêineres Docker e acompanhe CPU, RAM, I/O Disco, Rede e Status dos contêineres.",
                "Defina os limites de alerta para cada métrica. Você será notificado quando os valores excederem os limites configurados.",
                "Adicione as pessoas que vão acompanhar este perfil e defina o nível de acesso de cada uma."
            ];
            const nomeEtapa = nomesEtapas[numero - 1];
            titulo.textContent = numero === 5 ? "Adicione sua equipe" : numero === 4 ? "Configuração de alertas e limites"
                : numero === 3 ? "Monitoramento de Contêineres Docker" : nomeEtapa;
            if (idPerfilEdicao && numero === 1) titulo.textContent = "Editar perfil de servidor";
            introducao.textContent = descricoesEtapas[numero - 1];
            dialogo.querySelector(".wizard-docker-introducao").hidden = numero !== 3;
            dialogo.querySelector(".wizard-etapa-contagem").textContent = `Etapa ${numero} de ${idPerfilEdicao ? 4 : 5}`;
            dialogo.querySelector(".wizard-etapa-atual").textContent = nomeEtapa;
            recomendar.hidden = numero !== 2;

            atualizarProximo();
            conteudo.scrollTop = 0;
            titulo.focus({ preventScroll: true });
            if (numero === 2) carregarMetricas();
            if (numero === 4) atualizarAlertas();
            if (numero === 5) {
                renderizarEquipe();
                carregarEquipe();
            }
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
                    critico: critico.value === "" ? null : critico.valueAsNumber
                });
            });
            return metricasSelecionadas;
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
            dialogo.querySelector("#wizard-finalizado-titulo").textContent = idPerfilEdicao
                ? "Perfil atualizado com sucesso" : "Perfil criado com sucesso";
            dialogo.querySelector(".wizard-finalizado-status").textContent = idPerfilEdicao
                ? "Alterações salvas" : "Configuração concluída";
            conclusao.scrollTop = 0;
            dialogo.querySelector("#wizard-finalizado-titulo").focus();
        }

        function limparCadastro() {
            idPerfilCriado = null;
            idPerfilEdicao = null;
            metricasSalvas = [];
            dialogo.classList.remove("wizard-editando");
            dialogo.querySelector(".wizard-etapas li:last-child").hidden = false;
            feedbackCadastro.hidden = true;
            formulario.reset();
            membrosEquipe = [];
            linhasAlertas.clear();
            contador.textContent = "0/500";
            feedbackEquipe.hidden = true;
            lista.querySelectorAll("input").forEach(function (input) {
                input.checked = false;
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

        dialogo.addEventListener("editar-perfil", function (event) {
            limparCadastro();
            const perfil = event.detail;
            idPerfilEdicao = perfil.id_perfil_servidor;
            metricasSalvas = perfil.metricas;
            dialogo.classList.add("wizard-editando");
            dialogo.querySelector(".wizard-etapas li:last-child").hidden = true;
            nome.value = perfil.nome;
            descricao.value = perfil.descricao || "";
            contador.textContent = descricao.value.length + "/500";
            formulario.elements.sistemaOperacional.value = perfil.sistema_operacional;
            monitorarDocker.checked = Boolean(Number(perfil.monitorar_docker));
            lista.querySelectorAll("input").forEach(function (input) {
                input.checked = metricasSalvas.some(function (metrica) {
                    return metrica.id === Number(input.value);
                });
            });
            atualizarContadores();
            atualizarDocker();
            mostrarEtapa(1);
        });

        function salvarPerfil() {
            if (salvando || idPerfilCriado !== null) return;
            if (!idPerfilEdicao && selecionarUsuario.value !== "") {
                feedbackEquipe.textContent = "Clique em Adicionar para incluir o colaborador selecionado.";
                feedbackEquipe.hidden = false;
                return;
            }
            const dados = {
                empresa: Number(sessionStorage.ID_EMPRESA),
                proprietario: Number(sessionStorage.ID_USUARIO),
                nome: nome.value.trim(),
                descricao: descricao.value.trim(),
                sistemaOperacional: formulario.elements.sistemaOperacional.value,
                monitorarDocker: monitorarDocker.checked,
                metricas: obterMetricasSelecionadas(),
                equipe: membrosEquipe.map(function (membro) {
                    return { id: membro.id, papel: membro.papel };
                })
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
                else if (idPerfilEdicao) salvarPerfil();
                else mostrarEtapa(5);
            } else if (etapa === 5) {
                salvarPerfil();
            }
        });
        dialogo.querySelector(".wizard-voltar").addEventListener("click", () => {
            if (etapa === 1) dialogo.close();
            else mostrarEtapa(etapa - 1);
        });
        monitorarDocker.addEventListener("change", atualizarDocker);
        lista.addEventListener("change", atualizarContadores);
        recomendar.addEventListener("click", () => {
            lista.querySelectorAll("input").forEach((checkbox) => {
                checkbox.checked = checkbox.dataset.recomendada === "true";
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
            const dialogo = await carregarWizard();
            if (dialogo.open) return;
            if (botao.dataset.editarPerfil) {
                const empresa = Number(sessionStorage.ID_EMPRESA);
                const resposta = await fetch(`/servidor/perfis/${botao.dataset.editarPerfil}?empresa=${empresa}`);
                if (!resposta.ok) throw new Error("Não foi possível carregar o perfil para edição. Tente novamente.");
                const perfil = await resposta.json();
                dialogo.dispatchEvent(new CustomEvent("editar-perfil", { detail: perfil }));
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
