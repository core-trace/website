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
const loginRouter = require("./src/routes/login");
const conviteRouter = require("./src/routes/criarconviteRoutes");
const ativacaoRouter = require("./src/routes/ativacaoRoutes");
const employeeRouter = require("./src/routes/employees");
const usuarioRouter = require("./src/routes/usuarioRoutes");
const agenteRouter = require("./src/routes/agenteRoutes");
const servidorRouter = require("./src/routes/servidorRoutes");
const contatoRouter = require("./src/routes/contatoRoutes");


app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/convites", conviteRouter);
app.use("/ativar-conta", ativacaoRouter);

app.use(cors());

app.use("/", indexRouter);
app.use("/user", loginRouter);
app.use("/employee", employeeRouter);
app.use("/usuario", usuarioRouter);
app.use("/agente", agenteRouter);
app.use("/servidor", servidorRouter);
app.use("/contato", contatoRouter);

app.listen(PORTA_APP, function () {
    console.log(`Servidor rodando: http://${HOST_APP}:${PORTA_APP}`);
});
