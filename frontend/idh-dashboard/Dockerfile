# --- ESTÁGIO 1: O "Builder" (Compilação do React) ---
# Usamos uma imagem 'alpine' do Node.js (v20 é uma boa versão LTS)
# 'AS builder' dá um nome a este estágio
FROM node:20-alpine AS builder

# Define o diretório de trabalho
WORKDIR /app

# Copia o package.json e package-lock.json
# Isso aproveita o cache do Docker - 'npm install' só roda se esses arquivos mudarem
COPY package.json package-lock.json ./

# Instala as dependências do projeto
RUN npm install

# Copia o resto do código-fonte do React (src, public, etc.)
COPY . .

# Roda o script de build do Vite (que você está usando)
# Isso gera os arquivos estáticos na pasta /dist
RUN npm run build


# --- ESTÁGIO 2: O "Server" (Servidor Web Nginx) ---
# Usamos a imagem oficial 'alpine' do Nginx, que é minúscula
FROM nginx:1.27-alpine

# Remove a configuração padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia nossa configuração personalizada do Nginx (que criaremos a seguir)
# (Assumindo que criaremos nginx.conf na mesma pasta do Dockerfile)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos estáticos (HTML, JS, CSS) do estágio 'builder'
# A pasta 'dist' é o padrão de saída do Vite
COPY --from=builder /app/dist /usr/share/nginx/html

# Expõe a porta 80 (porta padrão do Nginx)
EXPOSE 80

# Comando para iniciar o Nginx (em modo "foreground" para o Docker)
CMD ["nginx", "-g", "daemon off;"]