package com.devtrace.studio.agent.advice;

import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import io.opentelemetry.api.trace.SpanKind;
import net.bytebuddy.asm.Advice;

import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.Map;

public final class BeanCreationAdvice {
    private BeanCreationAdvice() {
    }

    @Advice.OnMethodEnter
    public static void onEnter(@Advice.Argument(0) String beanName,
                               @Advice.Argument(value = 1, optional = true) Object beanDefinition,
                               @Advice.Local("spanHandle") SpanHandle spanHandle) {
        String beanClassName = extractBeanClassName(beanDefinition);
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("beanName", beanName);
        if (beanClassName != null) {
            attributes.put("beanClass", beanClassName);
        }

        spanHandle = TraceOperations.startSpan("bean.create." + beanName, "spring-beans", SpanKind.INTERNAL, null, attributes);
        TraceOperations.publish(
                TraceEvent.builder(TraceEventType.BEAN_CREATION, "bean.create." + beanName)
                        .component("spring-beans")
                        .className(beanClassName)
                        .attributes(attributes)
                        .build()
        );
    }

    @Advice.OnMethodExit(onThrowable = Throwable.class)
    public static void onExit(@Advice.Argument(0) String beanName,
                              @Advice.Thrown Throwable error,
                              @Advice.Return Object bean,
                              @Advice.Local("spanHandle") SpanHandle spanHandle) {
        if (spanHandle == null) {
            return;
        }

        String beanType = bean == null ? null : bean.getClass().getName();
        if (error == null) {
            spanHandle.endSuccess(Map.of("beanName", beanName, "resolvedType", beanType == null ? "unknown" : beanType));
        } else {
            spanHandle.endError(error, Map.of("beanName", beanName));
        }
    }

    public static String extractBeanClassName(Object beanDefinition) {
        if (beanDefinition == null) {
            return null;
        }

        try {
            Method method = beanDefinition.getClass().getMethod("getBeanClassName");
            Object value = method.invoke(beanDefinition);
            return value == null ? null : value.toString();
        } catch (Exception ignored) {
            return null;
        }
    }
}
