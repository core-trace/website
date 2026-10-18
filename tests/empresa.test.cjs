const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

// Só MySQL e envio externo são substituídos; controller, model e transação são reais.
function carregar(arquivo, dependencias) {
    const absoluto = path.resolve(__dirname, "..", arquivo);
    const modulo = { exports: {} };
    const requireOriginal = createRequire(absoluto);
    vm.runInNewContext(fs.readFileSync(absoluto, "utf8"), {
        module: modulo,
        require: nome => dependencias[nome] || requireOriginal(nome),
        process: { env: { RESEND_API_KEY: "chave-teste" } },
        console: { error() {} }
    }, { filename: absoluto });
    return modulo.exports;
}

function preparar(opcoes = {}) {
    const consultas = [];
    const eventos = [];
    const emails = [];
    const conexao = {
        async beginTransaction() { eventos.push("begin"); },
        async commit() { eventos.push("commit"); },
        async rollback() { eventos.push("rollback"); },
        release() { eventos.push("release"); },
        async execute(sql, parametros) {
            consultas.push({ sql, parametros: Array.from(parametros) });
            if (/SELECT/.test(sql) && /nivel_acesso/.test(sql)) {
                return [opcoes.semAdministrador ? [] : [{ id_nivel_acesso: 7 }]];
            }
            if (/INSERT INTO empresa/.test(sql)) {
                if (opcoes.duplicada) throw Object.assign(new Error("Duplicada"), { code: "ER_DUP_ENTRY" });
                return [{ insertId: 42 }];
            }
            if (/INSERT INTO usuario/.test(sql)) {
                if (opcoes.usuarioDuplicado) throw Object.assign(new Error("Duplicado"), { code: "ER_DUP_ENTRY" });
                return [{ insertId: 91 }];
            }
            if (/INSERT INTO endereco/.test(sql)) return [{ insertId: 19 }];
            throw new Error("Consulta inesperada: " + sql);
        }
    };
    const database = carregar("src/database/config.js", {
        "mysql2/promise": { createPool: () => ({ getConnection: async () => conexao }) }
    });
    const model = carregar("src/models/empresaModel.js", { "../database/config": database });
    const controller = carregar("src/controllers/empresaController.js", {
        "../models/empresaModel": model,
        "../services/emailService": {
            async enviarConvite(nome, email, token) {
                eventos.push("email");
                if (opcoes.falhaEmail) throw new Error("Resend indisponível");
                emails.push({ nome, email, token });
            }
        }
    });
    async function cadastrar(body) {
        const res = { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; }, json(dados) { this.body = dados; return this; } };
        await controller.cadastrar({ body }, res);
        return res;
    }
    return { cadastrar, consultas, eventos, emails };
}

function dadosValidos() {
    return {
        razaoSocial: " Empresa Exemplo ", cnpj: "12.345.678/0001-99",
        endereco: { logradouro: "Rua Um", numero: "10", cidade: "São Paulo", estado: "SP" },
        administrador: { nome: " Ana Silva ", email: " ana@example.com ", cpf: "", telefone: "" },
        empresa: 1, nivelAcesso: 3, tokenInstalacao: "token-forjado"
    };
}

test("cadastra empresa e administrador vinculado à nova empresa e envia convite compatível com ativação", async () => {
    const app = preparar();
    const resposta = await app.cadastrar(dadosValidos());
    assert.equal(resposta.statusCode, 201);
    assert.equal(resposta.body.id_empresa, 42);
    assert.equal(resposta.body.id_usuario, 91);
    const empresa = app.consultas.find(q => /INSERT INTO empresa/.test(q.sql));
    const usuario = app.consultas.find(q => /INSERT INTO usuario/.test(q.sql));
    assert.deepEqual(empresa.parametros.slice(0, 2), ["Empresa Exemplo", "12345678000199"]);
    assert.match(empresa.parametros[2], /^[a-f0-9]{64}$/);
    assert.match(empresa.sql, /CURDATE\(\)/);
    assert.deepEqual(usuario.parametros, ["Ana Silva", "ana@example.com", app.emails[0].token, null, null, 42, 7]);
    assert.match(usuario.sql, /PENDENTE/);
    assert.match(app.emails[0].token, /^[a-f0-9]{64}$/);
    assert.notEqual(app.emails[0].token, empresa.parametros[2]);
    assert.deepEqual(app.eventos, ["begin", "email", "commit", "release"]);
    assert.equal(JSON.stringify(resposta.body).includes(empresa.parametros[2]), false);
});

test("falha no Resend desfaz empresa, endereço e usuário na mesma transação", async () => {
    const app = preparar({ falhaEmail: true });
    const resposta = await app.cadastrar(dadosValidos());
    assert.equal(resposta.statusCode, 502);
    assert.deepEqual(app.eventos, ["begin", "email", "rollback", "release"]);
});

for (const opcoes of [{ duplicada: true }, { usuarioDuplicado: true }]) {
    test("duplicidade não deixa cadastro parcial: " + JSON.stringify(opcoes), async () => {
        const app = preparar(opcoes);
        assert.equal((await app.cadastrar(dadosValidos())).statusCode, 409);
        assert.deepEqual(app.eventos, ["begin", "rollback", "release"]);
        assert.equal(app.emails.length, 0);
    });
}

test("ausência do perfil Administrador impede cadastro", async () => {
    const app = preparar({ semAdministrador: true });
    assert.equal((await app.cadastrar(dadosValidos())).statusCode, 409);
    assert.equal(app.consultas.some(q => /INSERT/.test(q.sql)), false);
    assert.deepEqual(app.eventos, ["begin", "rollback", "release"]);
});

test("rejeita empresa sem administrador e campos inválidos antes de acessar o banco", async () => {
    for (const alterar of [
        d => { delete d.administrador; },
        d => { d.administrador.email = "invalido"; },
        d => { d.administrador.cpf = "123"; },
        d => { d.cnpj = "123"; },
        d => { d.razaoSocial = " "; },
        d => { d.endereco.numero = "12345678901"; }
    ]) {
        const app = preparar();
        const dados = dadosValidos();
        alterar(dados);
        assert.equal((await app.cadastrar(dados)).statusCode, 400);
        assert.equal(app.consultas.length, 0);
        assert.equal(app.emails.length, 0);
    }
});
