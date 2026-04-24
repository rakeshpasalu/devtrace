package com.example.demo.service;

import com.example.demo.dto.ShippingView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class ExternalShippingClient {
    private final RestTemplate restTemplate;
    private final String baseUrl;

    public ExternalShippingClient(RestTemplate restTemplate, @Value("${devtrace.sample-port:8080}") int port) {
        this.restTemplate = restTemplate;
        this.baseUrl = "http://localhost:" + port;
    }

    public ShippingView fetchShipment(Long orderId) {
        return restTemplate.getForObject(baseUrl + "/mock/shipping/" + orderId, ShippingView.class);
    }
}

