package com.devtrace.studio.spring;

import com.devtrace.studio.common.TraceEvent;
import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;

import java.util.Arrays;

public class DevTraceBeanGraphEmitter implements ApplicationListener<ApplicationReadyEvent> {
    private final ConfigurableListableBeanFactory beanFactory;

    public DevTraceBeanGraphEmitter(ConfigurableListableBeanFactory beanFactory) {
        this.beanFactory = beanFactory;
    }

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        for (String beanName : beanFactory.getBeanDefinitionNames()) {
            BeanDefinition definition = beanFactory.getBeanDefinition(beanName);
            String beanClassName = definition.getBeanClassName();

            TraceOperations.publish(
                    TraceEvent.builder(TraceEventType.BEAN_NODE, beanName)
                            .component("bean-graph")
                            .className(beanClassName)
                            .attribute("scope", definition.getScope() == null || definition.getScope().isBlank() ? "singleton" : definition.getScope())
                            .attribute("role", definition.getRole())
                            .attribute("beanName", beanName)
                            .build()
            );

            Arrays.stream(beanFactory.getDependenciesForBean(beanName))
                    .forEach(dependency -> TraceOperations.publish(
                            TraceEvent.builder(TraceEventType.BEAN_EDGE, beanName + "->" + dependency)
                                    .component("bean-graph")
                                    .attribute("source", beanName)
                                    .attribute("target", dependency)
                                    .build()
                    ));
        }
    }
}

