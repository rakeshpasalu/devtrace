package com.devtrace.studio.spring;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class DevTraceAutoConfigurationTest {
    private final WebApplicationContextRunner contextRunner = new WebApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(
                    WebMvcAutoConfiguration.class,
                    DevTraceAutoConfiguration.class
            ))
            .withPropertyValues(
                    "devtrace.enabled=true",
                    "devtrace.request-tracing-enabled=true"
            );

    @Test
    void registersServletTracingBeansByDefault() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(DevTraceMethodTraceAspect.class);
            assertThat(context).hasSingleBean(DevTraceTaskDecorator.class);
            assertThat(context).hasBean("devTraceRequestTracingFilter");
        });
    }
}
