const resultadosPerfis = document.querySelector(".perfis-resultados");
const carregandoPerfis = document.querySelector(".perfis-carregando");
const listaPerfis = document.querySelector(".perfis-lista");
const vazioPerfis = document.querySelector(".perfis-vazio");
const erroPerfis = document.querySelector(".perfis-erro");
const mensagemErroPerfis = document.getElementById("perfis-mensagem-erro");
const contagemPerfis = document.querySelector(".perfis-contagem");
const tentarPerfis = document.querySelector(".perfis-tentar");
const loginPerfis = document.querySelector(".perfis-login");

function criarCardPerfil(perfil) {
    const card = document.createElement("li");
    card.className = "perfil-card";

    const icone = document.createElement("div");
    icone.className = "perfil-card-icone";
    const imagem = document.createElement("img");
    imagem.src = "../assets/icons/servidor.svg";
    imagem.alt = "";
    imagem.width = 24;
    imagem.height = 24;
    icone.append(imagem);

    const nome = document.createElement("h2");
    nome.textContent = perfil.nome;
    const descricao = document.createElement("p");
    descricao.className = "perfil-card-descricao";
    descricao.textContent = perfil.descricao || "Sem descrição.";
    const servidores = document.createElement("p");
    servidores.className = "perfil-card-servidores";
    const total = Number(perfil.total_servidores) || 0;
    servidores.textContent = total === 1 ? "1 servidor vinculado" : `${total} servidores vinculados`;

    card.append(icone, nome, descricao, servidores);
    return card;
}

async function carregarPerfis() {
    resultadosPerfis.setAttribute("aria-busy", "true");
    carregandoPerfis.hidden = false;
    listaPerfis.hidden = true;
    vazioPerfis.hidden = true;
    erroPerfis.hidden = true;
    contagemPerfis.hidden = true;
    tentarPerfis.disabled = true;

    const idEmpresa = Number(sessionStorage.ID_EMPRESA);
    const empresaValida = Number.isSafeInteger(idEmpresa) && idEmpresa > 0;
    tentarPerfis.hidden = !empresaValida;
    loginPerfis.hidden = empresaValida;

    try {
        if (!empresaValida) {
            throw new Error("Faça login para visualizar os perfis da sua empresa.");
        }

        const resposta = await fetch(`/servidor/perfis?empresa=${idEmpresa}`);
        if (!resposta.ok) {
            throw new Error("Não foi possível consultar os perfis. Tente novamente em instantes.");
        }

        const perfis = await resposta.json();
        if (!Array.isArray(perfis)) throw new Error("Não foi possível carregar a lista de perfis.");

        listaPerfis.replaceChildren(...perfis.map(criarCardPerfil));
        vazioPerfis.hidden = perfis.length !== 0;
        listaPerfis.hidden = perfis.length === 0;
        contagemPerfis.hidden = perfis.length === 0;
        contagemPerfis.textContent = perfis.length === 1 ? "1 perfil cadastrado" : `${perfis.length} perfis cadastrados`;
    } catch (erro) {
        mensagemErroPerfis.textContent = erro instanceof TypeError
            ? "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
            : erro.message;
        erroPerfis.hidden = false;
    } finally {
        carregandoPerfis.hidden = true;
        tentarPerfis.disabled = false;
        resultadosPerfis.setAttribute("aria-busy", "false");
    }
}

tentarPerfis.addEventListener("click", carregarPerfis);
carregarPerfis();

document.addEventListener("perfil-servidor-criado", carregarPerfis);
