package com.example.demo.service;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

@Service
public class InventoryService {
    @Async("traceExecutor")
    public CompletableFuture<String> warmInventory(Long orderId) {
        try {
            Thread.sleep(120);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return CompletableFuture.completedFuture("INTERRUPTED");
        }
        return CompletableFuture.completedFuture("CACHE_WARMED_FOR_" + orderId);
    }
}

