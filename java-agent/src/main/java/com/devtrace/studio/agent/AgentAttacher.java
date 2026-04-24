package com.devtrace.studio.agent;

import net.bytebuddy.agent.ByteBuddyAgent;

import java.io.File;

public final class AgentAttacher {
    private AgentAttacher() {
    }

    public static void main(String[] args) {
        if (args.length < 2) {
            System.out.println("Usage: java -jar java-agent.jar <agent-jar-path> <pid> [agentArgs]");
            return;
        }

        String agentJar = args[0];
        String pid = args[1];
        String agentArgs = args.length > 2 ? args[2] : "";

        ByteBuddyAgent.attach(new File(agentJar), pid, agentArgs);
        System.out.printf("Attached devtrace agent to pid %s%n", pid);
    }
}

