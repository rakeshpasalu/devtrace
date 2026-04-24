package com.devtrace.studio.common;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.context.Scope;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public final class SpanHandle implements AutoCloseable {
    private final Span span;
    private final Scope scope;
    private final String name;
    private final String component;
    private final String requestId;
    private final String traceId;
    private final String spanId;
    private final String parentSpanId;
    private final long startTime;
    private final AtomicBoolean closed = new AtomicBoolean(false);

    SpanHandle(
            Span span,
            Scope scope,
            String name,
            String component,
            String requestId,
            String traceId,
            String spanId,
            String parentSpanId,
            long startTime
    ) {
        this.span = span;
        this.scope = scope;
        this.name = name;
        this.component = component;
        this.requestId = requestId;
        this.traceId = traceId;
        this.spanId = spanId;
        this.parentSpanId = parentSpanId;
        this.startTime = startTime;
    }

    public Span span() {
        return span;
    }

    public String traceId() {
        return traceId;
    }

    public String spanId() {
        return spanId;
    }

    public String requestId() {
        return requestId;
    }

    public void endSuccess(Map<String, Object> attributes) {
        endInternal("OK", null, attributes);
    }

    public void endError(Throwable error, Map<String, Object> attributes) {
        endInternal("ERROR", error, attributes);
    }

    @Override
    public void close() {
        endSuccess(Map.of());
    }

    private void endInternal(String status, Throwable error, Map<String, Object> attributes) {
        if (!closed.compareAndSet(false, true)) {
            return;
        }

        long endTime = System.currentTimeMillis();
        if (attributes != null) {
            attributes.forEach((key, value) -> TraceOperations.setSpanAttribute(span, key, value));
        }
        if (error != null) {
            span.recordException(error);
        }

        span.end();
        scope.close();

        TraceOperations.publish(
                TraceEvent.builder(TraceEventType.SPAN_FINISHED, name)
                        .traceId(traceId)
                        .spanId(spanId)
                        .parentSpanId(parentSpanId)
                        .requestId(requestId)
                        .component(component)
                        .status(status)
                        .startTime(startTime)
                        .endTime(endTime)
                        .durationMs((double) (endTime - startTime))
                        .attributes(attributes)
                        .build()
        );

        if (error != null) {
            TraceOperations.publish(
                    TraceEvent.builder(TraceEventType.ERROR, name + ".error")
                            .traceId(traceId)
                            .spanId(spanId)
                            .parentSpanId(parentSpanId)
                            .requestId(requestId)
                            .component(component)
                            .status("ERROR")
                            .attribute("message", error.getMessage())
                            .attribute("exceptionType", error.getClass().getName())
                            .build()
            );
        }
    }
}

