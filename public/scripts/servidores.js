let teste = document.querySelector("#lista-servidores-componentes");

async function ListarServidoresComponentes() {

    const idEmpresa = sessionStorage.getItem('ID_EMPRESA');
    const idUsuario = sessionStorage.getItem('ID_USUARIO');

    try {

        const resposta = await fetch(
            `/servidores?idEmpresa=${idEmpresa}&idUsuario=${idUsuario}`
        );

        if (!resposta.ok) {
            throw new Error('Erro ao consultar servidores');
        }

        const servidores = await resposta.json();

        return servidores;

    } catch (erro) {

        console.error(erro);

        return [];

    }
}

// Executando a função
ListarServidoresComponentes().then(servidores => {
    console.log(servidores);
    for(i = 0; i < servidores.length; i++){
       renderizarServidores()
    }
});

//

const buscaServidores = document.getElementById('busca-servidores-componentes');
const tabelaServidores = document.getElementById('lista-servidores-componentes');

let servidoresCarregados = [];

function renderizarServidores(servidores) {

    tabelaServidores.innerHTML = '';
    servidoresTotais.innerHTML = servidores.length;

    for (let i = 0; i < servidores.length; i++) {
        tabelaServidores.innerHTML += `
            <tr>
                <td>${servidores[i].nome}</td>
                <td>${servidores[i].nome_perfil}</td>
                <td>?</td>
                <td>?</td>
                <td>?</td>
                <td>?</td>
                <td>?</td>
                <td>?</td>
                <td>?</td>
                <td><button class="visao-detalhes-botao">Detalhes <img src="../assets/icons/seta_vermelha.svg" alt width="11" height="11"></button></td>
            </tr>
        `;
    }
}

function buscarServidor() {

    const pesquisa = buscaServidores.value.toLowerCase().trim();
    let servidoresFiltrados = [];

    for (let i = 0; i < servidoresCarregados.length; i++) {
        if (
            servidoresCarregados[i].nome.toLowerCase().includes(pesquisa) ||
            servidoresCarregados[i].nome_perfil.toLowerCase().includes(pesquisa) ||
            servidoresCarregados[i].endereco_mac.toLowerCase().includes(pesquisa)
        ) {
            servidoresFiltrados.push(servidoresCarregados[i]);
        }
    }
    renderizarServidores(servidoresFiltrados);
}

buscaServidores.addEventListener('input', buscarServidor);

ListarServidoresComponentes().then(servidores => {
    servidoresCarregados = servidores;
    renderizarServidores(servidoresCarregados);
});

// 

const filtroPerfil = document.getElementById('filtro-perfil-servidor');

function carregarPerfis(servidores) {

    let perfisAdicionados = [];

    for (let i = 0; i < servidores.length; i++) {
        let perfilExiste = false;
        for (let j = 0; j < perfisAdicionados.length; j++) {
            if (perfisAdicionados[j] == servidores[i].id_perfil_servidor) {
                perfilExiste = true;
            }
        }

        if (!perfilExiste) {
            perfisAdicionados.push(servidores[i].id_perfil_servidor);
            filtroPerfil.innerHTML += `
                <option value="${servidores[i].id_perfil_servidor}">
                    ${servidores[i].nome_perfil}
                </option>
            `;
        }
    }
}

function filtrarServidores() {

    const pesquisa = buscaServidores.value.toLowerCase().trim();
    const perfilSelecionado = filtroPerfil.value;

    let servidoresFiltrados = [];
    for (let i = 0; i < servidoresCarregados.length; i++) {
        let correspondePesquisa =
            servidoresCarregados[i].nome.toLowerCase().includes(pesquisa) ||
            servidoresCarregados[i].nome_perfil.toLowerCase().includes(pesquisa) ||
            servidoresCarregados[i].endereco_mac.toLowerCase().includes(pesquisa);
        let correspondePerfil =
            perfilSelecionado == '' ||
            servidoresCarregados[i].id_perfil_servidor == perfilSelecionado;
        if (correspondePesquisa && correspondePerfil) {
            servidoresFiltrados.push(servidoresCarregados[i]);
        }
    }

    renderizarServidores(servidoresFiltrados);
}

buscaServidores.addEventListener('input', filtrarServidores);

filtroPerfil.addEventListener('change', filtrarServidores);

ListarServidoresComponentes().then(servidores => {
    servidoresCarregados = servidores;
    carregarPerfis(servidoresCarregados);
    renderizarServidores(servidoresCarregados);
});

//