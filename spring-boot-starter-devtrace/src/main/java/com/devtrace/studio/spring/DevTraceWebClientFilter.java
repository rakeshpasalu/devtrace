package com.devtrace.studio.spring;

import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import com.devtrace.studio.common.TraceRequestContext;
import io.opentelemetry.api.trace.SpanKind;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFilterFunction;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.Map;

public class DevTraceWebClientFilter implements ExchangeFilterFunction {
    @Override
    public Mono<ClientResponse> filter(ClientRequest request, ExchangeFunction next) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("method", request.method().name());
        attributes.put("uri", request.url().toString());

        SpanHandle spanHandle = TraceOperations.startSpan(
                request.method().name() + " " + request.url().getPath(),
                "http-client",
                SpanKind.CLIENT,
                TraceRequestContext.getRequestId(),
                attributes
        );

        TraceOperations.emit(TraceEventType.EXTERNAL_CALL, "web-client.call", "http-client", attributes);

        ClientRequest.Builder builder = ClientRequest.from(request)
                .headers(DevTracePropagation::inject)
                .header("X-Trace-Id", spanHandle.traceId());
        if (TraceRequestContext.getRequestId() != null) {
            builder.header("X-Request-Id", TraceRequestContext.getRequestId());
        }

        return next.exchange(builder.build())
                .doOnSuccess(response -> handleSuccess(spanHandle, response))
                .doOnError(error -> spanHandle.endError(error, Map.of("uri", request.url().toString())));
    }

    private void handleSuccess(SpanHandle spanHandle, ClientResponse response) {
        if (response != null) {
            spanHandle.endSuccess(Map.of("statusCode", response.statusCode().value()));
        } else {
            spanHandle.endSuccess(Map.of("statusCode", 0));
        }
    }
}
