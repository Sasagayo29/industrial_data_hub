package com.idh.industrial_data_hub.config; // Pacote correto

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration // Indica que esta classe contém configurações do Spring
public class WebConfig {

    @Bean // Cria um 'Bean' (objeto gerenciado pelo Spring) com as configurações CORS
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**") // Aplica CORS para todos os caminhos que começam com /api/
                    .allowedOrigins("http://localhost:5173") // PERMITE requisições da sua aplicação React
                    .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS") // Métodos HTTP permitidos
                    .allowedHeaders("*") // Permite todos os cabeçalhos
                    .allowCredentials(true); // Permite envio de cookies/autenticação (se necessário no futuro)
            }
        };
    }
}