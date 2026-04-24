package com.example.demo.dto;

public record OrderView(
        Long id,
        String customerName,
        String itemName,
        String status,
        double totalPrice,
        String shippingState,
        String inventoryRefreshState
) {
}

