package com.devtrace.studio.spring;

import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import org.springframework.boot.autoconfigure.condition.ConditionEvaluationReport;
import org.springframework.boot.autoconfigure.condition.ConditionOutcome;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;

import java.util.Map;

public class DevTraceConditionReportEmitter implements ApplicationListener<ApplicationReadyEvent> {
    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        ConditionEvaluationReport report = ConditionEvaluationReport.get(event.getApplicationContext().getBeanFactory());
        report.getConditionAndOutcomesBySource().forEach((source, outcomes) -> {
            long matches = 0;
            long nonMatches = 0;
            for (var conditionAndOutcome : outcomes) {
                if (conditionAndOutcome.getOutcome().isMatch()) {
                    matches++;
                } else {
                    nonMatches++;
                }
            }

            TraceOperations.publish(
                    TraceEvent.builder(TraceEventType.AUTO_CONFIGURATION, source)
                            .component("auto-configuration")
                            .status(matches > 0 ? "MATCH" : "NO_MATCH")
                            .attributes(Map.of(
                                    "positiveMatches", matches,
                                    "negativeMatches", nonMatches
                            ))
                            .build()
            );

            outcomes.forEach(conditionAndOutcome -> emitCondition(source, conditionAndOutcome.getOutcome()));
        });
    }

    private void emitCondition(String source, ConditionOutcome outcome) {
        TraceOperations.publish(
                TraceEvent.builder(TraceEventType.AUTO_CONFIGURATION, source)
                        .component("auto-configuration")
                        .status(outcome.isMatch() ? "MATCH" : "NO_MATCH")
                        .attribute("message", outcome.getMessage())
                        .build()
        );
    }
}

