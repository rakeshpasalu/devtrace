package com.devtrace.studio.spring;

import org.springframework.beans.BeansException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

public class DevTraceTaskExecutorBeanPostProcessor implements BeanPostProcessor {
    private final ObjectProvider<DevTraceTaskDecorator> taskDecoratorProvider;

    public DevTraceTaskExecutorBeanPostProcessor(ObjectProvider<DevTraceTaskDecorator> taskDecoratorProvider) {
        this.taskDecoratorProvider = taskDecoratorProvider;
    }

    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {
        if (bean instanceof ThreadPoolTaskExecutor executor) {
            DevTraceTaskDecorator taskDecorator = taskDecoratorProvider.getIfAvailable();
            if (taskDecorator != null) {
                executor.setTaskDecorator(taskDecorator);
            }
        }
        return bean;
    }
}
