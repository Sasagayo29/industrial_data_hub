# Arquivo: processing_worker/analysis/utils.py
import numpy as np

def create_sequences(data, time_steps=1):
    """
    Cria sequências (janelas) a partir de dados de sensores 2D (samples, features).
    """
    X = []
    if len(data) < time_steps:
         # Se os dados forem menores que a janela, retorna array vazio ou lida com padding
         # Por simplicidade, vamos retornar vazio por enquanto
         print(f"Aviso: Dados insuficientes ({len(data)}) para criar sequência de tamanho {time_steps}.")
         return np.array(X) # Retorna array vazio

    for i in range(len(data) - time_steps + 1):
        v = data[i:(i + time_steps)]
        X.append(v)
    return np.array(X)

def apply_padding(sequences, time_steps, n_features):
    """ Aplica padding com zeros no início se uma sequência for menor que time_steps. """
    # Esta função pode ser útil se create_sequences lidar com dados curtos
    # Por enquanto, vamos assumir que create_sequences retorna apenas janelas completas
    # ou que a lógica no worker lida com dados insuficientes.
    # No nosso caso do worker, processaremos o arquivo inteiro e depois faremos a previsão
    # nas sequências geradas, então o padding principal será na reconstrução
    # se o número de sequências for menor que o esperado, o que não deve ocorrer aqui.
    # O padding importante foi feito no notebook de teste (Célula 5 v2).
    # Aqui, vamos focar em criar as sequências do arquivo inteiro.
    pass # Placeholder