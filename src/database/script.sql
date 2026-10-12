-- CORETRACE - CRIACAO COMPLETA DO BANCO (VERSAO ATUALIZADA)
-- ATENCAO: Este script apaga e recria o banco coretrace.
-- Credenciais de exemplo apenas para desenvolvimento local.
-- Empresa: token_instalacao = 123
-- Perfil Produção: token_perfil_servidor = 321

DROP DATABASE IF EXISTS coretrace;
CREATE DATABASE coretrace;
USE coretrace;

CREATE TABLE empresa (
    id_empresa INT AUTO_INCREMENT PRIMARY KEY,
    razao_social VARCHAR(45) NOT NULL,
    cnpj VARCHAR(45) NOT NULL UNIQUE,
    dt_registro DATE,
    token_instalacao VARCHAR(255) UNIQUE
);

CREATE TABLE endereco (
    id_endereco INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(10),
    cidade VARCHAR(45),
    estado VARCHAR(45),
    logradouro VARCHAR(100),
    fk_empresa INT NOT NULL,
    FOREIGN KEY (fk_empresa) REFERENCES empresa(id_empresa)
);

CREATE TABLE nivel_acesso (
    id_nivel_acesso INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(45) NOT NULL,
    descricao VARCHAR(255)
);

CREATE TABLE permissoes (
    id_permissao INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(45) NOT NULL,
    descricao VARCHAR(45)
);

CREATE TABLE nivel_acesso_permissoes (
    fk_nivel_acesso INT NOT NULL,
    fk_permissao INT NOT NULL,
    FOREIGN KEY (fk_nivel_acesso) REFERENCES nivel_acesso(id_nivel_acesso),
    FOREIGN KEY (fk_permissao) REFERENCES permissoes(id_permissao)
);

CREATE TABLE usuario (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(45) NOT NULL,
    email VARCHAR(45) NOT NULL UNIQUE,
    senha VARCHAR(45),
    cpf CHAR(11) UNIQUE,
    token_acesso VARCHAR(255),
    telefone VARCHAR(45),
    fk_empresa INT NOT NULL,
    fk_nivel_acesso INT NOT NULL,
    status VARCHAR(45),
    FOREIGN KEY (fk_empresa) REFERENCES empresa(id_empresa),
    FOREIGN KEY (fk_nivel_acesso) REFERENCES nivel_acesso(id_nivel_acesso)
);

CREATE TABLE perfil_servidor (
    id_perfil_servidor INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao VARCHAR(500),
    token_perfil_servidor VARCHAR(255) UNIQUE NOT NULL,
    sistema_operacional VARCHAR(10) NOT NULL DEFAULT 'linux',
    monitorar_docker BOOLEAN NOT NULL DEFAULT FALSE,
    fk_empresa INT NOT NULL,
    FOREIGN KEY (fk_empresa) REFERENCES empresa(id_empresa)
);

CREATE TABLE usuario_perfil_servidor (
    fk_usuario INT NOT NULL,
    fk_perfil_servidor INT NOT NULL,
    papel VARCHAR(20) NOT NULL DEFAULT 'visualizador',
    FOREIGN KEY (fk_usuario) REFERENCES usuario(id_usuario),
    FOREIGN KEY (fk_perfil_servidor) REFERENCES perfil_servidor(id_perfil_servidor)
);

CREATE TABLE servidores (
    id_servidor INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(45) NOT NULL,
    status VARCHAR(45),
    endereco_mac VARCHAR(17) UNIQUE NOT NULL,
    fk_perfil_servidor INT NOT NULL,
    FOREIGN KEY (fk_perfil_servidor) REFERENCES perfil_servidor(id_perfil_servidor)
);

CREATE TABLE container (
    id_container INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(45) NOT NULL,
    status VARCHAR(45),
    fk_servidor INT NOT NULL,
    FOREIGN KEY (fk_servidor) REFERENCES servidores(id_servidor)
);

CREATE TABLE componentes (
    id_componente INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    nome_coluna VARCHAR(100) NOT NULL UNIQUE,
    funcao_psutil VARCHAR(100) NOT NULL,
    argumento_nome VARCHAR(100),
    argumento_valor VARCHAR(100),
    atributo_retorno VARCHAR(100),
    indice_retorno INT,
    unidade VARCHAR(45)
);

