# <div align="center"><em>website</em></div>

### 1. Clone o repositório

```bash
git clone https://github.com/Core-Trace/CoreTrace-website.git
```

### 2. Acesse o diretorio do projeto

```bash
cd CoreTrace-website
```

### 3. Instale as dependências

```bash
npm install / npm i
```

### 4. Configure as variáveis de ambiente

```
AMBIENTE_PROCESSO=desenvolvimento

DB_HOST=''
DB_DATABASE=''
DB_USER=''
DB_PASSWORD=''
DB_PORT=''

APP_PORT=''
APP_HOST=''
```

### 5. Inicie o projeto

```bash
npm start
```

### Rotas da tabela `usuario`

`POST /usuario/cadastrar` recebe JSON no padrão dos outros controllers:

```json
{
  "nomeServer": "Ana Silva",
  "emailServer": "ana@empresa.com",
  "senhaServer": "senha123",
  "cpfServer": "12345678901",
  "telefoneServer": "11999999999",
  "empresaServer": 1,
  "nivelAcessoServer": 2
}
```

CPF e telefone são opcionais. A empresa e o nível de acesso precisam existir
nas tabelas `empresa` e `nivel_acesso`. O cadastro cria o usuário com status `ATIVO`.

`POST /usuario/autenticar` recebe:

```json
{
  "emailServer": "ana@empresa.com",
  "senhaServer": "senha123"
}
```

O login aceita usuários ativos e retorna `id_usuario`, `nome`, `email`,
`fk_empresa`, `fk_nivel_acesso` e `status`.

### Download do agente

Após o login, o botão **Baixar agente** no dashboard envia
`sessionStorage.ID_EMPRESA` e o perfil de servidor `1` (fixo para teste) para
`POST /agente/download`:

```json
{
  "id_empresa": 1,
  "id_perfil_servidor": 1
}
```

