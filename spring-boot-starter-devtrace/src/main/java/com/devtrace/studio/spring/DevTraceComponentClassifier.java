package com.devtrace.studio.spring;

import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Controller;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RestController;

public final class DevTraceComponentClassifier {
    private DevTraceComponentClassifier() {
    }

    public static String classify(Class<?> targetClass) {
        if (AnnotatedElementUtils.hasAnnotation(targetClass, RestController.class)
                || AnnotatedElementUtils.hasAnnotation(targetClass, Controller.class)) {
            return "controller";
        }
        if (AnnotatedElementUtils.hasAnnotation(targetClass, Repository.class)) {
            return "repository";
        }
        if (AnnotatedElementUtils.hasAnnotation(targetClass, Service.class)) {
            return "service";
        }
        return "component";
    }
}

