const menu = document.querySelector(".dashboard-menu");
const botaoAbrirMenu = document.querySelector(".dashboard-abrir-menu");
const botaoFecharMenu = document.querySelector(".dashboard-fechar-menu");
const fundoMenu = document.querySelector(".dashboard-menu-fundo");
const conteudo = document.querySelector(".dashboard-conteudo");
const telaPequena = window.matchMedia("(max-width: 800px)");
const conta = document.querySelector(".dashboard-conta");
const botaoConta = document.querySelector(".dashboard-usuario-toggle");
const menuConta = document.getElementById("menu-conta");
const botaoSair = document.querySelector(".dashboard-sair");

function fecharMenuConta(devolverFoco = false) {
    menuConta.hidden = true;
    botaoConta.setAttribute("aria-expanded", "false");
    botaoConta.setAttribute("aria-label", "Abrir menu da conta");

    if (devolverFoco) botaoConta.focus();
}

botaoConta.addEventListener("click", () => {
    if (!menuConta.hidden) {
        fecharMenuConta();
        return;
    }

    menuConta.hidden = false;
    botaoConta.setAttribute("aria-expanded", "true");
    botaoConta.setAttribute("aria-label", "Fechar menu da conta");
});

document.addEventListener("click", (event) => {
    if (!conta.contains(event.target)) fecharMenuConta();
});

conta.addEventListener("focusout", (event) => {
    if (!conta.contains(event.relatedTarget)) fecharMenuConta();
});

conta.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menuConta.hidden) {
        event.preventDefault();
        fecharMenuConta(true);
    }
});

botaoSair.addEventListener("click", () => {
    sessionStorage.clear();
    window.location.href = "login.html";
});

function fecharMenu(devolverFoco = true) {
    document.body.classList.remove("dashboard-menu-aberto");
    botaoAbrirMenu.setAttribute("aria-expanded", "false");
    conteudo.inert = false;
    menu.inert = telaPequena.matches;

    if (devolverFoco) botaoAbrirMenu.focus();
}

function abrirMenu() {
    if (!telaPequena.matches) return;

    document.body.classList.add("dashboard-menu-aberto");
    botaoAbrirMenu.setAttribute("aria-expanded", "true");
    menu.inert = false;
    conteudo.inert = true;
    botaoFecharMenu.focus();
}

botaoAbrirMenu.addEventListener("click", abrirMenu);
botaoFecharMenu.addEventListener("click", () => fecharMenu());
fundoMenu.addEventListener("click", () => fecharMenu());

menu.addEventListener("click", (event) => {
    if (telaPequena.matches && event.target.closest("a")) fecharMenu();
});

document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("dashboard-menu-aberto")) return;

    if (event.key === "Escape") {
        fecharMenu();
    }

    if (event.key === "Tab") {
        const itens = menu.querySelectorAll("a[href], button:not([disabled])");
        const primeiro = itens[0];
        const ultimo = itens[itens.length - 1];

        if (event.shiftKey && document.activeElement === primeiro) {
            event.preventDefault();
            ultimo.focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault();
            primeiro.focus();
        }
    }
});

telaPequena.addEventListener("change", () => {
    const focoNoMenu = menu.contains(document.activeElement);
    const focoNoBotaoFechar = document.activeElement === botaoFecharMenu;
    fecharMenu(telaPequena.matches && focoNoMenu);

    if (!telaPequena.matches && focoNoBotaoFechar) {
        menu.querySelector("a").focus();
    }
});

fecharMenu(false);
