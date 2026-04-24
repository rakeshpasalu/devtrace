package com.devtrace.studio.spring;

import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import com.devtrace.studio.common.TraceRequestContext;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.context.Context;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Order(Ordered.HIGHEST_PRECEDENCE)
public class DevTraceRequestTracingFilter extends OncePerRequestFilter {
    private final DevTraceProperties properties;

    public DevTraceRequestTracingFilter(DevTraceProperties properties) {
        this.properties = properties;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return properties.getExcludedPathPrefixes().stream().anyMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String requestId = request.getHeader("X-Request-Id");
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }

        TraceRequestContext.setRequestId(requestId);
        Context extractedContext = DevTracePropagation.extract(request);
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("method", request.getMethod());
        attributes.put("path", request.getRequestURI());
        attributes.put("query", request.getQueryString());
        attributes.put("remoteAddress", request.getRemoteAddr());

        SpanHandle spanHandle = TraceOperations.startSpan(
                request.getMethod() + " " + request.getRequestURI(),
                "http-server",
                SpanKind.SERVER,
                requestId,
                attributes,
                extractedContext
        );

        TraceOperations.publish(
                TraceEvent.builder(TraceEventType.HTTP_REQUEST, request.getMethod() + " " + request.getRequestURI())
                        .traceId(spanHandle.traceId())
                        .spanId(spanHandle.spanId())
                        .requestId(requestId)
                        .component("http-server")
                        .attributes(attributes)
                        .build()
        );

        response.addHeader("X-Trace-Id", spanHandle.traceId());
        response.addHeader("X-Request-Id", requestId);

        try {
            filterChain.doFilter(request, response);
            Map<String, Object> completionAttributes = responseAttributes(request, response);
            spanHandle.endSuccess(completionAttributes);
            TraceOperations.publish(
                    TraceEvent.builder(TraceEventType.HTTP_RESPONSE, request.getMethod() + " " + request.getRequestURI())
                            .traceId(spanHandle.traceId())
                            .spanId(spanHandle.spanId())
                            .requestId(requestId)
                            .component("http-server")
                            .status("OK")
                            .attributes(completionAttributes)
                            .build()
            );
        } catch (Throwable error) {
            spanHandle.endError(error, responseAttributes(request, response));
            throw error;
        } finally {
            TraceRequestContext.clear();
        }
    }

    private Map<String, Object> responseAttributes(HttpServletRequest request, HttpServletResponse response) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("statusCode", response.getStatus());
        Object bestPattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (bestPattern != null) {
            attributes.put("routePattern", bestPattern.toString());
        }
        return attributes;
    }
}
