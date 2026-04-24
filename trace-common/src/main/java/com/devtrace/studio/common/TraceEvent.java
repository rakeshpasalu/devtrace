package com.devtrace.studio.common;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TraceEvent(
        String eventId,
        TraceEventType type,
        long timestamp,
        String service,
        String instanceId,
        String traceId,
        String spanId,
        String parentSpanId,
        String requestId,
        String component,
        String name,
        String status,
        String threadName,
        String className,
        String methodName,
        Long startTime,
        Long endTime,
        Double durationMs,
        Map<String, Object> attributes
) {
    public static Builder builder(TraceEventType type, String name) {
        return new Builder(type, name);
    }

    public static final class Builder {
        private final TraceEventType type;
        private final String name;
        private String eventId;
        private long timestamp = System.currentTimeMillis();
        private String service;
        private String instanceId;
        private String traceId;
        private String spanId;
        private String parentSpanId;
        private String requestId;
        private String component;
        private String status;
        private String threadName = Thread.currentThread().getName();
        private String className;
        private String methodName;
        private Long startTime;
        private Long endTime;
        private Double durationMs;
        private final Map<String, Object> attributes = new LinkedHashMap<>();

        private Builder(TraceEventType type, String name) {
            this.type = type;
            this.name = name;
        }

        public Builder eventId(String eventId) {
            this.eventId = eventId;
            return this;
        }

        public Builder timestamp(long timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public Builder service(String service) {
            this.service = service;
            return this;
        }

        public Builder instanceId(String instanceId) {
            this.instanceId = instanceId;
            return this;
        }

        public Builder traceId(String traceId) {
            this.traceId = traceId;
            return this;
        }

        public Builder spanId(String spanId) {
            this.spanId = spanId;
            return this;
        }

        public Builder parentSpanId(String parentSpanId) {
            this.parentSpanId = parentSpanId;
            return this;
        }

        public Builder requestId(String requestId) {
            this.requestId = requestId;
            return this;
        }

        public Builder component(String component) {
            this.component = component;
            return this;
        }

        public Builder status(String status) {
            this.status = status;
            return this;
        }

        public Builder threadName(String threadName) {
            this.threadName = threadName;
            return this;
        }

        public Builder className(String className) {
            this.className = className;
            return this;
        }

        public Builder methodName(String methodName) {
            this.methodName = methodName;
            return this;
        }

        public Builder startTime(Long startTime) {
            this.startTime = startTime;
            return this;
        }

        public Builder endTime(Long endTime) {
            this.endTime = endTime;
            return this;
        }

        public Builder durationMs(Double durationMs) {
            this.durationMs = durationMs;
            return this;
        }

        public Builder attribute(String key, Object value) {
            if (key != null && value != null) {
                this.attributes.put(key, value);
            }
            return this;
        }

        public Builder attributes(Map<String, ?> values) {
            if (values != null) {
                values.forEach(this::attribute);
            }
            return this;
        }

        public TraceEvent build() {
            return new TraceEvent(
                    eventId == null ? UUID.randomUUID().toString() : eventId,
                    type,
                    timestamp,
                    service,
                    instanceId,
                    traceId,
                    spanId,
                    parentSpanId,
                    requestId,
                    component,
                    name,
                    status,
                    threadName,
                    className,
                    methodName,
                    startTime,
                    endTime,
                    durationMs,
                    attributes.isEmpty() ? Map.of() : Map.copyOf(attributes)
            );
        }
    }
}

