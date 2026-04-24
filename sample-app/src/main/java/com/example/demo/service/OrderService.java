package com.example.demo.service;

import com.example.demo.domain.OrderEntity;
import com.example.demo.dto.OrderView;
import com.example.demo.dto.ShippingView;
import com.example.demo.repository.OrderRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.CompletableFuture;

@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final ExternalShippingClient externalShippingClient;
    private final InventoryService inventoryService;

    public OrderService(OrderRepository orderRepository, ExternalShippingClient externalShippingClient, InventoryService inventoryService) {
        this.orderRepository = orderRepository;
        this.externalShippingClient = externalShippingClient;
        this.inventoryService = inventoryService;
    }

    public OrderView loadOrder(Long id) {
        OrderEntity order = orderRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Order " + id + " was not found"));

        ShippingView shippingView = externalShippingClient.fetchShipment(id);
        CompletableFuture<String> asyncResult = inventoryService.warmInventory(id);

        return new OrderView(
                order.getId(),
                order.getCustomerName(),
                order.getItemName(),
                order.getStatus(),
                order.getTotalPrice(),
                shippingView.shipmentState(),
                asyncResult.join()
        );
    }

    public List<OrderEntity> findByStatus(String status) {
        return orderRepository.findByStatus(status);
    }
}

