# --- ESTÁGIO 1: O "Builder" (Compilação) ---
# Usamos uma imagem oficial do Maven que já contém o JDK 21 (o mesmo do seu pom.xml)
FROM maven:3.9-eclipse-temurin-21 AS builder

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# 1. Copia o pom.xml PRIMEIRO
# (Isso aproveita o cache de camadas do Docker. Se o pom.xml não mudar,
# o Maven não precisa baixar todas as dependências de novo)
COPY pom.xml .

# 2. Baixa todas as dependências
# 'go-offline' baixa tudo para que o próximo passo seja rápido
RUN mvn dependency:go-offline

# 3. Copia o resto do código-fonte (src)
COPY src ./src

# 4. Compila o projeto e empacota em um .jar
# -DskipTests pula os testes (boa prática em builds de Docker)
# O resultado será algo como 'target/industrial-data-hub-0.0.1-SNAPSHOT.jar'
RUN mvn package -DskipTests


# --- ESTÁGIO 2: O "Runtime" (Execução) ---
# Usamos uma imagem "alpine", que é minúscula e contém apenas o JRE (Java Runtime)
FROM eclipse-temurin:21-jre-alpine

# Define o diretório de trabalho
WORKDIR /app

# Expõe a porta 8080 (a porta padrão do Spring Boot)
EXPOSE 8080

# Copia APENAS o .jar compilado do estágio "builder"
# O '/*.jar' pega o jar que o Maven criou, seja qual for o nome/versão.
# Nós o renomeamos para 'app.jar' para um comando de execução mais simples.
COPY --from=builder /app/target/*.jar app.jar

# Define o comando para executar a aplicação quando o contêiner iniciar
ENTRYPOINT ["java", "-jar", "app.jar"]