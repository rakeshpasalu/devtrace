package com.example.demo.config;

import com.example.demo.domain.OrderEntity;
import com.example.demo.repository.OrderRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SampleDataInitializer {
    @Bean
    CommandLineRunner seedOrders(OrderRepository repository) {
        return args -> {
            if (repository.count() > 0) {
                return;
            }
            repository.save(new OrderEntity("Alice", "Spring in Action", "NEW", 42.0));
            repository.save(new OrderEntity("Bob", "Observability Handbook", "PROCESSING", 64.5));
            repository.save(new OrderEntity("Carol", "JVM Anatomy", "PROCESSING", 88.9));
        };
    }
}
