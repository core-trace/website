const loginForm = document.querySelector("#loginForm");
const emailInput = document.querySelector("#email");
const senhaInput = document.querySelector("#senha");
const loginButton = document.querySelector(".login-form__submit");
const loginFeedback = document.querySelector("#loginFeedback");

loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    if (loginButton.disabled) return;

    const email = emailInput.value.trim();
    const senha = senhaInput.value;

    loginFeedback.textContent = "";
    loginFeedback.hidden = true;

    if (email === "" || senha.trim() === "") {
        loginFeedback.textContent = "Preencha o email e a senha.";
        loginFeedback.hidden = false;
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Entrando...";

    return fetch("/usuario/autenticar", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            emailServer: email,
            senhaServer: senha
        })
    })
        .then(function (resposta) {
            if (resposta.ok) {
                return resposta.json();
            }

            return resposta.text().then(function (mensagem) {
                throw new Error(mensagem || "Não foi possível realizar o login.");
            });
        })
        .then(function (usuario) {
            sessionStorage.clear();
            sessionStorage.ID_USUARIO = usuario.id_usuario;
            sessionStorage.NOME_USUARIO = usuario.nome;
            sessionStorage.EMAIL_USUARIO = usuario.email;
            sessionStorage.ID_EMPRESA = usuario.fk_empresa;
            sessionStorage.ID_NIVEL_ACESSO = usuario.fk_nivel_acesso;
            sessionStorage.STATUS_USUARIO = usuario.status;
            sessionStorage.NIVEL_ACESSO = usuario.nivel_acesso;
            sessionStorage.NOME_EMPRESA = usuario.nome_empresa;

            window.location.href = "/pages/inicioDashboard.html";
        })
        .catch(function (erro) {
            loginFeedback.textContent = erro instanceof TypeError
                ? "Não foi possível conectar ao servidor. Tente novamente."
                : erro.message;
            loginFeedback.hidden = false;
        })
        .finally(function () {
            loginButton.disabled = false;
            loginButton.textContent = "Entrar";
        });
});
