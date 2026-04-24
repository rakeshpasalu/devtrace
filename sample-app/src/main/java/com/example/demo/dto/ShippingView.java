package com.example.demo.dto;

public record ShippingView(
        Long orderId,
        String shipmentState,
        String provider
) {
}

