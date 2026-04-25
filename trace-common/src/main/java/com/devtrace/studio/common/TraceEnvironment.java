package com.devtrace.studio.common;

import com.devtrace.studio.common.publish.BatchingHttpTracePublisher;
import com.devtrace.studio.common.publish.NoopTracePublisher;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.SdkTracerProviderBuilder;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.samplers.Sampler;

import java.util.concurrent.atomic.AtomicBoolean;

public final class TraceEnvironment {
    private static final AtomicBoolean INITIALIZED = new AtomicBoolean(false);

    private static volatile TraceConfiguration configuration = new TraceConfiguration(
            "devtrace-service",
            null,
            "http://127.0.0.1:9000/ingest",
            null
    );
    private static volatile OpenTelemetry openTelemetry = OpenTelemetry.noop();
    private static volatile Tracer tracer = openTelemetry.getTracer("devtrace");
    private static volatile TracePublisher publisher = new NoopTracePublisher();

    private TraceEnvironment() {
    }

    public static synchronized void initialize(TraceConfiguration newConfiguration) {
        if (INITIALIZED.get()) {
            return;
        }

        configuration = newConfiguration == null
                ? configuration
                : new TraceConfiguration(
                newConfiguration.serviceName(),
                newConfiguration.instanceId(),
                newConfiguration.backendUrl(),
                newConfiguration.otlpEndpoint(),
                newConfiguration.apiKey()
        );

        Resource resource = Resource.getDefault().merge(Resource.create(Attributes.builder()
                .put("service.name", configuration.serviceName())
                .put("service.instance.id", configuration.instanceId())
                .build()));

        SdkTracerProviderBuilder tracerProviderBuilder = SdkTracerProvider.builder()
                .setSampler(Sampler.parentBased(Sampler.alwaysOn()))
                .setResource(resource);

        if (configuration.otlpEndpoint() != null && !configuration.otlpEndpoint().isBlank()) {
            OtlpGrpcSpanExporter exporter = OtlpGrpcSpanExporter.builder()
                    .setEndpoint(configuration.otlpEndpoint())
                    .build();
            tracerProviderBuilder.addSpanProcessor(BatchSpanProcessor.builder(exporter).build());
        }

        OpenTelemetrySdk sdk;
        try {
            sdk = OpenTelemetrySdk.builder()
                    .setTracerProvider(tracerProviderBuilder.build())
                    .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
                    .buildAndRegisterGlobal();
        } catch (Exception ignored) {
            // Another OTel SDK is already registered globally – build without registering
            sdk = OpenTelemetrySdk.builder()
                    .setTracerProvider(tracerProviderBuilder.build())
                    .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
                    .build();
        }

        openTelemetry = sdk;
        tracer = sdk.getTracer("com.devtrace.studio");
        publisher = configuration.backendUrl() == null || configuration.backendUrl().isBlank()
                ? new NoopTracePublisher()
                : new BatchingHttpTracePublisher(configuration.backendUrl(), 200, configuration.apiKey());

        INITIALIZED.set(true);
    }

    public static boolean isInitialized() {
        return INITIALIZED.get();
    }

    public static TraceConfiguration configuration() {
        return configuration;
    }

    public static OpenTelemetry openTelemetry() {
        return openTelemetry;
    }

    public static Tracer tracer() {
        return tracer;
    }

    public static TracePublisher publisher() {
        return publisher;
    }

    public static TraceEvent enrich(TraceEvent event) {
        return TraceEvent.builder(event.type(), event.name())
                .eventId(event.eventId())
                .timestamp(event.timestamp())
                .service(event.service() == null ? configuration.serviceName() : event.service())
                .instanceId(event.instanceId() == null ? configuration.instanceId() : event.instanceId())
                .traceId(event.traceId())
                .spanId(event.spanId())
                .parentSpanId(event.parentSpanId())
                .requestId(event.requestId())
                .component(event.component())
                .status(event.status())
                .threadName(event.threadName())
                .className(event.className())
                .methodName(event.methodName())
                .startTime(event.startTime())
                .endTime(event.endTime())
                .durationMs(event.durationMs())
                .attributes(event.attributes())
                .build();
    }

    public static synchronized void updateConfigurationMetadata(TraceConfiguration newConfiguration) {
        if (newConfiguration == null) {
            return;
        }
        configuration = new TraceConfiguration(
                newConfiguration.serviceName(),
                configuration.instanceId(),
                configuration.backendUrl(),
                newConfiguration.otlpEndpoint(),
                configuration.apiKey()
        );
    }
}
