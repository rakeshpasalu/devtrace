package com.devtrace.studio.common;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;

import java.util.Map;

public final class TraceOperations {
    private TraceOperations() {
    }

    public static SpanHandle startSpan(String name, String component, SpanKind kind) {
        return startSpan(name, component, kind, null, Map.of());
    }

    public static SpanHandle startSpan(String name, String component, SpanKind kind, String requestId, Map<String, Object> attributes) {
        return startSpan(name, component, kind, requestId, attributes, null);
    }

    public static SpanHandle startSpan(String name, String component, SpanKind kind, String requestId, Map<String, Object> attributes, Context parentContext) {
        ensureInitialized();
        String effectiveRequestId = requestId == null || requestId.isBlank() ? TraceRequestContext.getRequestId() : requestId;

        String parentSpanId = currentSpanId();
        long startTime = System.currentTimeMillis();

        var spanBuilder = TraceEnvironment.tracer()
                .spanBuilder(name)
                .setSpanKind(kind);
        if (parentContext != null) {
            spanBuilder.setParent(parentContext);
        }

        Span span = spanBuilder.startSpan();
        Scope scope = span.makeCurrent();
        attributes.forEach((key, value) -> setSpanAttribute(span, key, value));

        SpanContext context = span.getSpanContext();
        String traceId = context.getTraceId();
        String spanId = context.getSpanId();

        publish(
                TraceEvent.builder(TraceEventType.SPAN_STARTED, name)
                        .traceId(traceId)
                        .spanId(spanId)
                        .parentSpanId(parentSpanId)
                        .requestId(effectiveRequestId)
                        .component(component)
                        .status("IN_PROGRESS")
                        .startTime(startTime)
                        .attributes(attributes)
                        .build()
        );

        return new SpanHandle(span, scope, name, component, effectiveRequestId, traceId, spanId, parentSpanId, startTime);
    }

    public static void publish(TraceEvent event) {
        ensureInitialized();
        TraceEnvironment.publisher().publish(TraceEnvironment.enrich(event));
    }

    public static void emit(TraceEventType type, String name, String component, Map<String, Object> attributes) {
        SpanContext currentContext = Span.current().getSpanContext();
        publish(
                TraceEvent.builder(type, name)
                        .traceId(currentContext.isValid() ? currentContext.getTraceId() : null)
                        .spanId(currentContext.isValid() ? currentContext.getSpanId() : null)
                        .requestId(TraceRequestContext.getRequestId())
                        .component(component)
                        .attributes(attributes)
                        .build()
        );
    }

    public static String currentTraceId() {
        SpanContext context = Span.current().getSpanContext();
        return context.isValid() ? context.getTraceId() : null;
    }

    public static String currentSpanId() {
        SpanContext context = Span.current().getSpanContext();
        return context.isValid() ? context.getSpanId() : null;
    }

    static void setSpanAttribute(Span span, String key, Object value) {
        if (key == null || value == null) {
            return;
        }

        if (value instanceof Boolean booleanValue) {
            span.setAttribute(key, booleanValue);
        } else if (value instanceof Integer intValue) {
            span.setAttribute(key, intValue.longValue());
        } else if (value instanceof Long longValue) {
            span.setAttribute(key, longValue);
        } else if (value instanceof Float floatValue) {
            span.setAttribute(key, floatValue.doubleValue());
        } else if (value instanceof Double doubleValue) {
            span.setAttribute(key, doubleValue);
        } else {
            span.setAttribute(key, value.toString());
        }
    }

    private static void ensureInitialized() {
        if (!TraceEnvironment.isInitialized()) {
            TraceEnvironment.initialize(new TraceConfiguration(
                    "devtrace-service",
                    null,
                    "http://127.0.0.1:9000/ingest",
                    null
            ));
        }
    }
}
