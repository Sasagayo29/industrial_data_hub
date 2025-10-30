# --- ESTÁGIO 1: O "Builder" (Instalação de Dependências) ---
# Usamos a imagem oficial 'slim' do Python 3.10 (compatível com TensorFlow)
# Você pode ajustar para 3.11 se preferir: python:3.11-slim
FROM python:3.10-slim AS builder

# Define o diretório de trabalho
WORKDIR /app

# Instala quaisquer dependências de sistema operacional necessárias
# (h5py, usado pelo TensorFlow, pode precisar disso)
RUN apt-get update && apt-get install -y \
    libhdf5-dev \
    && rm -rf /var/lib/apt/lists/*

# Copia o arquivo de requisitos PRIMEIRO
COPY requirements.txt .

# Instala as dependências Python
# --no-cache-dir economiza espaço na imagem
RUN pip install --no-cache-dir -r requirements.txt


# --- ESTÁGIO 2: O "Runtime" (Execução) ---
# Começamos de uma imagem 'slim' limpa para manter o tamanho pequeno
FROM python:3.10-slim

WORKDIR /app

# Copia o ambiente virtual instalado (as bibliotecas) do estágio 'builder'
# O caminho exato pode variar um pouco, mas geralmente é este
COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages

# Copia o código da nossa aplicação
# (worker.py, config.py se houver, etc.)
COPY . .

# Define o comando que será executado quando o contêiner iniciar
# '-u' (unbuffered) garante que os 'prints' do Python apareçam nos logs do Docker em tempo real
CMD ["python", "-u", "worker.py"]