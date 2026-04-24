package com.devtrace.studio.agent.advice;

import com.devtrace.studio.agent.AgentRuntimeGuard;
import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import com.devtrace.studio.common.TraceRequestContext;
import io.opentelemetry.api.trace.SpanKind;
import net.bytebuddy.asm.Advice;

import java.lang.reflect.Method;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;

public final class RestTemplateExecuteAdvice {
    private RestTemplateExecuteAdvice() {
    }

    @Advice.OnMethodEnter(suppress = Throwable.class)
    public static void onEnter(@Advice.AllArguments Object[] arguments,
                               @Advice.Local("spanHandle") SpanHandle spanHandle,
                               @Advice.Local("requestUri") String requestUri) {
        if (!AgentRuntimeGuard.runtimeHooksEnabled()) {
            return;
        }

        URI uri = arguments.length > 0 && arguments[0] instanceof URI candidate ? candidate : null;
        Object method = arguments.length > 1 ? arguments[1] : "GET";
        if (uri == null) {
            return;
        }

        requestUri = uri.toString();

        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("method", method.toString());
        attributes.put("uri", requestUri);

        spanHandle = TraceOperations.startSpan(
                method + " " + uri.getPath(),
                "http-client",
                SpanKind.CLIENT,
                TraceRequestContext.getRequestId(),
                attributes
        );

        TraceOperations.emit(TraceEventType.EXTERNAL_CALL, "rest-template.call", "http-client", attributes);
    }

    @Advice.OnMethodExit(onThrowable = Throwable.class, suppress = Throwable.class)
    public static void onExit(@Advice.Return Object response,
                              @Advice.Thrown Throwable error,
                              @Advice.Local("spanHandle") SpanHandle spanHandle,
                              @Advice.Local("requestUri") String requestUri) {
        if (spanHandle == null) {
            return;
        }

        if (error == null) {
            spanHandle.endSuccess(Map.of("statusCode", resolveStatus(response), "uri", requestUri));
        } else {
            spanHandle.endError(error, Map.of("uri", requestUri));
        }
    }

    public static int resolveStatus(Object response) {
        if (response == null) {
            return 0;
        }
        try {
            Method getStatusCode = response.getClass().getMethod("getStatusCode");
            Object statusCode = getStatusCode.invoke(response);
            Method value = statusCode.getClass().getMethod("value");
            return (int) value.invoke(statusCode);
        } catch (Exception ignored) {
            return 0;
        }
    }
}

