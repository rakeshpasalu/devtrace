package com.devtrace.studio.common.publish;

import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TracePublisher;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.OutputStream;
import java.net.Proxy;
import java.net.URI;
import java.net.HttpURLConnection;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.nio.charset.StandardCharsets;

public final class BatchingHttpTracePublisher implements TracePublisher {
    private static final int DEFAULT_BATCH_SIZE = 200;

    private final BlockingQueue<TraceEvent> queue = new LinkedBlockingQueue<>(5_000);
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "devtrace-publisher");
        thread.setDaemon(true);
        return thread;
    });
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final URI endpoint;
    private final int batchSize;
    private final String apiKey;
    private final AtomicLong droppedEvents = new AtomicLong();

    public BatchingHttpTracePublisher(String endpointUrl) {
        this(endpointUrl, DEFAULT_BATCH_SIZE, null);
    }

    public BatchingHttpTracePublisher(String endpointUrl, int batchSize) {
        this(endpointUrl, batchSize, null);
    }

    public BatchingHttpTracePublisher(String endpointUrl, int batchSize, String apiKey) {
        this.endpoint = URI.create(Objects.requireNonNull(endpointUrl, "endpointUrl"));
        this.batchSize = batchSize;
        this.apiKey = apiKey;
        this.scheduler.scheduleAtFixedRate(this::flushQuietly, 200, 200, TimeUnit.MILLISECONDS);
        Runtime.getRuntime().addShutdownHook(new Thread(this::close, "devtrace-publisher-shutdown"));
    }

    @Override
    public void publish(TraceEvent event) {
        if (!queue.offer(event)) {
            droppedEvents.incrementAndGet();
        }
    }

    @Override
    public synchronized void flush() {
        List<TraceEvent> batch = new ArrayList<>(batchSize);
        queue.drainTo(batch, batchSize);
        if (batch.isEmpty()) {
            return;
        }

        try {
            String payload = objectMapper.writeValueAsString(batch);
            HttpURLConnection connection = (HttpURLConnection) endpoint.toURL().openConnection(Proxy.NO_PROXY);
            connection.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
            connection.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            if (apiKey != null && !apiKey.isBlank()) {
                connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            }
            connection.setDoOutput(true);

            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(payload.getBytes(StandardCharsets.UTF_8));
            }

            int status = connection.getResponseCode();
            if (status >= 300) {
                System.err.printf("devtrace publisher received status %s from %s%n", status, endpoint);
            }
            connection.disconnect();
        } catch (IOException error) {
            System.err.println("devtrace serialization failed: " + error.getMessage());
        }
    }

    @Override
    public synchronized void close() {
        scheduler.shutdown();
        flushQuietly();
        while (!queue.isEmpty()) {
            flushQuietly();
        }
    }

    public long getDroppedEvents() {
        return droppedEvents.get();
    }

    private void flushQuietly() {
        try {
            flush();
        } catch (Exception error) {
            System.err.println("devtrace flush failed: " + error.getMessage());
        }
    }
}
