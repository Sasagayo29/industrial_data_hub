package com.idh.industrial_data_hub.config;

import org.springframework.amqp.core.Queue; // Import para Queue
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter; // Import para JSON
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    // Nome da nossa fila de análise
    public static final String ANALYSIS_QUEUE_NAME = "analysis_queue";

    // Cria o 'Bean' da fila. Se a fila não existir no RabbitMQ, ela será criada.
    @Bean
    public Queue analysisQueue() {
        // durable=true significa que a fila sobrevive a reinicializações do RabbitMQ
        return new Queue(ANALYSIS_QUEUE_NAME, true); 
    }

    // Configura o conversor de mensagens para usar JSON automaticamente
    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    // Configura o RabbitTemplate (ferramenta para enviar mensagens) para usar JSON
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(jsonMessageConverter()); // Usa o conversor JSON
        return rabbitTemplate;
    }
}