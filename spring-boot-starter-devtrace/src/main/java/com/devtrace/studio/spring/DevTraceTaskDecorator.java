package com.devtrace.studio.spring;

import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import com.devtrace.studio.common.TraceRequestContext;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import org.springframework.core.task.TaskDecorator;

import java.util.Map;

public class DevTraceTaskDecorator implements TaskDecorator {
    @Override
    public Runnable decorate(Runnable runnable) {
        Context context = Context.current();
        String requestId = TraceRequestContext.getRequestId();

        TraceOperations.emit(TraceEventType.ASYNC_SCHEDULED, "async.scheduled", "async", Map.of(
                "requestId", requestId == null ? "n/a" : requestId
        ));

        return () -> {
            try (Scope ignored = context.makeCurrent()) {
                if (requestId != null) {
                    TraceRequestContext.setRequestId(requestId);
                }
                TraceOperations.emit(TraceEventType.ASYNC_EXECUTION, "async.execution", "async", Map.of(
                        "threadName", Thread.currentThread().getName()
                ));
                runnable.run();
            } finally {
                TraceRequestContext.clear();
            }
        };
    }
}

