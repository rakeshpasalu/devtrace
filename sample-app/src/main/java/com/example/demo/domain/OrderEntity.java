package com.example.demo.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "orders")
public class OrderEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String customerName;
    private String itemName;
    private String status;
    private double totalPrice;

    protected OrderEntity() {
    }

    public OrderEntity(String customerName, String itemName, String status, double totalPrice) {
        this.customerName = customerName;
        this.itemName = itemName;
        this.status = status;
        this.totalPrice = totalPrice;
    }

    public Long getId() {
        return id;
    }

    public String getCustomerName() {
        return customerName;
    }

    public String getItemName() {
        return itemName;
    }

    public String getStatus() {
        return status;
    }

    public double getTotalPrice() {
        return totalPrice;
    }
}

