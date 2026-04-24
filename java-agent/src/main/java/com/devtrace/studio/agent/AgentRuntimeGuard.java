package com.devtrace.studio.agent;

public final class AgentRuntimeGuard {
    private static volatile boolean runtimeHooksEnabled = true;
    private static volatile Boolean starterPresent;

    private AgentRuntimeGuard() {
    }

    public static void initialize(AgentSettings settings) {
        runtimeHooksEnabled = settings.runtimeHooksEnabled();
    }

    public static boolean runtimeHooksEnabled() {
        return runtimeHooksEnabled && !isStarterPresent();
    }

    private static boolean isStarterPresent() {
        if (starterPresent != null) {
            return starterPresent;
        }

        try {
            Class.forName("com.devtrace.studio.spring.DevTraceAutoConfiguration", false, ClassLoader.getSystemClassLoader());
            starterPresent = true;
        } catch (ClassNotFoundException ignored) {
            starterPresent = false;
        }

        return starterPresent;
    }
}

