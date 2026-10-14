import psutil as p
import csv
import time
import os
import json
import requests
from datetime import datetime
from pathlib import Path

from utils.coleta import (
    numero_valido, salvar_leitura, nova_linha_metricas, diferenca_contador,
)
from cpu.coleta import (
    METRICAS_SELECIONAVEIS,
    INVENTARIO_CPU,
    IDS_CPU,
    MODOS_CPU,
    TAXAS_CPU,
    preparar_coleta_cpu,
    colunas_cpu,
    coletar_cpu,
    coletar_percentuais,
    coletar_modos,
    coletar_taxas,
    coletar_frequencias,
    coletar_inventario_fisico,
)
from ram.coleta import (
    IDS_RAM,
    ATRIBUTOS_RAM,
    ler_oom_linux,
    preparar_coleta_ram,
    colunas_ram,
    coletar_ram,
    coletar_oom,
)
from disco.coleta import (
    METRICAS_VOLUME,
    METRICAS_IO,
    IDS_DISCO,
    CAMPOS_INODES,
    ler_fila_linux,
    preparar_coleta_disco,
    campos_volumes,
    colunas_volumes,
    campos_io,
    colunas_io,
    descobrir_alvos_disco,
    coluna_disco,
    colunas_disco,
    coletar_disco_geral,
    marcar_campos_disco,
    coletar_inodes,
    coletar_volumes,
    salvar_taxa_disco,
    salvar_tempo_disco,
    coletar_io_disco,
)
from swap.coleta import (
    IDS_SWAP,
    preparar_coleta_swap,
    colunas_swap,
    coletar_swap,
    coletar_atividade_swap,
)
from carga.coleta import (
    IDS_CARGA,
    preparar_coleta_carga,
    colunas_carga,
    coletar_carga,
)
from rede.coleta import (
    GRUPOS_REDE,
    ATRIBUTOS_REDE,
    IDS_REDE,
    descobrir_interfaces_rede,
    preparar_coleta_rede,
    campos_rede,
    colunas_interface_rede,
    coluna_rede,
    colunas_rede,
    coletar_rede_geral,
    salvar_taxa_rede,
    coletar_rede,
)


# Configurar as variáveis de ambiente pra API pra cahamar commais facilidade posteriormente
API_BASE_URL = "http://localhost:3333"
API_FILTRO_URL = "http://localhost:3334"


# Token de instalação e token do perfil do servidor ficam salvos no arquivo de configuração
ARQUIVO_CONFIG = Path(__file__).with_name("config.json")


def obter_endereco_mac():
    interfaces = p.net_if_addrs()

    for nome_interface, enderecos in interfaces.items():
        for endereco in enderecos:

            # family é o tipo de endereço, p.AF_LINK é o tipo de endereço MAC
            if endereco.family == p.AF_LINK:
                if endereco.address and endereco.address != "00:00:00:00:00:00":
                    return endereco.address.upper()

    return None


# Função para carregar o arquivo de configuração
def carregar_config():
    if not os.path.exists(ARQUIVO_CONFIG):
        print(f"Arquivo de configuração '{ARQUIVO_CONFIG}' não encontrado.")
        exit()

    try:
        with open(ARQUIVO_CONFIG, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)

    except json.JSONDecodeError:
        print("O arquivo config.json possui um JSON inválido.")
        exit()


# Função para verificar se o node já está registrado
def ativar_agente(
    token_instalacao,
    token_perfil_servidor,
    endereco_mac
):
    dados = {
        "tokenInstalacaoServer": token_instalacao,
        "tokenPerfilServidorServer": token_perfil_servidor,
        "enderecoMacServer": endereco_mac
    }

    try:
        resposta = requests.post(
            f"{API_BASE_URL}/servidor/ativarAgente",
            json=dados
        )

        if resposta.status_code == 200:
            print(f"Agente ativado no MAC {endereco_mac}")
            return True

        print(f"Erro ao ativar agente ({resposta.status_code})")
        print(resposta.text)

        return False

    except requests.RequestException as erro:
        print(f"Falha de conexão com a API de ativação: {erro}")
        return False


def buscar_metricas_cliente(
    token_instalacao,
    token_perfil_servidor
):
    # Usa a nossa API pra pegar os "comando_parametro" que foram cadastrados pro perfil do servidor
    try:
        resposta = requests.get(
            f"{API_FILTRO_URL}/empresa/metricas",
            headers={
                "Authorization": f"Bearer {token_instalacao}",
                "token-perfil": token_perfil_servidor
            }
        )

        if resposta.status_code == 200:
            metricas = resposta.json()

            # Seleciona as métricas que vieram do model da empresa
            print(f"{len(metricas)} métricas carregadas.\n")

            return metricas

        print(
            f"Houve um erro ao consultar as métricas "
            f"({resposta.status_code})."
        )

        print(resposta.text)

        return []

    except requests.RequestException as erro:
        print(f"Falha de conexão com a API de métricas: {erro}")
        return []


