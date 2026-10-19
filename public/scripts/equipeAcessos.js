const empresaEquipe = Number(sessionStorage.ID_EMPRESA);
const formularioEquipe = document.getElementById("cadastroEquipeForm");
const cadastroEquipe = document.getElementById("cadastroFuncionario");
const abrirCadastro = document.getElementById("abrirCadastro");
const cancelarCadastro = document.getElementById("cancelarCadastro");
const cadastrarFuncionario = document.getElementById("cadastrarFuncionario");
const camposCadastro = document.getElementById("camposCadastro");
const perfilFuncionario = document.getElementById("funcionarioPerfil");
const buscarMembro = document.getElementById("buscarMembro");
const filtrarPerfil = document.getElementById("filtrarPerfil");
const listaEquipe = document.getElementById("listaEquipe");
const equipeVazio = document.getElementById("equipeVazio");
const equipeErro = document.getElementById("equipeErro");
const equipeCarregando = document.getElementById("equipeCarregando");
const tentarEquipe = document.getElementById("tentarEquipe");
const cadastroErro = document.getElementById("cadastroErro");
const conviteSucesso = document.getElementById("conviteSucesso");
const perfilSucesso = document.getElementById("perfilSucesso");
let membrosEquipe = [];
let perfisAcesso = [];
let enviandoConvite = false;
let salvandoPerfil = false;

function criarMembro(membro) {
    const item = document.createElement("li");
    item.className = "equipe-membro";
    item.innerHTML = `
        <span class="equipe-avatar" aria-hidden="true"></span>
        <div>
            <div class="equipe-identidade"><strong></strong><span class="equipe-status"></span></div>
            <p class="equipe-membro-email"></p>
        </div>
        <form class="equipe-membro-perfil">
            <fieldset class="equipe-perfil-campos equipe-campo">
                <label>Perfil de acesso</label>
                <div class="equipe-perfil-acoes">
                    <select name="nivelAcesso" required></select>
                    <button class="equipe-botao-primario" type="submit" disabled>Salvar</button>
                </div>
            </fieldset>
            <p class="equipe-perfil-erro" role="alert" hidden></p>
        </form>`;

    const nomes = membro.nome.trim().split(/\s+/);
    let iniciais = nomes[0].charAt(0);
    if (nomes.length > 1) iniciais += nomes[nomes.length - 1].charAt(0);
    item.querySelector(".equipe-avatar").textContent = iniciais.toUpperCase();
    item.querySelector("strong").textContent = membro.nome;
    item.querySelector(".equipe-membro-email").textContent = membro.email;
    const formulario = item.querySelector("form");
    const selecionarPerfil = formulario.elements.nivelAcesso;
    const salvar = formulario.querySelector("button");
    selecionarPerfil.id = "perfil-usuario-" + membro.id_usuario;
    formulario.querySelector("label").htmlFor = selecionarPerfil.id;
    formulario.setAttribute("aria-label", "Alterar perfil de " + membro.nome);
    perfisAcesso.forEach(function (perfil) {
        const opcao = document.createElement("option");
        opcao.value = perfil.id_nivel_acesso;
        opcao.textContent = perfil.nome;
        selecionarPerfil.appendChild(opcao);
    });
    if (membro.podeAlterarPerfil === false) {
        const perfilAtual = document.createElement("input");
        perfilAtual.type = "text";
        perfilAtual.id = selecionarPerfil.id;
        perfilAtual.value = membro.nivel_acesso;
        perfilAtual.readOnly = true;
        selecionarPerfil.replaceWith(perfilAtual);
        selecionarPerfil.disabled = true;
        salvar.remove();
    }
    selecionarPerfil.value = membro.fk_nivel_acesso;
    selecionarPerfil.addEventListener("change", function () {
        salvar.disabled = Number(selecionarPerfil.value) === membro.fk_nivel_acesso;
        formulario.querySelector(".equipe-perfil-erro").hidden = true;
        perfilSucesso.hidden = true;
    });
    formulario.addEventListener("submit", function (event) {
        event.preventDefault();
        salvarPerfilMembro(membro, formulario);
    });
    const status = item.querySelector(".equipe-status");
    status.textContent = membro.status === "ATIVO" ? "Ativo" : membro.status === "PENDENTE" ? "Convite pendente" : "Inativo";
    status.classList.toggle("ativo", membro.status === "ATIVO");
    status.classList.toggle("pendente", membro.status === "PENDENTE");

    if (membro.id_usuario === Number(sessionStorage.ID_USUARIO)) {
        item.classList.add("equipe-membro-atual");
        const voce = document.createElement("span");
        voce.className = "equipe-voce";
        voce.textContent = "Você";
        item.querySelector(".equipe-identidade").appendChild(voce);
    }
    return item;
}

