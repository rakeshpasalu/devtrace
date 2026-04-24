package com.devtrace.studio.spring;

import com.devtrace.studio.common.TraceEnvironment;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.propagation.TextMapGetter;
import io.opentelemetry.context.propagation.TextMapSetter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;

public final class DevTracePropagation {
    private static final TextMapGetter<HttpServletRequest> SERVLET_GETTER = new TextMapGetter<>() {
        @Override
        public Iterable<String> keys(HttpServletRequest carrier) {
            return java.util.Collections.list(carrier.getHeaderNames());
        }

        @Override
        public String get(HttpServletRequest carrier, String key) {
            return carrier.getHeader(key);
        }
    };

    private static final TextMapSetter<HttpHeaders> HTTP_HEADERS_SETTER = HttpHeaders::set;

    private DevTracePropagation() {
    }

    public static Context extract(HttpServletRequest request) {
        return TraceEnvironment.openTelemetry()
                .getPropagators()
                .getTextMapPropagator()
                .extract(Context.current(), request, SERVLET_GETTER);
    }

    public static void inject(HttpHeaders headers) {
        TraceEnvironment.openTelemetry()
                .getPropagators()
                .getTextMapPropagator()
                .inject(Context.current(), headers, HTTP_HEADERS_SETTER);
    }
}
