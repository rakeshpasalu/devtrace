package com.devtrace.studio.spring;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.RestTemplateCustomizer;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@EnableConfigurationProperties(DevTraceProperties.class)
@ConditionalOnProperty(prefix = "devtrace", name = "enabled", matchIfMissing = true)
public class DevTraceAutoConfiguration {
    @Bean
    @ConditionalOnProperty(prefix = "devtrace", name = "method-tracing-enabled", matchIfMissing = true)
    @ConditionalOnMissingBean
    DevTraceMethodTraceAspect devTraceMethodTraceAspect() {
        return new DevTraceMethodTraceAspect();
    }

    @Bean
    @ConditionalOnProperty(prefix = "devtrace", name = "async-tracing-enabled", matchIfMissing = true)
    @ConditionalOnMissingBean
    DevTraceTaskDecorator devTraceTaskDecorator() {
        return new DevTraceTaskDecorator();
    }

    @Bean
    @ConditionalOnProperty(prefix = "devtrace", name = "async-tracing-enabled", matchIfMissing = true)
    @ConditionalOnMissingBean
    static DevTraceTaskExecutorBeanPostProcessor devTraceTaskExecutorBeanPostProcessor(ObjectProvider<DevTraceTaskDecorator> taskDecoratorProvider) {
        return new DevTraceTaskExecutorBeanPostProcessor(taskDecoratorProvider);
    }

    @Bean
    @ConditionalOnProperty(prefix = "devtrace", name = "rest-template-tracing-enabled", matchIfMissing = true)
    @ConditionalOnMissingBean
    DevTraceRestTemplateInterceptor devTraceRestTemplateInterceptor() {
        return new DevTraceRestTemplateInterceptor();
    }

    @Bean
    @ConditionalOnProperty(prefix = "devtrace", name = "rest-template-tracing-enabled", matchIfMissing = true)
    RestTemplateCustomizer devTraceRestTemplateCustomizer(DevTraceRestTemplateInterceptor interceptor) {
        return restTemplate -> {
            boolean alreadyInstalled = restTemplate.getInterceptors().stream().anyMatch(existing -> existing.getClass().equals(interceptor.getClass()));
            if (!alreadyInstalled) {
                restTemplate.getInterceptors().add(interceptor);
            }
        };
    }

    @Bean
    @ConditionalOnProperty(prefix = "devtrace", name = "bean-graph-enabled", matchIfMissing = true)
    @ConditionalOnMissingBean
    DevTraceBeanGraphEmitter devTraceBeanGraphEmitter(org.springframework.beans.factory.config.ConfigurableListableBeanFactory beanFactory) {
        return new DevTraceBeanGraphEmitter(beanFactory);
    }

    @Bean
    @ConditionalOnProperty(prefix = "devtrace", name = "auto-configuration-enabled", matchIfMissing = true)
    @ConditionalOnMissingBean
    DevTraceConditionReportEmitter devTraceConditionReportEmitter() {
        return new DevTraceConditionReportEmitter();
    }

    @org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    @ConditionalOnClass(name = "jakarta.servlet.Filter")
    @ConditionalOnProperty(prefix = "devtrace", name = "request-tracing-enabled", matchIfMissing = true)
    static class ServletTracingConfiguration {
        @Bean
        @ConditionalOnMissingBean(name = "devTraceRequestTracingFilter")
        org.springframework.web.filter.OncePerRequestFilter devTraceRequestTracingFilter(DevTraceProperties properties) {
            return new DevTraceRequestTracingFilter(properties);
        }
    }

    @org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
    @ConditionalOnClass(name = {
            "org.springframework.web.reactive.function.client.WebClient",
            "org.springframework.boot.web.reactive.function.client.WebClientCustomizer"
    })
    @ConditionalOnProperty(prefix = "devtrace", name = "web-client-tracing-enabled", matchIfMissing = true)
    static class WebClientTracingConfiguration {
        @Bean
        @ConditionalOnMissingBean
        DevTraceWebClientFilter devTraceWebClientFilter() {
            return new DevTraceWebClientFilter();
        }

        @Bean
        org.springframework.boot.web.reactive.function.client.WebClientCustomizer devTraceWebClientCustomizer(DevTraceWebClientFilter filterFunction) {
            return builder -> builder.filter(filterFunction);
        }
    }

    @org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
    @ConditionalOnClass(name = {
            "org.hibernate.resource.jdbc.spi.StatementInspector",
            "org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer"
    })
    @ConditionalOnProperty(prefix = "devtrace", name = "hibernate-tracing-enabled", matchIfMissing = true)
    static class HibernateTracingConfiguration {
        @Bean
        @ConditionalOnMissingBean
        DevTraceHibernateStatementInspector devTraceHibernateStatementInspector() {
            return new DevTraceHibernateStatementInspector();
        }

        @Bean
        org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer devTraceHibernatePropertiesCustomizer(ObjectProvider<DevTraceHibernateStatementInspector> inspectorProvider) {
            return properties -> inspectorProvider.ifAvailable(inspector ->
                    properties.put("hibernate.session_factory.statement_inspector", inspector));
        }
    }
}