function bloquearEdicaoPerfis(bloquear) {
    buscarMembro.disabled = bloquear;
    filtrarPerfil.disabled = bloquear;
    listaEquipe.querySelectorAll("fieldset").forEach(function (campos) {
        campos.disabled = bloquear;
    });
}

function salvarPerfilMembro(membro, formulario) {
    if (membro.podeAlterarPerfil === false) return;
    const selecionarPerfil = formulario.elements.nivelAcesso;
    const nivelAcesso = Number(selecionarPerfil.value);
    if (salvandoPerfil || enviandoConvite || nivelAcesso === membro.fk_nivel_acesso) return;
    if (!formulario.reportValidity()) return;

    const salvar = formulario.querySelector("button");
    const erroPerfil = formulario.querySelector(".equipe-perfil-erro");
    salvandoPerfil = true;
    bloquearEdicaoPerfis(true);
    cadastrarFuncionario.disabled = true;
    tentarEquipe.disabled = true;
    salvar.textContent = "Salvando...";
    erroPerfil.hidden = true;
    perfilSucesso.hidden = true;
    formulario.setAttribute("aria-busy", "true");

    return fetch("/usuario/" + membro.id_usuario + "/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: empresaEquipe, nivelAcesso: nivelAcesso })
    })
        .then(function (resposta) {
            return resposta.json().then(function (dados) {
                if (!resposta.ok) throw new Error(dados.mensagem || "Não foi possível alterar o perfil.");
                return dados;
            });
        })
        .then(function (dados) {
            membro.fk_nivel_acesso = dados.fk_nivel_acesso;
            membro.nivel_acesso = dados.nivel_acesso;
            if (membro.id_usuario === Number(sessionStorage.ID_USUARIO)) {
                sessionStorage.ID_NIVEL_ACESSO = dados.fk_nivel_acesso;
                sessionStorage.NIVEL_ACESSO = dados.nivel_acesso;
                mostrarUsuarioLogado();
                carregarNavegacao();
            }
            perfilSucesso.textContent = "Perfil de " + membro.nome + " atualizado para " + dados.nivel_acesso + ".";
            perfilSucesso.hidden = false;
            if (filtrarPerfil.value !== "" && Number(filtrarPerfil.value) !== membro.fk_nivel_acesso) {
                formulario.closest("li").remove();
                equipeVazio.hidden = listaEquipe.children.length !== 0;
            }
        })
        .catch(function (erro) {
            erroPerfil.textContent = erro instanceof TypeError
                ? "Não foi possível conectar ao servidor. Tente novamente." : erro.message;
            erroPerfil.hidden = false;
        })
        .finally(function () {
            salvandoPerfil = false;
            bloquearEdicaoPerfis(false);
            cadastrarFuncionario.disabled = !equipeErro.hidden || perfisAcesso.length === 0;
            tentarEquipe.disabled = false;
            salvar.textContent = "Salvar";
            salvar.disabled = Number(selecionarPerfil.value) === membro.fk_nivel_acesso;
            formulario.setAttribute("aria-busy", "false");
            if (formulario.isConnected) selecionarPerfil.focus();
            else filtrarPerfil.focus();
        });
}

