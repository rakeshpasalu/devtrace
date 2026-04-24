package com.devtrace.studio.common.publish;

import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TracePublisher;

public final class NoopTracePublisher implements TracePublisher {
    @Override
    public void publish(TraceEvent event) {
    }
}

