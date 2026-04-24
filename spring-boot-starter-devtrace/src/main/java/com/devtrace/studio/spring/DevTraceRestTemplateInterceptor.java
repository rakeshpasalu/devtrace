package com.devtrace.studio.spring;

import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import com.devtrace.studio.common.TraceRequestContext;
import io.opentelemetry.api.trace.SpanKind;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

public class DevTraceRestTemplateInterceptor implements ClientHttpRequestInterceptor {
    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution) throws IOException {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("method", request.getMethod().name());
        attributes.put("uri", request.getURI().toString());

        SpanHandle spanHandle = TraceOperations.startSpan(
                request.getMethod().name() + " " + request.getURI().getPath(),
                "http-client",
                SpanKind.CLIENT,
                TraceRequestContext.getRequestId(),
                attributes
        );

        TraceOperations.emit(TraceEventType.EXTERNAL_CALL, "rest-template.call", "http-client", attributes);
        DevTracePropagation.inject(request.getHeaders());
        request.getHeaders().add("X-Trace-Id", spanHandle.traceId());
        if (TraceRequestContext.getRequestId() != null) {
            request.getHeaders().add("X-Request-Id", TraceRequestContext.getRequestId());
        }

        try {
            ClientHttpResponse response = execution.execute(request, body);
            spanHandle.endSuccess(Map.of("statusCode", response.getStatusCode().value()));
            return response;
        } catch (IOException error) {
            spanHandle.endError(error, Map.of("uri", request.getURI().toString()));
            throw error;
        }
    }
}