function mostrarMembros() {
    const busca = buscarMembro.value.trim().toLowerCase();
    const perfil = filtrarPerfil.value;
    const membros = membrosEquipe.filter(function (membro) {
        const correspondeBusca = membro.nome.toLowerCase().includes(busca) || membro.email.toLowerCase().includes(busca);
        return correspondeBusca && (perfil === "" || membro.fk_nivel_acesso === Number(perfil));
    });
    listaEquipe.replaceChildren();
    membros.forEach(function (membro) {
        listaEquipe.appendChild(criarMembro(membro));
    });
    equipeVazio.hidden = membros.length !== 0;
    equipeVazio.textContent = membrosEquipe.length === 0
        ? "Nenhum funcionário cadastrado nesta empresa." : "Nenhum colaborador encontrado com esses filtros.";
    const total = membrosEquipe.length;
    document.getElementById("equipeContagem").textContent = total + (total === 1 ? " pessoa" : " pessoas");
}

function mostrarPerfisAcesso() {
    const selecaoAtual = perfilFuncionario.value;
    const filtroAtual = filtrarPerfil.value;
    perfilFuncionario.innerHTML = '<option value="">Selecione um perfil</option>';
    filtrarPerfil.innerHTML = '<option value="">Todos os perfis</option>';
    const listaPerfis = document.getElementById("listaPerfisAcesso");
    listaPerfis.replaceChildren();

    perfisAcesso.forEach(function (perfil) {
        const opcao = document.createElement("option");
        opcao.value = perfil.id_nivel_acesso;
        opcao.textContent = perfil.nome;
        perfilFuncionario.appendChild(opcao);
        filtrarPerfil.appendChild(opcao.cloneNode(true));

        const card = document.createElement("article");
        card.className = "equipe-perfil";
        card.innerHTML = '<img alt="" width="18" height="18"><div><h3></h3><p></p></div>';
        const icones = { administrador: "ajuste.svg", operador: "config.png", visualizador: "olho.svg" };
        card.querySelector("img").src = "../assets/icons/" + (icones[perfil.nome.toLowerCase()] || "escudo.svg");
        card.querySelector("h3").textContent = perfil.nome;
        card.querySelector("p").textContent = perfil.descricao || "Perfil de acesso ao site.";
        listaPerfis.appendChild(card);
    });
    perfilFuncionario.value = selecaoAtual;
    filtrarPerfil.value = filtroAtual;
    if (filtrarPerfil.selectedIndex < 0) filtrarPerfil.value = "";
    if (perfilFuncionario.selectedIndex < 0) perfilFuncionario.value = "";
    atualizarDescricaoPerfil();
    abrirCadastro.disabled = perfisAcesso.length === 0;
    cadastrarFuncionario.disabled = perfisAcesso.length === 0;
    if (perfisAcesso.length === 0) {
        equipeErro.hidden = false;
        document.getElementById("equipeMensagemErro").textContent = "Nenhum perfil de acesso ao site está cadastrado.";
    }
}

function atualizarDescricaoPerfil() {
    const perfil = perfisAcesso.find(function (item) {
        return item.id_nivel_acesso === Number(perfilFuncionario.value);
    });
    document.getElementById("perfilDescricao").textContent = perfil
        ? perfil.descricao || "Perfil de acesso ao site." : "Escolha as permissões do usuário na plataforma.";
}

function carregarEquipe() {
    equipeCarregando.hidden = false;
    equipeErro.hidden = true;
    tentarEquipe.disabled = true;
    abrirCadastro.disabled = true;
    cadastrarFuncionario.disabled = true;
    document.querySelector(".equipe-membros").setAttribute("aria-busy", "true");

    return fetch("/usuario/equipe?empresa=" + empresaEquipe)
        .then(function (resposta) {
            return resposta.json().then(function (dados) {
                if (!resposta.ok) throw new Error(dados.mensagem || "Não foi possível carregar a equipe.");
                return dados;
            });
        })
        .then(function (dados) {
            membrosEquipe = dados.membros;
            perfisAcesso = dados.perfisAcesso;
            document.getElementById("funcionarioEmpresa").value = dados.empresa.razao_social;
            mostrarPerfisAcesso();
            mostrarMembros();
        })
        .catch(function (erro) {
            document.getElementById("equipeMensagemErro").textContent = erro instanceof TypeError
                ? "Não foi possível conectar ao servidor. Tente novamente." : erro.message;
            equipeErro.hidden = false;
        })
        .finally(function () {
            equipeCarregando.hidden = true;
            tentarEquipe.disabled = false;
            document.querySelector(".equipe-membros").setAttribute("aria-busy", "false");
        });
}

