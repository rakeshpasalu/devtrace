package com.devtrace.studio.agent.advice;

import com.devtrace.studio.agent.AgentRuntimeGuard;
import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import com.devtrace.studio.common.TraceRequestContext;
import io.opentelemetry.api.trace.SpanKind;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import net.bytebuddy.asm.Advice;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public final class FrameworkServletAdvice {
    private FrameworkServletAdvice() {
    }

    @Advice.OnMethodEnter(suppress = Throwable.class)
    public static void onEnter(@Advice.Argument(0) HttpServletRequest request,
                               @Advice.Argument(1) HttpServletResponse response,
                               @Advice.Local("spanHandle") SpanHandle spanHandle,
                               @Advice.Local("rootSpanCreated") boolean rootSpanCreated) {
        if (!AgentRuntimeGuard.runtimeHooksEnabled() || TraceRequestContext.getRequestId() != null) {
            return;
        }

        String requestId = request.getHeader("X-Request-Id");
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }

        TraceRequestContext.setRequestId(requestId);
        rootSpanCreated = true;

        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("method", request.getMethod());
        attributes.put("path", request.getRequestURI());
        attributes.put("query", request.getQueryString());
        attributes.put("remoteAddress", request.getRemoteAddr());

        spanHandle = TraceOperations.startSpan(
                request.getMethod() + " " + request.getRequestURI(),
                "http-server",
                SpanKind.SERVER,
                requestId,
                attributes
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
    }

    @Advice.OnMethodExit(onThrowable = Throwable.class, suppress = Throwable.class)
    public static void onExit(@Advice.Argument(0) HttpServletRequest request,
                              @Advice.Argument(1) HttpServletResponse response,
                              @Advice.Thrown Throwable error,
                              @Advice.Local("spanHandle") SpanHandle spanHandle,
                              @Advice.Local("rootSpanCreated") boolean rootSpanCreated) {
        if (!rootSpanCreated || spanHandle == null) {
            return;
        }

        Map<String, Object> completionAttributes = Map.of("statusCode", response.getStatus());
        if (error == null) {
            spanHandle.endSuccess(completionAttributes);
            TraceOperations.publish(
                    TraceEvent.builder(TraceEventType.HTTP_RESPONSE, request.getMethod() + " " + request.getRequestURI())
                            .traceId(spanHandle.traceId())
                            .spanId(spanHandle.spanId())
                            .requestId(spanHandle.requestId())
                            .component("http-server")
                            .status("OK")
                            .attributes(completionAttributes)
                            .build()
            );
        } else {
            spanHandle.endError(error, completionAttributes);
        }

        TraceRequestContext.clear();
    }
}

