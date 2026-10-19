// Catálogo de páginas: concessões de acesso são consultadas exclusivamente no banco.
const grupos = [
    { titulo: "Monitoramento", itens: [
        { rotulo: "Dashboard", href: "/pages/inicioDashboard.html", icone: "/assets/icons/dashboard.png", permissao: "VISUALIZAR_DASHBOARD" },
        { rotulo: "Alertas", href: "/pages/alertas.html", icone: "/assets/icons/sino.png", permissao: "VISUALIZAR_ALERTAS" }
    ] },
    { titulo: "Gestão", itens: [
        { rotulo: "Perfis de servidor", href: "/pages/perfisServidor.html", icone: "/assets/icons/perfil.png", permissao: "ACESSAR_PERFIS_SERVIDOR" },
        { rotulo: "Equipe e acessos", href: "/pages/general-employee.html", icone: "/assets/icons/pessoas.png", permissao: "ACESSAR_EQUIPE" }
    ] },
    { titulo: "Administrador CoreTrace", itens: [
        { rotulo: "Empresas", href: "/pages/empresas.html", icone: "/assets/icons/empresa.svg", permissao: "ACESSAR_EMPRESAS" }
    ] }
];

function paraUsuario(usuario) {
    return grupos.map(grupo => ({
        titulo: grupo.titulo,
        itens: grupo.itens.filter(item => usuario.permissoes.includes(item.permissao))
            .map(({ permissao, ...item }) => item)
    })).filter(grupo => grupo.itens.length > 0);
}

module.exports = { paraUsuario };
