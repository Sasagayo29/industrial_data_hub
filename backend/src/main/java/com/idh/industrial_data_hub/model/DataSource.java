package com.idh.industrial_data_hub.model;

import java.time.LocalDateTime; // Pacote padrão para JPA com Spring Boot 3+

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column; // Se você adicionou Lombok
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity // Indica que esta classe é uma entidade JPA (mapeada para uma tabela)
@Table(name = "data_sources") // Especifica o nome da tabela no banco de dados
@Data // Lombok: Gera automaticamente getters, setters, toString, equals, hashCode
@NoArgsConstructor // Lombok: Gera um construtor sem argumentos
@AllArgsConstructor // Lombok: Gera um construtor com todos os argumentos
public class DataSource {

    @Id // Marca este campo como a chave primária
    @GeneratedValue(strategy = GenerationType.IDENTITY) // Usa a estratégia de auto-incremento do MySQL
    private Long id;

    @Column(nullable = false, unique = true) // Coluna não pode ser nula e deve ser única
    private String name;

    @Column(nullable = false, length = 50) // Coluna não pode ser nula, limita o tamanho
    private String sourceType; // Ex: 'CSV_UPLOAD', 'DATABASE_QUERY'

    @Column(length = 1024) // Limita o tamanho (pode ajustar se necessário)
    private String location; // Caminho do arquivo, URL, etc.

    @Lob // Indica que este campo pode ser grande (mapeia para TEXT no MySQL)
    @Column(columnDefinition = "TEXT") // Especifica o tipo de coluna (opcional, mas bom para clareza)
    private String description;

    @CreationTimestamp // Hibernate preenche automaticamente com a data/hora de criação
    @Column(nullable = false, updatable = false) // Não pode ser nulo, não atualizável
    private LocalDateTime createdAt;

    @UpdateTimestamp // Hibernate preenche automaticamente com a data/hora da última atualização
    @Column(nullable = false) // Não pode ser nulo
    private LocalDateTime updatedAt;

    // --- Construtores, Getters e Setters ---
    // Se você NÃO estiver usando Lombok, precisará adicionar manualmente:
    // - Um construtor vazio (public DataSource() {})
    // - Getters e Setters para todos os campos (getId(), setId(), getName(), setName(), ...)
    // - (Opcional) toString(), equals(), hashCode()

}
