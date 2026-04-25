package com.devtrace.studio.spring;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

public class DevTraceLogAppenderInstaller {
    private final DevTraceProperties properties;
    private volatile DevTraceLogbackAppender appender;
    private final List<Logger> attachedLoggers = new ArrayList<>();

    public DevTraceLogAppenderInstaller(DevTraceProperties properties) {
        this.properties = properties;
    }
    @PostConstruct
    public void install() {
        if (!(LoggerFactory.getILoggerFactory() instanceof LoggerContext loggerContext)) {
            return;
        }
        appender = new DevTraceLogbackAppender();
        appender.setContext(loggerContext);
        appender.setName("devtrace-log-forwarder");
        String threshold = properties.getLogThreshold();
        if (threshold != null) {
            try {
                appender.setThreshold(Level.valueOf(threshold.toUpperCase()));
            } catch (Exception ignored) {
                appender.setThreshold(Level.DEBUG);
            }
        }
        appender.start();

        // Attach to root logger
        Logger rootLogger = loggerContext.getLogger(Logger.ROOT_LOGGER_NAME);
        rootLogger.addAppender(appender);
        attachedLoggers.add(rootLogger);

        // Also attach to any loggers with additivity=false so their logs are not missed
        for (Logger logger : loggerContext.getLoggerList()) {
            if (!logger.isAdditive() && !logger.getName().equals(Logger.ROOT_LOGGER_NAME)) {
                logger.addAppender(appender);
                attachedLoggers.add(logger);
            }
        }
    }
    @PreDestroy
    public void uninstall() {
        if (appender != null) {
            for (Logger logger : attachedLoggers) {
                logger.detachAppender(appender);
            }
            attachedLoggers.clear();
            appender.stop();
        }
    }
}