# Converte os valores da coluna "argumento_valor" do banco para o que o psutil necessita
def converter_valor(valor):

    # Se não veio argumento, não converte
    if valor is None:
        return None

    # Verifica o tipo
    if not isinstance(valor, str):
        return valor

    # Remove espaços do início e do fim
    valor = valor.strip()

    if valor.lower() == "true":
        return True

    if valor.lower() == "false":
        return False

    if valor.lower() == "none":
        return None

    # Tenta converter para inteiro
    try:
        return int(valor)

    except ValueError:
        pass

    # Tenta convereter para float
    try:
        return float(valor)

    except ValueError:
        pass

    # Caso nenhuma conversão funcione, retorna como texto
    return valor


# {
#    "funcao_psutil": "cpu_count",
#    "argumento_nome": "logical",
#    "argumento_valor": "true"
# }
# Precisa virar -> p.cpu_count(logical=True)
#

# Monta os parâmetros que são enviados para a função do psutil
def montar_argumentos(metrica):
    nome = metrica.get("argumento_nome")

    valor = converter_valor(
        metrica.get("argumento_valor")
    )

    # Retorna um dicionário montado com o nome e o valor do argumento
    if nome is None:
        return {}

    return {
        nome: valor
    }


# Executa a função do psutil de forma dinâmica a partir da montagem dos argumentos
def executar_funcao(metrica, cache):
    nome_funcao = metrica["funcao_psutil"]

    argumentos = montar_argumentos(metrica)

    # Monta uma tupla que armazena a funcao e os argumentos para poder diferenciar a mesma função com argumentos diferentes
    # Exemplo: p.cpu_count(logical=True) e p.cpu_count(logical=False) são chamadas diferentes da mesma função
    chave_cache = (
        nome_funcao,

        # Ordena de forma crescente os valores da lista de argumentos e coloca em uma tupla para poder ser usada como chave do dicionário
        tuple(sorted(argumentos.items()))
    )

    # Caso a função ainda não tenha sido chamada, ele executa
    if chave_cache not in cache:

        # Executa a função de forma conceitual, onde o getattr acesso o atributo de um objeto usando o nome dele em forma de texto
        # nome_funcao = "cpu_percent"
        # funcao = p.cpu_percent
        funcao = getattr(
            p,
            nome_funcao
        )

        # **argumentos é equivalente a
        # argumentos = {
        #     "logical": True
        # }
        # assim funcao(**argumentos) é equivalente a funcao(logical=True)
        cache[chave_cache] = funcao(
            **argumentos
        )

    return cache[chave_cache]


# O retorno seria parecido com isso
# cache = {
#     ("virtual_memory", ()):
#         svmem(
#             total=16777216000,
#             available=8245000000,
#             percent=50.8,
#             used=7450000000,
#             free=2100000000
#         ),
#
#     (
#         "cpu_count",
#         (
#             ("logical", True),
#         )
#     ): 16,
#
#     (
#         "cpu_count",
#         (
#             ("logical", False),
#         )
#     ): 8
# }


# Verifica qual campo deve ser retornado da função do psutil
def extrair_retorno(
    resultado,
    metrica
):
    atributo = metrica.get(
        "atributo_retorno"
    )

    indice = metrica.get(
        "indice_retorno"
    )

    # Equivalente a resultado = resultado.atributo, porque algumas funções do psutil retornam objetos com atributos
    if atributo is not None:
        resultado = getattr(
            resultado,
            atributo
        )

    # Equivalente a resultado = resultado[indice], porque algumas funções do psutil retornam listas ou tuplas
    if indice is not None:
        resultado = resultado[indice]

    return resultado


def capturar_metrica(
    metrica,
    cache
):
    try:

        # Executa a função do psutil
        resultado = executar_funcao(
            metrica,
            cache
        )

        # Pega o valor específico desejado
        resultado = extrair_retorno(
            resultado,
            metrica
        )

        return resultado

    except (
        AttributeError,
        IndexError,
        TypeError,
        OSError
    ) as erro:

        print(
            f"Não foi possível capturar "
            f"{metrica['nome_coluna']}: "
            f"{erro}"
        )

        return None


# COLETA CPU: estas funções são chamadas pelo loop principal abaixo.