A rota consulta `empresa.token_instalacao` e `perfil_servidor.token_perfil_servidor`,
verificando se o perfil pertence à empresa. O [Archiver](https://www.archiverjs.com/docs/quickstart/)
gera `agente.zip` com a pasta `agente` e seu `config.json` preenchido com esses tokens.
O arquivo de configuração original permanece como modelo para os próximos downloads.
Caches Python e `node_modules` ficam fora do ZIP.

O banco deve conter a coluna `perfil_servidor.token_perfil_servidor`, conforme
`src/database/script.sql`. Para uma instalação anterior que ainda não tem essa coluna,
`src/database/atualizar_token_perfil_servidor.sql` adiciona os tokens preservando os registros.

### Ativação do agente Python

`POST /servidor/ativarAgente` recebe os campos enviados por `captura.py`:

```json
{
  "tokenInstalacaoServer": "123",
  "tokenPerfilServidorServer": "321",
  "enderecoMacServer": "AA:BB:CC:DD:EE:01"
}
```

A rota valida os tokens em `empresa` e `perfil_servidor`, conforme `src/database/script.sql`.
Se o MAC ainda não existir, cadastra em `servidores` com nome `Servidor <MAC>` e status `ATIVO`.
Se já pertencer ao mesmo perfil, atualiza seu status para `ATIVO` sem duplicar o cadastro.
Ambos os casos retornam HTTP `200`, como o Python espera. Um MAC de outro perfil retorna `409`;
tokens inválidos retornam `403` e campos ausentes ou inválidos retornam `400`.

### Página de teste: cadastro com convite por email

Com `npm start`, abra `http://localhost:3333/pages/cadastro-teste.html`
(ajuste a porta conforme o `.env.dev`). A página é HTML simples, sem CSS.

Preencha nome, email, CPF e telefone (opcionais), ID da empresa e ID do nível
de acesso. A empresa e o nível precisam existir no banco.

O formulário usa `POST /convites/criarConvite`. O usuário é criado como `PENDENTE`,
com `token_acesso` gerado no servidor. O Resend envia o link para definir a senha
na página de ativação. Ao concluir, o status muda para `ATIVO`, o token é removido
e o usuário pode fazer login.

Configure no `.env.dev`:

```dotenv
RESEND_API_KEY=sua_chave_do_resend
RESEND_FROM=seu_remetente_no_resend
APP_URL=http://localhost:3333
```

`RESEND_FROM` é opcional e usa `onboarding@resend.dev` por padrão. Esse remetente
de teste só envia ao email da própria conta Resend. Para enviar a outras pessoas,
configure um remetente de um domínio verificado, conforme a
[documentação do Resend](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

`APP_URL` define o endereço do site no link do email; use uma URL acessível ao destinatário para
ativação em outro dispositivo. Sem `APP_URL`, são usados `APP_HOST` e `APP_PORT`.

Se o Resend recusar o envio, o cadastro pendente é desfeito para permitir nova
tentativa. A página só confirma o envio após o Resend aceitar a solicitação.

### Perfis de servidor e wizard

Na página `/pages/inicioDashboard.html`, “Criar perfil de servidor” abre o modal
de cadastro. O link “Perfis de servidor” leva a `/pages/perfisServidor.html`,
que lista os perfis com `GET /servidor/perfis?empresa=<ID_EMPRESA>` usando a empresa
do `sessionStorage`. A consulta retorna nome, descrição e quantidade de servidores
vinculados; uma lista vazia e um erro de conexão têm estados distintos na tela.

O botão “Adicionar perfil de servidor” abre o mesmo modal, definido em
`public/components/wizardPerfilServidor.html`, com CSS e JavaScript próprios.
As cinco etapas são enviadas juntas em `POST /servidor/perfis`. O cadastro salva
nome, descrição, sistema operacional, opção de Docker, métricas, limites de alerta
e equipe em uma transação. O token do perfil é gerado no servidor.

A estrutura necessária para o wizard está definida em `src/database/script.sql`.
Não use o script de criação para atualizar um banco existente: ele apaga os dados.

Exemplo do corpo do cadastro:

```json
{
  "empresa": 1,
  "proprietario": 1,
  "nome": "Produção",
  "descricao": "Servidores da aplicação",
  "sistemaOperacional": "linux",
  "monitorarDocker": false,
  "metricas": [{ "id": 1, "operador": ">", "atencao": 70, "critico": 90 }],
  "equipe": [{ "id": 2, "papel": "visualizador" }]
}
```

O proprietário deve estar ativo e pertencer à empresa. Na etapa Equipe, selecione
um colaborador pelo nome e email e clique em Adicionar. A busca usa
`GET /servidor/membros-disponiveis?empresa=1&proprietario=1&perfil=0`.
O perfil `0` representa um cadastro novo. Para um perfil existente, informe seu ID:
a consulta exclui quem já está em `usuario_perfil_servidor`. Também exclui o
proprietário, usuários inativos e usuários de outras empresas. Quem já foi
selecionado no formulário sai das opções até ser removido da equipe.
Os papéis são armazenados no vínculo com o perfil, sem alterar o nível global do
usuário. Alertas aceitam `>`, `>=`, `<` e `<=`; ambos os limites podem ser `null`.
A resposta `201` contém `mensagem` e `id_perfil_servidor`; erros de validação retornam `400`,
proprietário inválido retorna `403` e falhas de persistência retornam `500`.

Após salvar, o formulário é limpo e a lista de perfis é atualizada. Em caso de erro,
o preenchimento é preservado para correção. A opção de Docker e os operadores são
persistidos; sua execução pelo agente não faz parte desta rota.

A aplicação atual usa IDs enviados pelo cliente, sem sessão autenticada no backend.
A validação de vínculo desta rota segue esse padrão e não substitui autenticação.

O login direciona para `/pages/inicioDashboard.html`. A navbar usa os dados do
`sessionStorage` para mostrar nome, iniciais e nível de acesso. O menu da conta
mostra email, empresa e status. O nome da empresa e o nível de acesso vêm dos
joins com `empresa` e `nivel_acesso` na consulta de login.
