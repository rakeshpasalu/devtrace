package com.example.demo.controller;

import com.example.demo.dto.ShippingView;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/mock/shipping")
public class MockShippingController {
    @GetMapping("/{orderId}")
    public ShippingView getShipping(@PathVariable("orderId") Long orderId) throws InterruptedException {
        Thread.sleep(75);
        return new ShippingView(orderId, orderId % 2 == 0 ? "IN_TRANSIT" : "PICKED", "demo-carrier");
    }
}
