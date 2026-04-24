package com.devtrace.studio.agent.advice;

import com.devtrace.studio.agent.AgentRuntimeGuard;
import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import com.devtrace.studio.common.TraceRequestContext;
import io.opentelemetry.api.trace.SpanKind;
import net.bytebuddy.asm.Advice;

import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;

public final class HandlerMethodAdvice {
    private HandlerMethodAdvice() {
    }

    @Advice.OnMethodEnter(suppress = Throwable.class)
    public static void onEnter(@Advice.This Object handler,
                               @Advice.Local("spanHandle") SpanHandle spanHandle,
                               @Advice.Local("handlerMethodName") String handlerMethodName) {
        if (!AgentRuntimeGuard.runtimeHooksEnabled() || TraceRequestContext.getRequestId() == null) {
            return;
        }

        Method method = resolveMethod(handler);
        if (method == null) {
            return;
        }

        handlerMethodName = method.getDeclaringClass().getSimpleName() + "." + method.getName();
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("className", method.getDeclaringClass().getName());
        attributes.put("methodName", method.getName());

        spanHandle = TraceOperations.startSpan(
                handlerMethodName,
                "controller",
                SpanKind.INTERNAL,
                TraceRequestContext.getRequestId(),
                attributes
        );

        TraceOperations.publish(
                TraceEvent.builder(TraceEventType.METHOD_INVOCATION, handlerMethodName)
                        .traceId(spanHandle.traceId())
                        .spanId(spanHandle.spanId())
                        .parentSpanId(TraceOperations.currentSpanId())
                        .requestId(spanHandle.requestId())
                        .component("controller")
                        .className(method.getDeclaringClass().getName())
                        .methodName(method.getName())
                        .attributes(attributes)
                        .build()
        );
    }

    @Advice.OnMethodExit(onThrowable = Throwable.class, suppress = Throwable.class)
    public static void onExit(@Advice.Thrown Throwable error,
                              @Advice.Local("spanHandle") SpanHandle spanHandle,
                              @Advice.Local("handlerMethodName") String handlerMethodName) {
        if (spanHandle == null) {
            return;
        }
        if (error == null) {
            spanHandle.endSuccess(Map.of("handler", handlerMethodName));
        } else {
            spanHandle.endError(error, Map.of("handler", handlerMethodName));
        }
    }

    public static Method resolveMethod(Object handler) {
        try {
            Method accessor = handler.getClass().getMethod("getMethod");
            return (Method) accessor.invoke(handler);
        } catch (Exception ignored) {
            return null;
        }
    }
}

