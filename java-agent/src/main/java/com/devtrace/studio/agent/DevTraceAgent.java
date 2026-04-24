package com.devtrace.studio.agent;

import com.devtrace.studio.agent.advice.BeanCreationAdvice;
import com.devtrace.studio.agent.advice.FrameworkServletAdvice;
import com.devtrace.studio.agent.advice.HandlerMethodAdvice;
import com.devtrace.studio.agent.advice.RestTemplateExecuteAdvice;
import com.devtrace.studio.agent.advice.SpringApplicationRunAdvice;
import com.devtrace.studio.common.TraceConfiguration;
import com.devtrace.studio.common.TraceEnvironment;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.asm.Advice;
import net.bytebuddy.description.type.TypeDescription;
import net.bytebuddy.matcher.ElementMatchers;
import net.bytebuddy.utility.JavaModule;

import java.lang.instrument.Instrumentation;
import java.lang.management.ClassLoadingMXBean;
import java.lang.management.ManagementFactory;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static net.bytebuddy.matcher.ElementMatchers.nameStartsWith;
import static net.bytebuddy.matcher.ElementMatchers.named;
import static net.bytebuddy.matcher.ElementMatchers.takesArgument;

public final class DevTraceAgent {
    private static final AtomicBoolean INSTALLED = new AtomicBoolean(false);

    private DevTraceAgent() {
    }

    public static void premain(String agentArgs, Instrumentation instrumentation) {
        install(agentArgs, instrumentation, "premain");
    }

    public static void agentmain(String agentArgs, Instrumentation instrumentation) {
        install(agentArgs, instrumentation, "agentmain");
    }

    private static void install(String agentArgs, Instrumentation instrumentation, String mode) {
        if (!INSTALLED.compareAndSet(false, true)) {
            return;
        }

        AgentSettings settings = AgentSettings.parse(agentArgs);
        AgentRuntimeGuard.initialize(settings);

        TraceEnvironment.initialize(new TraceConfiguration(
                settings.serviceName(),
                settings.instanceId(),
                settings.backendUrl(),
                settings.otlpEndpoint(),
                settings.apiKey()
        ));

        TraceOperations.emit(TraceEventType.AGENT_ATTACHED, "devtrace.agent", "java-agent", Map.of("mode", mode));
        TraceOperations.emit(TraceEventType.JVM_STARTED, "jvm.start", "jvm", Map.of(
                "javaVersion", System.getProperty("java.version"),
                "vmName", System.getProperty("java.vm.name")
        ));

        installClassLoadingSampler();

        AgentBuilder.Listener listener = new AgentBuilder.Listener() {
            @Override
            public void onDiscovery(String typeName, ClassLoader classLoader, JavaModule module, boolean loaded) {
            }

            @Override
            public void onTransformation(TypeDescription typeDescription, ClassLoader classLoader, JavaModule module, boolean loaded, net.bytebuddy.dynamic.DynamicType dynamicType) {
                if (settings.shouldTrackClass(typeDescription.getName())) {
                    TraceOperations.emit(TraceEventType.CLASS_TRANSFORMED, typeDescription.getName(), "classloader", Map.of(
                            "loaded", loaded,
                            "classLoader", classLoader == null ? "bootstrap" : classLoader.getClass().getName()
                    ));
                }
            }

            @Override
            public void onIgnored(TypeDescription typeDescription, ClassLoader classLoader, JavaModule module, boolean loaded) {
            }

            @Override
            public void onError(String typeName, ClassLoader classLoader, JavaModule module, boolean loaded, Throwable throwable) {
                TraceOperations.emit(TraceEventType.ERROR, typeName + ".instrumentation", "java-agent", Map.of(
                        "message", throwable.getMessage(),
                        "loaded", loaded
                ));
            }

            @Override
            public void onComplete(String typeName, ClassLoader classLoader, JavaModule module, boolean loaded) {
            }
        };

        new AgentBuilder.Default()
                .ignore(
                        nameStartsWith("net.bytebuddy.")
                                .or(nameStartsWith("java."))
                                .or(nameStartsWith("jdk."))
                                .or(nameStartsWith("sun."))
                                .or(nameStartsWith("com.devtrace.studio."))
                )
                .with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION)
                .with(listener)
                .type(named("org.springframework.boot.SpringApplication"))
                .transform((builder, typeDescription, classLoader, module, protectionDomain) ->
                        builder.visit(Advice.to(SpringApplicationRunAdvice.class).on(named("run"))))
                .type(named("org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory"))
                .transform((builder, typeDescription, classLoader, module, protectionDomain) ->
                        builder.visit(Advice.to(BeanCreationAdvice.class).on(named("createBean").and(takesArgument(0, String.class)))))
                .type(named("org.springframework.web.servlet.FrameworkServlet"))
                .transform((builder, typeDescription, classLoader, module, protectionDomain) ->
                        builder.visit(Advice.to(FrameworkServletAdvice.class).on(named("doService"))))
                .type(named("org.springframework.web.method.support.InvocableHandlerMethod"))
                .transform((builder, typeDescription, classLoader, module, protectionDomain) ->
                        builder.visit(Advice.to(HandlerMethodAdvice.class).on(named("doInvoke"))))
                .type(named("org.springframework.web.client.RestTemplate"))
                .transform((builder, typeDescription, classLoader, module, protectionDomain) ->
                        builder.visit(Advice.to(RestTemplateExecuteAdvice.class).on(named("doExecute"))))
                .installOn(instrumentation);
    }

    private static void installClassLoadingSampler() {
        ClassLoadingMXBean classLoadingMXBean = ManagementFactory.getClassLoadingMXBean();
        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread thread = new Thread(r, "devtrace-class-loader");
            thread.setDaemon(true);
            return thread;
        });

        scheduler.scheduleAtFixedRate(() -> TraceOperations.emit(
                TraceEventType.CLASS_LOADING_SNAPSHOT,
                "classloader.snapshot",
                "jvm",
                Map.of(
                        "loadedClassCount", classLoadingMXBean.getLoadedClassCount(),
                        "totalLoadedClassCount", classLoadingMXBean.getTotalLoadedClassCount(),
                        "unloadedClassCount", classLoadingMXBean.getUnloadedClassCount()
                )
        ), 1, 2, TimeUnit.SECONDS);
    }
}