CREATE TABLE componentes_perfil (
    fk_componente INT NOT NULL,
    fk_perfil_servidor INT NOT NULL,
    limite_atencao DOUBLE,
    limite_critico DOUBLE,
    operador VARCHAR(2) NOT NULL DEFAULT '>',
    FOREIGN KEY (fk_componente) REFERENCES componentes(id_componente),
    FOREIGN KEY (fk_perfil_servidor) REFERENCES perfil_servidor(id_perfil_servidor)
);

-- DADOS PARA TESTES
INSERT INTO empresa (razao_social, cnpj, dt_registro, token_instalacao)
VALUES ('CoreTrace Empresa Teste', '12345678000199', CURDATE(), '123');

INSERT INTO endereco (numero, cidade, estado, logradouro, fk_empresa)
VALUES ('100', 'São Paulo', 'SP', 'Avenida Paulista', 1);

INSERT INTO nivel_acesso (nome, descricao) VALUES
('Administrador', 'Acesso completo ao sistema'),
('Operador', 'Acesso ao monitoramento dos servidores'),
('Visualizador', 'Acesso somente para visualização');

INSERT INTO permissoes (nome, descricao) VALUES
('GERENCIAR_USUARIOS', 'Gerenciar usuários'),
('GERENCIAR_PERFIS', 'Gerenciar perfis'),
('GERENCIAR_SERVIDORES', 'Gerenciar servidores'),
('VISUALIZAR_MONITORAMENTO', 'Visualizar monitoramento'),
('VISUALIZAR_ALERTAS', 'Visualizar alertas');

INSERT INTO nivel_acesso_permissoes (fk_nivel_acesso, fk_permissao) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
(2, 3), (2, 4), (2, 5),
(3, 4), (3, 5);

INSERT INTO perfil_servidor (nome, descricao, token_perfil_servidor, fk_empresa)
VALUES ('Produção', 'Perfil dos servidores do ambiente de produção', '321', 1);

INSERT INTO servidores (nome, endereco_mac, status, fk_perfil_servidor) VALUES
('Servidor Produção 01', 'AA:BB:CC:DD:EE:01', 'ATIVO', 1),
('Servidor Produção 02', 'AA:BB:CC:DD:EE:02', 'ATIVO', 1);

INSERT INTO container (nome, status, fk_servidor) VALUES
('coretrace-api', 'ATIVO', 1),
('coretrace-banco', 'ATIVO', 1),
('coretrace-web', 'ATIVO', 2);

