function mostrarUsuarioLogado() {
    if (!sessionStorage.ID_USUARIO || !sessionStorage.ID_EMPRESA) {
        window.location.replace("login.html");
        return;
    }

    const email = sessionStorage.EMAIL_USUARIO || "";
    let nome = sessionStorage.NOME_USUARIO || "";
    const nomesContas = {
        "admin@ifood.teste": "Eduardo",
        "analista@ifood.teste": "Amanda",
        "visualizador@ifood.teste": "Marcelo"
    };
    // Atualiza sessões antigas que ainda guardam o perfil como nome da conta.
    const nomeConta = nomesContas[email.trim().toLowerCase()];
    if (nomeConta && (!nome.trim() || /^(administrador|admin|analista|operador|visualizador)(?:\s+(?:do\s+)?ifood)?$/i.test(nome.trim()))) {
        nome = nomeConta;
        sessionStorage.NOME_USUARIO = nome;
    }
    nome = nome.trim() || "Usuário";
    const nivel = sessionStorage.NIVEL_ACESSO || "";
    const partes = nome.trim().split(/\s+/);
    let iniciais = partes[0].charAt(0);
    if (partes.length > 1) iniciais += partes[partes.length - 1].charAt(0);

    document.querySelector(".dashboard-usuario-nome").textContent = nome;
    document.querySelector(".dashboard-usuario-cargo").textContent = nivel;
    document.querySelector(".dashboard-avatar").textContent = iniciais.toUpperCase();
    document.querySelector(".dashboard-avatar").setAttribute("aria-label", nome);
    document.querySelector(".dashboard-conta-email").textContent = email;
}

function renderizarNavegacao(grupos) {
    const navegacao = document.querySelector(".dashboard-navegacao");
    const secoes = grupos.filter(grupo => grupo.itens.length > 0).map(grupo => {
        const secao = document.createElement("div");
        secao.className = "dashboard-menu-grupo";
        const titulo = document.createElement("h2");
        titulo.className = "dashboard-menu-titulo";
        titulo.textContent = grupo.titulo;
        secao.appendChild(titulo);
        for (const item of grupo.itens) {
            const link = document.createElement("a");
            link.className = "dashboard-menu-item";
            link.href = item.href;
            if (item.href === window.location.pathname) link.setAttribute("aria-current", "page");
            const icone = document.createElement("img");
            icone.src = item.icone;
            icone.alt = "";
            icone.width = 20;
            icone.height = 20;
            const rotulo = document.createElement("span");
            rotulo.textContent = item.rotulo;
            link.append(icone, rotulo);
            secao.appendChild(link);
        }
        return secao;
    });
    navegacao.replaceChildren(...secoes);
    navegacao.setAttribute("aria-busy", "false");
}

function carregarNavegacao() {
    const nivel = Number(sessionStorage.ID_NIVEL_ACESSO);
    if (![1, 2, 3, 4].includes(nivel)) return;
    const grupos = [
        { titulo: 'Monitoramento', itens: [
            { rotulo: 'Dashboard', href: '/pages/inicioDashboard.html', icone: '/assets/icons/dashboard.png' },
            { rotulo: 'Alertas', href: '/pages/alertas.html', icone: '/assets/icons/sino.png' }
        ] },
        { titulo: 'Gestão', itens: [
            { rotulo: 'Perfis de servidor', href: '/pages/perfisServidor.html', icone: '/assets/icons/perfil.png' }
        ] }
    ];
    if (nivel <= 2) grupos[1].itens.push({ rotulo: 'Equipe e acessos', href: '/pages/general-employee.html', icone: '/assets/icons/pessoas.png' });
    if (nivel === 1) grupos.push({ titulo: 'Administrador CoreTrace', itens: [
        { rotulo: 'Empresas', href: '/pages/empresas.html', icone: '/assets/icons/empresa.svg' }
    ] });
    renderizarNavegacao(grupos);
}

mostrarUsuarioLogado();
carregarNavegacao();

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
