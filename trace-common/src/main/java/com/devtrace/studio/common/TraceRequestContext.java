package com.devtrace.studio.common;

public final class TraceRequestContext {
    private static final ThreadLocal<String> REQUEST_ID = new ThreadLocal<>();

    private TraceRequestContext() {
    }

    public static void setRequestId(String requestId) {
        REQUEST_ID.set(requestId);
    }

    public static String getRequestId() {
        return REQUEST_ID.get();
    }

    public static void clear() {
        REQUEST_ID.remove();
    }
}