INSERT INTO componentes
(nome, nome_coluna, funcao_psutil, argumento_nome, argumento_valor, atributo_retorno, indice_retorno, unidade)
VALUES
('Uso de CPU', 'cpu_percent', 'cpu_percent', 'interval', '1', NULL, NULL, '%'),
('CPU Usuário', 'cpu_user', 'cpu_times_percent', 'interval', '1', 'user', NULL, '%'),
('CPU Sistema', 'cpu_system', 'cpu_times_percent', 'interval', '1', 'system', NULL, '%'),
('CPU Ociosa', 'cpu_idle', 'cpu_times_percent', 'interval', '1', 'idle', NULL, '%'),
('Frequência Atual da CPU', 'cpu_freq_current', 'cpu_freq', NULL, NULL, 'current', NULL, 'MHz'),
('Frequência Mínima da CPU', 'cpu_freq_min', 'cpu_freq', NULL, NULL, 'min', NULL, 'MHz'),
('Frequência Máxima da CPU', 'cpu_freq_max', 'cpu_freq', NULL, NULL, 'max', NULL, 'MHz'),
('Núcleos Físicos', 'cpu_count_physical', 'cpu_count', 'logical', 'False', NULL, NULL, 'núcleos'),
('Núcleos Lógicos', 'cpu_count_logical', 'cpu_count', 'logical', 'True', NULL, NULL, 'núcleos'),
('RAM Total', 'ram_total', 'virtual_memory', NULL, NULL, 'total', NULL, 'bytes'),
('RAM Disponível', 'ram_available', 'virtual_memory', NULL, NULL, 'available', NULL, 'bytes'),
('RAM Utilizada', 'ram_used', 'virtual_memory', NULL, NULL, 'used', NULL, 'bytes'),
('RAM Livre', 'ram_free', 'virtual_memory', NULL, NULL, 'free', NULL, 'bytes'),
('Uso de RAM', 'ram_percent', 'virtual_memory', NULL, NULL, 'percent', NULL, '%'),
('Disco Total', 'disk_total', 'disk_usage', 'path', '/', 'total', NULL, 'bytes'),
('Disco Utilizado', 'disk_used', 'disk_usage', 'path', '/', 'used', NULL, 'bytes'),
('Disco Livre', 'disk_free', 'disk_usage', 'path', '/', 'free', NULL, 'bytes'),
('Uso de Disco', 'disk_percent', 'disk_usage', 'path', '/', 'percent', NULL, '%'),
('Swap Total', 'swap_total', 'swap_memory', NULL, NULL, 'total', NULL, 'bytes'),
('Swap Utilizada', 'swap_used', 'swap_memory', NULL, NULL, 'used', NULL, 'bytes'),
('Swap Livre', 'swap_free', 'swap_memory', NULL, NULL, 'free', NULL, 'bytes'),
('Uso de Swap', 'swap_percent', 'swap_memory', NULL, NULL, 'percent', NULL, '%'),
('Swap Entrada', 'swap_sin', 'swap_memory', NULL, NULL, 'sin', NULL, 'bytes'),
('Swap Saída', 'swap_sout', 'swap_memory', NULL, NULL, 'sout', NULL, 'bytes');

INSERT INTO componentes_perfil
(fk_componente, fk_perfil_servidor, limite_atencao, limite_critico)
VALUES
(1, 1, 70.00, 90.00),
(2, 1, NULL, NULL),
(3, 1, NULL, NULL),
(4, 1, NULL, NULL),
(5, 1, NULL, NULL),
(6, 1, NULL, NULL),
(7, 1, NULL, NULL),
(8, 1, NULL, NULL),
(9, 1, NULL, NULL),
(10, 1, NULL, NULL),
(11, 1, NULL, NULL),
(12, 1, NULL, NULL),
(13, 1, NULL, NULL),
(14, 1, 75.00, 90.00),
(15, 1, NULL, NULL),
(16, 1, NULL, NULL),
(17, 1, NULL, NULL),
(18, 1, 80.00, 95.00),
(19, 1, NULL, NULL),
(20, 1, NULL, NULL),
(21, 1, NULL, NULL),
(22, 1, 50.00, 80.00),
(23, 1, NULL, NULL),
(24, 1, NULL, NULL);

INSERT INTO usuario
(nome, email, senha, cpf, token_acesso, telefone, fk_empresa, fk_nivel_acesso, status)
VALUES ('Administrador CoreTrace', 'admin@coretrace.com', '123456', '12345678900', NULL, '11999999999', 1, 1, 'ATIVO');

INSERT INTO usuario_perfil_servidor (fk_usuario, fk_perfil_servidor)
VALUES (1, 1);

-- CONSULTAS DE TESTE
SELECT * FROM usuario;
SELECT DISTINCT
    comp.nome, comp.nome_coluna, comp.funcao_psutil,
    comp.argumento_nome, comp.argumento_valor,
    comp.atributo_retorno, comp.indice_retorno, comp.unidade,
    cp.limite_atencao, cp.limite_critico, cp.operador
FROM servidores s
JOIN perfil_servidor ps ON ps.id_perfil_servidor = s.fk_perfil_servidor
JOIN componentes_perfil cp ON cp.fk_perfil_servidor = ps.id_perfil_servidor
JOIN componentes comp ON comp.id_componente = cp.fk_componente
WHERE s.endereco_mac = 'AA:BB:CC:DD:EE:01';

SELECT * FROM perfil_servidor;
SELECT * FROM componentes_perfil WHERE fk_perfil_servidor = 1;
SELECT * FROM componentes_perfil;
