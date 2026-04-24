package com.devtrace.studio.common;

import java.util.UUID;

public record TraceConfiguration(
        String serviceName,
        String instanceId,
        String backendUrl,
        String otlpEndpoint,
        String apiKey
) {
    public TraceConfiguration(String serviceName, String instanceId, String backendUrl, String otlpEndpoint) {
        this(serviceName, instanceId, backendUrl, otlpEndpoint, null);
    }

    public TraceConfiguration {
        if (serviceName == null || serviceName.isBlank()) {
            serviceName = "devtrace-service";
        }
        if (instanceId == null || instanceId.isBlank()) {
            instanceId = UUID.randomUUID().toString();
        }
        if (backendUrl == null || backendUrl.isBlank()) {
            backendUrl = "http://127.0.0.1:9000/ingest";
        } else if (!backendUrl.endsWith("/ingest")) {
            backendUrl = backendUrl.endsWith("/") ? backendUrl + "ingest" : backendUrl + "/ingest";
        }
    }
}
