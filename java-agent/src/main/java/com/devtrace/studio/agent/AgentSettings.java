package com.devtrace.studio.agent;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

public record AgentSettings(
        String backendUrl,
        String otlpEndpoint,
        String serviceName,
        String instanceId,
        String apiKey,
        List<String> appPackages,
        boolean runtimeHooksEnabled
) {
    public static AgentSettings parse(String rawArgs) {
        String backendUrl = "http://127.0.0.1:9000/ingest";
        String otlpEndpoint = null;
        String serviceName = "devtrace-service";
        String instanceId = UUID.randomUUID().toString();
        String apiKey = null;
        List<String> packages = List.of();
        boolean runtimeHooksEnabled = true;

        if (rawArgs == null || rawArgs.isBlank()) {
            return new AgentSettings(backendUrl, otlpEndpoint, serviceName, instanceId, apiKey, packages, runtimeHooksEnabled);
        }

        for (String token : rawArgs.split(";")) {
            String[] entry = token.split("=", 2);
            if (entry.length != 2) {
                continue;
            }

            String key = entry[0].trim();
            String value = entry[1].trim();

            switch (key) {
                case "backendUrl" -> backendUrl = value;
                case "otlpEndpoint" -> otlpEndpoint = value;
                case "serviceName" -> serviceName = value;
                case "instanceId" -> instanceId = value;
                case "apiKey" -> apiKey = value;
                case "appPackages" -> packages = Arrays.stream(value.split(","))
                        .map(String::trim)
                        .filter(part -> !part.isBlank())
                        .toList();
                case "runtimeHooksEnabled" -> runtimeHooksEnabled = Boolean.parseBoolean(value);
                default -> {
                }
            }
        }

        return new AgentSettings(backendUrl, otlpEndpoint, serviceName, instanceId, apiKey, packages, runtimeHooksEnabled);
    }

    public boolean shouldTrackClass(String className) {
        if (className == null) {
            return false;
        }
        if (className.startsWith("org.springframework") || className.startsWith("org.hibernate")) {
            return true;
        }
        return appPackages.isEmpty() || appPackages.stream().anyMatch(className::startsWith);
    }
}
