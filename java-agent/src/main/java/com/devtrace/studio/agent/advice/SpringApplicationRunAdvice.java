package com.devtrace.studio.agent.advice;

import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import io.opentelemetry.api.trace.SpanKind;
import net.bytebuddy.asm.Advice;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class SpringApplicationRunAdvice {
    public static final ThreadLocal<AtomicInteger> DEPTH = ThreadLocal.withInitial(() -> new AtomicInteger());

    private SpringApplicationRunAdvice() {
    }

    @Advice.OnMethodEnter
    public static void onEnter(@Advice.Origin Class<?> owner,
                               @Advice.AllArguments Object[] arguments,
                               @Advice.Local("rootInvocation") boolean rootInvocation,
                               @Advice.Local("spanHandle") SpanHandle spanHandle) {
        rootInvocation = DEPTH.get().incrementAndGet() == 1;
        if (!rootInvocation) {
            return;
        }

        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("owner", owner.getName());
        attributes.put("argumentCount", arguments.length);
        spanHandle = TraceOperations.startSpan("spring.application.run", "spring-boot", SpanKind.INTERNAL, null, attributes);
        TraceOperations.emit(TraceEventType.SPRING_APPLICATION_RUN, "spring.application.run.enter", "spring-boot", attributes);
    }

    @Advice.OnMethodExit(onThrowable = Throwable.class)
    public static void onExit(@Advice.Thrown Throwable error,
                              @Advice.Local("rootInvocation") boolean rootInvocation,
                              @Advice.Local("spanHandle") SpanHandle spanHandle) {
        int depth = DEPTH.get().decrementAndGet();
        if (depth <= 0) {
            DEPTH.remove();
        }

        if (!rootInvocation || spanHandle == null) {
            return;
        }
        if (error == null) {
            spanHandle.endSuccess(Map.of("phase", "completed"));
        } else {
            spanHandle.endError(error, Map.of("phase", "failed"));
        }
    }
}
