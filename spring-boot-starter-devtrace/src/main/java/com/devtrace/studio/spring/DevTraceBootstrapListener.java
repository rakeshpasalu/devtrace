package com.devtrace.studio.spring;

import com.devtrace.studio.common.TraceConfiguration;
import com.devtrace.studio.common.TraceEnvironment;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import org.springframework.boot.context.event.ApplicationContextInitializedEvent;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.boot.context.event.ApplicationFailedEvent;
import org.springframework.boot.context.event.ApplicationPreparedEvent;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.event.ApplicationStartedEvent;
import org.springframework.boot.context.event.ApplicationStartingEvent;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.event.GenericApplicationListener;
import org.springframework.core.Ordered;
import org.springframework.core.ResolvableType;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public final class DevTraceBootstrapListener implements GenericApplicationListener, Ordered {
    private final AtomicBoolean syntheticStartingPublished = new AtomicBoolean(false);

    @Override
    public boolean supportsEventType(ResolvableType eventType) {
        Class<?> candidate = eventType.toClass();
        return candidate != null && ApplicationEvent.class.isAssignableFrom(candidate);
    }

    @Override
    public void onApplicationEvent(ApplicationEvent event) {
        if (event instanceof ApplicationStartingEvent startingEvent) {
            handleStarting(startingEvent);
            return;
        }

        if (event instanceof ApplicationEnvironmentPreparedEvent environmentPreparedEvent) {
            handleEnvironmentPrepared(environmentPreparedEvent);
            return;
        }

        if (event instanceof ApplicationContextInitializedEvent
                || event instanceof ApplicationPreparedEvent
                || event instanceof ApplicationStartedEvent
                || event instanceof ApplicationReadyEvent
                || event instanceof ApplicationFailedEvent) {
            if (!TraceEnvironment.isInitialized() && event instanceof ApplicationPreparedEvent preparedEvent) {
                TraceEnvironment.initialize(DevTraceConfigurationFactory.fromEnvironment(preparedEvent.getApplicationContext().getEnvironment()));
            }
            emitLifecycle(event, false);
        }
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    private void handleStarting(ApplicationStartingEvent event) {
        if (DevTraceConfigurationFactory.hasExplicitBootstrapConfiguration()) {
            TraceEnvironment.initialize(DevTraceConfigurationFactory.fromSystem());
            emitLifecycle(event, false);
            syntheticStartingPublished.set(true);
        }
    }

    private void handleEnvironmentPrepared(ApplicationEnvironmentPreparedEvent event) {
        TraceConfiguration configuration = DevTraceConfigurationFactory.fromEnvironment(event.getEnvironment());
        if (!TraceEnvironment.isInitialized()) {
            TraceEnvironment.initialize(configuration);
        } else {
            TraceEnvironment.updateConfigurationMetadata(configuration);
        }

        if (syntheticStartingPublished.compareAndSet(false, true)) {
            emitLifecycle("ApplicationStartingEvent", true, Map.of("sourceType", event.getSpringApplication().getClass().getName()));
        }
        emitLifecycle(event, false);
    }

    private void emitLifecycle(ApplicationEvent event, boolean synthetic) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("eventType", event.getClass().getSimpleName());
        attributes.put("sourceType", event.getSource().getClass().getName());
        if (synthetic) {
            attributes.put("synthetic", true);
        }
        if (event instanceof ApplicationFailedEvent failedEvent && failedEvent.getException() != null) {
            attributes.put("message", failedEvent.getException().getMessage());
            attributes.put("exceptionType", failedEvent.getException().getClass().getName());
        }

        TraceOperations.emit(TraceEventType.SPRING_LIFECYCLE, event.getClass().getSimpleName(), "spring-lifecycle", attributes);
    }

    private void emitLifecycle(String name, boolean synthetic, Map<String, Object> attributes) {
        Map<String, Object> payload = new LinkedHashMap<>(attributes);
        payload.put("eventType", name);
        payload.put("synthetic", synthetic);
        TraceOperations.emit(TraceEventType.SPRING_LIFECYCLE, name, "spring-lifecycle", payload);
    }
}

