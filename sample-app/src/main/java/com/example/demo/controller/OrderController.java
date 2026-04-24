package com.example.demo.controller;

import com.example.demo.domain.OrderEntity;
import com.example.demo.dto.OrderView;
import com.example.demo.service.OrderService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/{id}")
    public OrderView getOrder(@PathVariable("id") Long id) {
        return orderService.loadOrder(id);
    }

    @GetMapping("/status/{status}")
    public List<OrderEntity> getOrdersByStatus(@PathVariable("status") String status) {
        return orderService.findByStatus(status);
    }
}
