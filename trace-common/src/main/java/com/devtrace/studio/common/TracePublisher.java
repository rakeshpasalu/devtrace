package com.devtrace.studio.common;

public interface TracePublisher extends AutoCloseable {
    void publish(TraceEvent event);

    default void flush() {
    }

    @Override
    default void close() {
    }
}

