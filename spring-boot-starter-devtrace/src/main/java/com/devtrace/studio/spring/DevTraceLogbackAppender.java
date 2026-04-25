package com.devtrace.studio.spring;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.AppenderBase;
import com.devtrace.studio.common.TraceEnvironment;
import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TraceEventType;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanContext;

/**
 * A Logback appender that forwards application log events to the DevTrace collector
 * as LOG-type TraceEvents. Automatically correlates logs with active traces via
 * OpenTelemetry span context.
 *
 * <p>Filters out DevTrace's own internal logging to avoid infinite recursion.</p>
 */
public class DevTraceLogbackAppender extends AppenderBase<ILoggingEvent> {

    /** Minimum level to capture (default: DEBUG). */
    private Level threshold = Level.DEBUG;

    /** Max exception stack trace length to include. */
    private int maxExceptionLength = 4096;

    public void setThreshold(Level threshold) {
        this.threshold = threshold;
    }

    public void setMaxExceptionLength(int maxExceptionLength) {
        this.maxExceptionLength = maxExceptionLength;
    }

    @Override
    protected void append(ILoggingEvent event) {
        // Skip if DevTrace is not initialized yet (during early bootstrap)
        if (!TraceEnvironment.isInitialized()) {
            return;
        }

        // Skip below-threshold events
        if (event.getLevel().isGreaterOrEqual(threshold) == false) {
            return;
        }

        // Skip DevTrace's own log output to avoid infinite recursion
        String loggerName = event.getLoggerName();
        if (loggerName != null && (
                loggerName.startsWith("com.devtrace.studio") ||
                loggerName.startsWith("io.opentelemetry") ||
                loggerName.startsWith("io.netty"))) {
            return;
        }

        try {
            // Extract trace context from current span (if any)
            String traceId = null;
            String spanId = null;
            SpanContext spanContext = Span.current().getSpanContext();
            if (spanContext.isValid()) {
                traceId = spanContext.getTraceId();
                spanId = spanContext.getSpanId();
            }

            // Map Logback level to string
            String level = mapLevel(event.getLevel());

            // Build the TraceEvent
            TraceEvent.Builder builder = TraceEvent.builder(TraceEventType.LOG, event.getFormattedMessage())
                    .component("logging")
                    .status(level)
                    .attribute("level", level)
                    .attribute("logger", loggerName)
                    .attribute("message", event.getFormattedMessage())
                    .attribute("thread", event.getThreadName());

            if (traceId != null) {
                builder.traceId(traceId);
            }
            if (spanId != null) {
                builder.spanId(spanId);
            }

            // Include exception info if present
            IThrowableProxy throwableProxy = event.getThrowableProxy();
            if (throwableProxy != null) {
                String exceptionText = ThrowableProxyUtil.asString(throwableProxy);
                if (exceptionText.length() > maxExceptionLength) {
                    exceptionText = exceptionText.substring(0, maxExceptionLength) + "\n... (truncated)";
                }
                builder.attribute("exception", exceptionText);
                builder.attribute("exceptionType", throwableProxy.getClassName());
                builder.attribute("exceptionMessage", throwableProxy.getMessage());
            }

            // Include MDC values if present
            if (event.getMDCPropertyMap() != null && !event.getMDCPropertyMap().isEmpty()) {
                event.getMDCPropertyMap().forEach((k, v) -> {
                    if (v != null) builder.attribute("mdc." + k, v);
                });
                // Extract traceId from MDC if not set via span context
                if (traceId == null) {
                    String mdcTraceId = event.getMDCPropertyMap().get("traceId");
                    if (mdcTraceId != null && !mdcTraceId.isEmpty()) {
                        builder.traceId(mdcTraceId);
                    }
                }
            }

            TraceEvent traceEvent = TraceEnvironment.enrich(builder.build());
            TraceEnvironment.publisher().publish(traceEvent);
        } catch (Exception ignored) {
            // Never let log forwarding break the application
        }
    }

    private static String mapLevel(Level level) {
        if (level == null) return "INFO";
        return switch (level.toInt()) {
            case Level.TRACE_INT -> "TRACE";
            case Level.DEBUG_INT -> "DEBUG";
            case Level.INFO_INT -> "INFO";
            case Level.WARN_INT -> "WARN";
            case Level.ERROR_INT -> "ERROR";
            default -> level.toString();
        };
    }
}