def capturar_dados(
    metricas,
    endereco_mac,
    estado_cpu,
    estado_ram,
    estado_swap=None,
    estado_carga=None
):
    # Criar um cache para armazenar os resultados a cada rodada e evitar chamadas repetidas
    cache = {}

    # A linha mistura horário/MAC (texto), medições (números) e campos vazios.
    dados: dict[str, str | int | float | None] = {
        "TIMESTAMP": datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        ),

        "ENDERECO_MAC": endereco_mac
    }

    for metrica in metricas:
        coluna = metrica["nome_coluna"]
        if coluna in IDS_CPU or coluna in IDS_RAM or coluna in IDS_DISCO or coluna in IDS_SWAP or coluna in IDS_CARGA or coluna in IDS_REDE:
            continue

        dados[coluna] = capturar_metrica(
            metrica,
            cache
        )

    dados.update(coletar_cpu(estado_cpu))
    dados.update(coletar_ram(estado_ram))
    if estado_swap is not None:
        dados.update(coletar_swap(estado_swap))
    if estado_carga is not None:
        dados.update(coletar_carga(estado_carga))
    return dados


def main():
    config = carregar_config()


    token_instalacao = config.get(
        "token_instalacao"
    )

    token_perfil_servidor = config.get(
        "token_perfil_servidor"
    )


    if token_instalacao is None:
        print(
            "Token de instalação não encontrado "
            "no arquivo de configuração."
        )

        exit()


    if token_perfil_servidor is None:
        print(
            "Token do perfil do servidor não encontrado "
            "no arquivo de configuração."
        )

        exit()


    endereco_mac = obter_endereco_mac()

    if endereco_mac is None:
        print(
            "Não foi possível identificar "
            "o endereço MAC da máquina."
        )

        exit()


    agente_ativado = ativar_agente(
        token_instalacao,
        token_perfil_servidor,
        endereco_mac
    )

    if not agente_ativado:
        print("Não foi possível ativar o agente.")
        exit()


    metricas = buscar_metricas_cliente(
        token_instalacao,
        token_perfil_servidor
    )

    if not metricas:
        print(
            "Nenhuma métrica configurada "
            "para este perfil."
        )

        exit()


    # Colunas padrão
    escolhas_metricas = []
    for metrica in metricas:
        escolhas_metricas.append(metrica["nome_coluna"])
    estado_cpu = preparar_coleta_cpu(escolhas_metricas)

    estado_ram = preparar_coleta_ram(escolhas_metricas)
    estado_disco = preparar_coleta_disco(escolhas_metricas)
    estado_swap = preparar_coleta_swap(escolhas_metricas)
    estado_carga = preparar_coleta_carga(escolhas_metricas)
    estado_rede = preparar_coleta_rede(escolhas_metricas)

    colunas = [
        "TIMESTAMP",
        "ENDERECO_MAC"
    ]


    # Colunas das métricas do banco
    colunas.extend(
        metrica["nome_coluna"]
        for metrica in metricas
        if metrica["nome_coluna"] not in IDS_CPU
        and metrica["nome_coluna"] not in IDS_RAM
        and metrica["nome_coluna"] not in IDS_DISCO
        and metrica["nome_coluna"] not in IDS_SWAP
        and metrica["nome_coluna"] not in IDS_CARGA
        and metrica["nome_coluna"] not in IDS_REDE
    )
    colunas.extend(colunas_cpu(estado_cpu))
    colunas.extend(colunas_ram(estado_ram))
    colunas.extend(colunas_swap(estado_swap))
    colunas.extend(colunas_carga(estado_carga))
    colunas.extend(colunas_rede(estado_rede))
    colunas.extend(colunas_disco(estado_disco))


    mac_arquivo = endereco_mac.replace(":", "-").upper()
    horario_arquivo = datetime.now().strftime("%Y-%m-%d_%H-%M-%S-%f")
    pasta = Path(__file__).parent
    caminho_coleta = pasta / f"coretrace_coleta_{mac_arquivo}_{horario_arquivo}.csv"
    with open(caminho_coleta, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=colunas)
        escritor.writeheader()

        try:
            while True:
                dados = capturar_dados(metricas, endereco_mac, estado_cpu, estado_ram, estado_swap, estado_carga)
                dados.update(coletar_rede_geral(estado_rede))
                dados.update(coletar_disco_geral(estado_disco))
                escritor.writerow(dados)
                arquivo.flush()
                print(f"{dados['TIMESTAMP']} - Captura salva para o MAC {endereco_mac}")
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nMonitoramento encerrado.")


if __name__ == "__main__":
    main()