function fecharCadastro() {
    cadastroEquipe.hidden = true;
    abrirCadastro.setAttribute("aria-expanded", "false");
    abrirCadastro.focus();
}

abrirCadastro.addEventListener("click", function () {
    if (enviandoConvite) return;
    if (!cadastroEquipe.hidden) {
        fecharCadastro();
        return;
    }
    cadastroEquipe.hidden = false;
    abrirCadastro.setAttribute("aria-expanded", "true");
    conviteSucesso.hidden = true;
    document.getElementById("funcionarioNome").focus();
});
cancelarCadastro.addEventListener("click", function () {
    fecharCadastro();
    cadastroErro.hidden = true;
});
buscarMembro.addEventListener("input", mostrarMembros);
filtrarPerfil.addEventListener("change", mostrarMembros);
perfilFuncionario.addEventListener("change", atualizarDescricaoPerfil);
tentarEquipe.addEventListener("click", carregarEquipe);

formularioEquipe.addEventListener("submit", function (event) {
    event.preventDefault();
    if (enviandoConvite || salvandoPerfil || cadastrarFuncionario.disabled) return;
    const nome = formularioEquipe.elements.nome;
    nome.setCustomValidity(nome.value.trim() === "" ? "Informe o nome do funcionário." : "");
    if (!formularioEquipe.reportValidity()) return;

    const dados = {
        nome: nome.value.trim(),
        email: formularioEquipe.elements.email.value.trim(),
        cpf: formularioEquipe.elements.cpf.value.trim(),
        telefone: formularioEquipe.elements.telefone.value.trim(),
        empresa: empresaEquipe,
        nivelAcesso: Number(perfilFuncionario.value)
    };
    enviandoConvite = true;
    bloquearEdicaoPerfis(true);
    camposCadastro.disabled = true;
    cadastrarFuncionario.disabled = true;
    cancelarCadastro.disabled = true;
    abrirCadastro.disabled = true;
    tentarEquipe.disabled = true;
    cadastrarFuncionario.textContent = "Enviando convite...";
    cadastroErro.hidden = true;
    conviteSucesso.hidden = true;
    formularioEquipe.setAttribute("aria-busy", "true");

    return fetch("/convites/criarConvite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados)
    })
        .then(function (resposta) {
            return resposta.json().then(function (dados) {
                if (!resposta.ok) throw new Error(dados.mensagem || "Não foi possível cadastrar o funcionário.");
                return dados;
            });
        })
        .then(function (resultado) {
            conviteSucesso.textContent = resultado.mensagem;
            conviteSucesso.hidden = false;
            formularioEquipe.reset();
            buscarMembro.value = "";
            filtrarPerfil.value = "";
            fecharCadastro();
            return carregarEquipe();
        })
        .catch(function (erro) {
            cadastroErro.textContent = erro instanceof TypeError
                ? "Não foi possível conectar ao servidor. Tente novamente." : erro.message;
            cadastroErro.hidden = false;
        })
        .finally(function () {
            enviandoConvite = false;
            bloquearEdicaoPerfis(false);
            camposCadastro.disabled = false;
            cadastrarFuncionario.disabled = !equipeErro.hidden || perfisAcesso.length === 0;
            abrirCadastro.disabled = cadastrarFuncionario.disabled;
            cancelarCadastro.disabled = false;
            tentarEquipe.disabled = false;
            cadastrarFuncionario.textContent = "Cadastrar e enviar convite";
            formularioEquipe.setAttribute("aria-busy", "false");
            if (cadastroEquipe.hidden) abrirCadastro.focus();
        });
});
formularioEquipe.elements.nome.addEventListener("input", function () {
    this.setCustomValidity("");
});

if (Number.isSafeInteger(empresaEquipe) && empresaEquipe > 0) {
    carregarEquipe();
} else {
    equipeCarregando.hidden = true;
    equipeErro.hidden = false;
    tentarEquipe.hidden = true;
    document.getElementById("equipeMensagemErro").textContent = "Faça login novamente para consultar a equipe da sua empresa.";
    document.querySelector(".equipe-membros").setAttribute("aria-busy", "false");
}
