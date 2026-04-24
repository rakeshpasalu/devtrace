package com.devtrace.studio.spring;

import com.devtrace.studio.common.SpanHandle;
import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import com.devtrace.studio.common.TraceRequestContext;
import io.opentelemetry.api.trace.SpanKind;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.aop.support.AopUtils;

import java.util.LinkedHashMap;
import java.util.Map;

@Aspect
public class DevTraceMethodTraceAspect {
    @Around("(within(@org.springframework.web.bind.annotation.RestController *) || within(@org.springframework.stereotype.Controller *) || within(@org.springframework.stereotype.Service *) || within(@org.springframework.stereotype.Repository *)) && !within(com.devtrace.studio..*)")
    public Object traceMethodInvocation(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Class<?> targetClass = joinPoint.getTarget() == null
                ? signature.getDeclaringType()
                : AopUtils.getTargetClass(joinPoint.getTarget());
        String methodName = targetClass.getSimpleName() + "." + signature.getMethod().getName();
        String requestId = TraceRequestContext.getRequestId();
        String component = DevTraceComponentClassifier.classify(targetClass);

        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("className", targetClass.getName());
        attributes.put("methodName", signature.getMethod().getName());
        attributes.put("argumentCount", joinPoint.getArgs().length);

        SpanHandle spanHandle = TraceOperations.startSpan(methodName, component, SpanKind.INTERNAL, requestId, attributes);
        TraceOperations.publish(
                TraceEvent.builder(TraceEventType.METHOD_INVOCATION, methodName)
                        .traceId(spanHandle.traceId())
                        .spanId(spanHandle.spanId())
                        .parentSpanId(TraceOperations.currentSpanId())
                        .requestId(requestId)
                        .component(component)
                        .className(targetClass.getName())
                        .methodName(signature.getMethod().getName())
                        .attributes(attributes)
                        .build()
        );

        try {
            Object result = joinPoint.proceed();
            spanHandle.endSuccess(Map.of("resultType", result == null ? "void" : result.getClass().getSimpleName()));
            return result;
        } catch (Throwable error) {
            spanHandle.endError(error, Map.of("className", targetClass.getName()));
            throw error;
        }
    }
}

