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

function criarItemNavegacao(item) {
    const disponivel = Boolean(item.href || item.filhos);
    const link = document.createElement(item.href ? "a" : "button");
    link.className = "dashboard-menu-item";
    if (item.href) {
        link.href = item.href;
        const destino = new URL(item.href, window.location.origin);
        if (destino.pathname === window.location.pathname) {
            link.setAttribute("aria-current", "page");
        }
    } else {
        link.type = "button";
        if (!disponivel) link.setAttribute("aria-disabled", "true");
    }
    link.setAttribute("aria-label", item.rotulo);
    if (item.icone) {
        const icone = document.createElement("img");
        icone.src = item.icone;
        icone.alt = "";
        icone.width = 20;
        icone.height = 20;
        if (item.icone === "/assets/sidebar/equipe.png") {
            const recorte = document.createElement("span");
            recorte.className = "dashboard-icone-equipe";
            icone.width = 25;
            icone.height = 23;
            recorte.appendChild(icone);
            link.appendChild(recorte);
        } else {
            link.appendChild(icone);
        }
    }
    const rotulo = document.createElement("span");
    rotulo.className = "dashboard-menu-rotulo";
    rotulo.textContent = item.rotulo;
    link.appendChild(rotulo);

    link.title = link.getAttribute("aria-label");
    return link;
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
            if (!item.filhos) {
                secao.appendChild(criarItemNavegacao(item));
                continue;
            }
            const grupoDashboards = document.createElement("div");
            grupoDashboards.className = "dashboard-menu-dashboards";

            const controle = criarItemNavegacao(item);
            controle.classList.add("dashboard-dashboards-toggle");
            controle.setAttribute("aria-controls", "dashboard-submenu");
            controle.setAttribute("aria-expanded", "false");
            const seta = document.createElement("img");
            seta.className = "dashboard-menu-seta";
            seta.src = "/assets/sidebar/chevron.svg";
            seta.alt = "";
            seta.width = 16;
            seta.height = 16;
            controle.appendChild(seta);
            const submenu = document.createElement("div");
            submenu.className = "dashboard-submenu";
            submenu.id = "dashboard-submenu";
            submenu.hidden = true;
            const cabecalho = document.createElement("p");
            cabecalho.className = "dashboard-submenu-titulo";
            cabecalho.textContent = item.rotulo;
            submenu.append(cabecalho, ...item.filhos.map(criarItemNavegacao));
            if (submenu.querySelector('[aria-current="page"]')) controle.classList.add("dashboard-item-ativo");
            grupoDashboards.append(controle, submenu);
            secao.appendChild(grupoDashboards);
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
        { titulo: "Monitoramento", itens: [
            { rotulo: "Dashboards", icone: "/assets/sidebar/dashboard.svg", filhos: [
                { rotulo: "Geral", href: "/pages/inicioDashboard.html" },
                { rotulo: "Processos" },
                { rotulo: "Docker" },
                { rotulo: "Alertas", href: "/pages/alertas.html" },
                { rotulo: "Servidores" },
                { rotulo: "Análise por perfil" }
            ] }
        ] },
        { titulo: "Gestão", itens: [
            { rotulo: "Configurar perfis", href: "/pages/perfisServidor.html", icone: "/assets/icons/perfil.png" }
        ] },
        { titulo: "Sistema", itens: [
            { rotulo: "Configurações", icone: "/assets/sidebar/configuracoes.svg" },
            { rotulo: "Documentação", icone: "/assets/sidebar/documentacao.svg" }
        ] }
    ];
    if (nivel <= 2) grupos[1].itens.push({ rotulo: "Equipe e acessos", href: "/pages/general-employee.html", icone: "/assets/sidebar/equipe.png" });
    if (nivel === 1) grupos.push({ titulo: "Administrador CoreTrace", itens: [
        { rotulo: "Empresas", href: "/pages/empresas.html", icone: "/assets/icons/empresa.svg" }
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
        const itens = [...menu.querySelectorAll("a[href], button:not([disabled])")].filter(item => item.getClientRects().length > 0 && !item.closest("[inert]"));
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

const botaoRecolherMenu = document.createElement("button");
botaoRecolherMenu.type = "button";
botaoRecolherMenu.className = "dashboard-recolher-menu";
botaoRecolherMenu.setAttribute("aria-controls", "menu-dashboard");
menu.querySelector(".dashboard-menu-cabecalho").appendChild(botaoRecolherMenu);
const logoCompacta = document.createElement("img");
logoCompacta.src = "/assets/sidebar/logo-compacta.svg";
logoCompacta.alt = "";
logoCompacta.width = 44.545;
logoCompacta.height = 50;
logoCompacta.className = "dashboard-logo-compacta";
menu.querySelector(".dashboard-logo").appendChild(logoCompacta);

const grupoDashboards = menu.querySelector(".dashboard-menu-dashboards");
const botaoDashboards = menu.querySelector(".dashboard-dashboards-toggle");
const submenuDashboards = menu.querySelector(".dashboard-submenu");
let menuRecolhido = false;
let sanfonaAberta = false;
let fechamentoSubmenu;
let animacaoSubmenu;
try {
    menuRecolhido = localStorage.getItem("coretrace.sidebar.recolhida") === "true";
    sanfonaAberta = sessionStorage.getItem("coretrace.sidebar.dashboards") === "true";
} catch {  }

function modoCompacto() {
    return menuRecolhido && !telaPequena.matches;
}

function posicionarSubmenu() {
    if (!modoCompacto() || !submenuDashboards || submenuDashboards.hidden) return;
    const margem = 12;
    const altura = submenuDashboards.getBoundingClientRect().height;
    const topoBotao = botaoDashboards.getBoundingClientRect().top;
    submenuDashboards.style.top = Math.max(margem, Math.min(topoBotao, window.innerHeight - altura - margem)) + "px";
    submenuDashboards.style.left = (menu.getBoundingClientRect().right + 8) + "px";
}

function exibirSubmenu(aberto, animar = true) {
    if (!submenuDashboards) return;
    clearTimeout(fechamentoSubmenu);
    const estavaAberto = botaoDashboards.getAttribute("aria-expanded") === "true";
    const alturaAtual = submenuDashboards.hidden ? 0 : submenuDashboards.getBoundingClientRect().height;
    animacaoSubmenu?.cancel();
    animacaoSubmenu = null;
    botaoDashboards.setAttribute("aria-expanded", String(aberto));
    submenuDashboards.inert = !aberto;

    if (!animar || window.matchMedia("(prefers-reduced-motion: reduce)").matches || estavaAberto === aberto) {
        submenuDashboards.hidden = !aberto;
        posicionarSubmenu();
        return;
    }

    submenuDashboards.hidden = false;
    posicionarSubmenu();
    const compacto = modoCompacto();
    const quadros = compacto ? [
        { opacity: aberto ? 0 : 1, transform: aberto ? "translateX(-8px)" : "translateX(0)" },
        { opacity: aberto ? 1 : 0, transform: aberto ? "translateX(0)" : "translateX(-8px)" }
    ] : [
        { height: alturaAtual + "px", opacity: estavaAberto ? 1 : 0, overflow: "hidden", marginTop: estavaAberto ? "4px" : "0px" },
        { height: aberto ? submenuDashboards.scrollHeight + "px" : "0px", opacity: aberto ? 1 : 0, overflow: "hidden", marginTop: aberto ? "4px" : "0px" }
    ];
    const animacao = submenuDashboards.animate(quadros, {
        duration: compacto ? 180 : 280,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
    });
    animacaoSubmenu = animacao;
    animacao.finished.then(() => {
        if (animacaoSubmenu !== animacao) return;
        submenuDashboards.hidden = !aberto;
        animacaoSubmenu = null;
        posicionarSubmenu();
    }).catch(() => { });
}

function aplicarLarguraMenu() {
    const compacto = modoCompacto();
    document.body.classList.toggle("dashboard-menu-recolhido", compacto);
    botaoRecolherMenu.textContent = compacto ? "»" : "«";
    botaoRecolherMenu.setAttribute("aria-label", compacto ? "Expandir menu lateral" : "Recolher menu lateral");
    botaoRecolherMenu.title = botaoRecolherMenu.getAttribute("aria-label");
    botaoRecolherMenu.setAttribute("aria-expanded", String(!compacto));
    if (submenuDashboards) {
        submenuDashboards.style.top = "";
        submenuDashboards.style.left = "";
    }
    exibirSubmenu(!compacto && sanfonaAberta, false);
}

botaoRecolherMenu.addEventListener("click", () => {
    menuRecolhido = !menuRecolhido;
    try { localStorage.setItem("coretrace.sidebar.recolhida", String(menuRecolhido)); } catch { /* Opcional. */ }
    aplicarLarguraMenu();
});

if (grupoDashboards) {
    botaoDashboards.addEventListener("click", () => {
        const abrir = botaoDashboards.getAttribute("aria-expanded") !== "true";
        if (!modoCompacto()) {
            sanfonaAberta = abrir;
            try { sessionStorage.setItem("coretrace.sidebar.dashboards", String(abrir)); } catch { /* Opcional. */ }
        }
        exibirSubmenu(abrir);
    });
    grupoDashboards.addEventListener("pointerenter", event => {
        if (modoCompacto() && event.pointerType !== "touch") exibirSubmenu(true);
    });
    grupoDashboards.addEventListener("pointerleave", () => {
        if (modoCompacto()) fechamentoSubmenu = setTimeout(() => {
            if (!grupoDashboards.contains(document.activeElement)) exibirSubmenu(false);
        }, 180);
    });
    submenuDashboards.addEventListener("pointerenter", () => clearTimeout(fechamentoSubmenu));
    grupoDashboards.addEventListener("focusout", event => {
        if (modoCompacto() && !grupoDashboards.contains(event.relatedTarget)) exibirSubmenu(false);
    });
    grupoDashboards.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            exibirSubmenu(false);
            botaoDashboards.focus();
        } else if (event.key === "ArrowDown" && event.target === botaoDashboards) {
            event.preventDefault();
            exibirSubmenu(true);
            submenuDashboards.querySelector("a[href], button").focus();
        }
    });
    document.addEventListener("click", event => {
        if (modoCompacto() && !grupoDashboards.contains(event.target)) exibirSubmenu(false);
    });
    menu.querySelector(".dashboard-navegacao").addEventListener("scroll", posicionarSubmenu);
    menu.addEventListener("transitionend", posicionarSubmenu);
    window.addEventListener("resize", posicionarSubmenu);
}

telaPequena.addEventListener("change", aplicarLarguraMenu);

aplicarLarguraMenu();
