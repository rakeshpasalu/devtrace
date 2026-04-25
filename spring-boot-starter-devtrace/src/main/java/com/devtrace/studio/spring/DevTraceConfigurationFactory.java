package com.devtrace.studio.spring;

import com.devtrace.studio.common.TraceConfiguration;
import org.springframework.core.env.Environment;

public final class DevTraceConfigurationFactory {
    private DevTraceConfigurationFactory() {
    }

    public static TraceConfiguration fromEnvironment(Environment environment) {
        String serviceName = firstNonBlank(
                environment.getProperty("devtrace.service-name"),
                environment.getProperty("spring.application.name"),
                deriveDefaultServiceName()
        );

        String rawBackendUrl = firstNonBlank(environment.getProperty("devtrace.backend-url"), System.getenv("DEVTRACE_BACKEND_URL"), "http://127.0.0.1:9000");
        String backendUrl = normalizeIngestUrl(rawBackendUrl);

        return new TraceConfiguration(
                serviceName,
                firstNonBlank(environment.getProperty("devtrace.instance-id"), System.getenv("DEVTRACE_INSTANCE_ID")),
                backendUrl,
                firstNonBlank(environment.getProperty("devtrace.otlp-endpoint"), System.getenv("DEVTRACE_OTLP_ENDPOINT")),
                firstNonBlank(environment.getProperty("devtrace.api-key"), System.getenv("DEVTRACE_API_KEY"))
        );
    }

    public static TraceConfiguration fromSystem() {
        return new TraceConfiguration(
                firstNonBlank(System.getProperty("devtrace.service-name"), System.getProperty("spring.application.name"), deriveDefaultServiceName()),
                firstNonBlank(System.getProperty("devtrace.instance-id"), System.getenv("DEVTRACE_INSTANCE_ID")),
                normalizeIngestUrl(firstNonBlank(System.getProperty("devtrace.backend-url"), System.getenv("DEVTRACE_BACKEND_URL"), "http://127.0.0.1:9000")),
                firstNonBlank(System.getProperty("devtrace.otlp-endpoint"), System.getenv("DEVTRACE_OTLP_ENDPOINT")),
                firstNonBlank(System.getProperty("devtrace.api-key"), System.getenv("DEVTRACE_API_KEY"))
        );
    }

    public static boolean hasExplicitBootstrapConfiguration() {
        return hasText(System.getProperty("devtrace.backend-url"))
                || hasText(System.getProperty("devtrace.service-name"))
                || hasText(System.getenv("DEVTRACE_BACKEND_URL"))
                || hasText(System.getenv("SPRING_APPLICATION_NAME"));
    }

    private static String deriveDefaultServiceName() {
        String command = System.getProperty("sun.java.command");
        if (!hasText(command)) {
            return "devtrace-service";
        }
        int separator = command.indexOf(' ');
        String candidate = separator > 0 ? command.substring(0, separator) : command;
        int slash = candidate.lastIndexOf('/');
        return slash >= 0 ? candidate.substring(slash + 1) : candidate;
    }

    private static String firstNonBlank(String... candidates) {
        for (String candidate : candidates) {
            if (hasText(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    /**
     * Ensures the backend URL ends with /ingest so the publisher POSTs to the correct endpoint.
     */
    private static String normalizeIngestUrl(String url) {
        if (url == null) return null;
        url = url.strip();
        // Strip trailing slash
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        if (!url.endsWith("/ingest")) {
            url = url + "/ingest";
        }
        return url;
    }
}

