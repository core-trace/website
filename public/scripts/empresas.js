const formularioEmpresa = document.getElementById("cadastroEmpresaForm");
const camposEmpresa = document.getElementById("camposEmpresa");
const botaoCadastrarEmpresa = document.getElementById("cadastrarEmpresa");
const empresaErro = document.getElementById("empresaErro");
const empresaProgresso = document.getElementById("empresaProgresso");
const empresaSucesso = document.getElementById("empresaSucesso");
const empresaResumo = document.getElementById("empresaResumo");
const cnpjEmpresa = document.getElementById("cnpj");
const telefoneAdministrador = document.getElementById("administradorTelefone");
let enviandoEmpresa = false;

function valorEmpresa(id) {
    return document.getElementById(id).value.trim();
}

cnpjEmpresa.addEventListener("input", function () {
    cnpjEmpresa.value = cnpjEmpresa.value.replace(/\D/g, "").slice(0, 14)
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
    cnpjEmpresa.setCustomValidity("");
});

telefoneAdministrador.addEventListener("input", function () {
    const numeros = telefoneAdministrador.value.replace(/\D/g, "").slice(0, 11);
    telefoneAdministrador.value = numeros
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(numeros.length > 10 ? /(\d{5})(\d{1,4})$/ : /(\d{4})(\d{1,4})$/, "$1-$2");
});

formularioEmpresa.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (enviandoEmpresa) return;

    const cnpj = valorEmpresa("cnpj");
    if (!/^(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(cnpj)) {
        cnpjEmpresa.setCustomValidity("Informe o CNPJ com 14 números, com ou sem pontuação.");
    }
    if (!formularioEmpresa.reportValidity()) return;

    const dados = {
        razaoSocial: valorEmpresa("razaoSocial"), cnpj,
        endereco: {
            logradouro: valorEmpresa("logradouro"), numero: valorEmpresa("numero"),
            cidade: valorEmpresa("cidade"), estado: valorEmpresa("estado")
        },
        administrador: {
            nome: valorEmpresa("administradorNome"), email: valorEmpresa("administradorEmail"),
            cpf: valorEmpresa("administradorCpf"), telefone: valorEmpresa("administradorTelefone")
        }
    };

    enviandoEmpresa = true;
    camposEmpresa.disabled = true;
    formularioEmpresa.setAttribute("aria-busy", "true");
    empresaErro.hidden = true;
    empresaProgresso.textContent = "Cadastrando empresa e enviando o convite ao administrador...";
    botaoCadastrarEmpresa.textContent = "Cadastrando...";

    try {
        const resposta = await fetch("/empresa/cadastrar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados)
        });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.mensagem || "Não foi possível cadastrar a empresa.");

        empresaResumo.textContent = `${dados.razaoSocial} foi cadastrada. Enviamos o convite de administrador para ${dados.administrador.email}.`;
        formularioEmpresa.reset();
        formularioEmpresa.hidden = true;
        empresaSucesso.hidden = false;
        empresaSucesso.focus();
    } catch (erro) {
        empresaErro.textContent = erro instanceof TypeError
            ? "Não foi possível conectar ao servidor. Confira sua conexão e tente novamente."
            : erro instanceof SyntaxError
                ? "O servidor retornou uma resposta inesperada. Confira se o cadastro foi concluído antes de tentar novamente."
                : erro.message;
        empresaErro.hidden = false;
    } finally {
        enviandoEmpresa = false;
        camposEmpresa.disabled = false;
        formularioEmpresa.setAttribute("aria-busy", "false");
        empresaProgresso.textContent = "";
        botaoCadastrarEmpresa.textContent = "Cadastrar empresa e enviar convite";
    }
});

document.getElementById("novaEmpresa").addEventListener("click", function () {
    empresaSucesso.hidden = true;
    formularioEmpresa.hidden = false;
    document.getElementById("razaoSocial").focus();
});
