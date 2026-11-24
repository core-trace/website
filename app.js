// const ambiente_processo = 'producao';
const ambiente_processo = "desenvolvimento";

const caminho_env = ambiente_processo === "producao" ? ".env" : ".env.dev";

require("dotenv").config({ path: caminho_env });

const express = require("express");
const cors = require("cors");
const path = require("path");

const PORTA_APP = process.env.APP_PORT;
const HOST_APP = process.env.APP_HOST;

const app = express();

const indexRouter = require("./src/routes/index");
const conviteRouter = require("./src/routes/criarconviteRoutes");
const ativacaoRouter = require("./src/routes/ativacaoRoutes");
const usuarioRouter = require("./src/routes/usuarioRoutes");
const agenteRouter = require("./src/routes/agenteRoutes");
const servidorRouter = require("./src/routes/servidorRoutes");
const contatoRouter = require("./src/routes/contatoRoutes");
const empresaRouter = require("./src/routes/empresaRoutes");
const alertaRouter = require("./src/routes/alertaRoutes");
const geralRouter = require("./src/routes/geralRoutes");
const resumoGeralService = require("./src/services/resumoGeralService");
const sinaisExternosService = require("./src/services/sinaisExternosService");
const servidoresRouter = require("./src/routes/servidoresRoutes");
const s3Routes =  require("./src/routes/s3Routes");
const processosRouter = require("./src/routes/processosRoutes");


app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/convites", conviteRouter);
app.use("/ativar-conta", ativacaoRouter);

app.use(cors());

app.use("/", indexRouter);
app.use("/usuario", usuarioRouter);
app.use("/agente", agenteRouter);
app.use("/servidor", servidorRouter);
app.use("/contato", contatoRouter);
app.use("/empresa", empresaRouter);
app.use("/s3Routes", s3Routes);
app.use("/alertas", alertaRouter);
app.use("/geral", geralRouter);
app.use("/processos", processosRouter);

// Mantem o resumo da dashboard Geral atualizado em segundo plano, em vez de buscar
// no S3 a cada requisicao (ver comentario no topo de resumoGeralService.js).
resumoGeralService.iniciar();
sinaisExternosService.iniciar();

app.listen(PORTA_APP, function () {
    console.log(`Servidor rodando: http://${HOST_APP}:${PORTA_APP}`);
});
