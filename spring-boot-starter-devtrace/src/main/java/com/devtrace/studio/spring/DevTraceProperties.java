package com.devtrace.studio.spring;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "devtrace")
public class DevTraceProperties {
    private boolean enabled = true;
    private String backendUrl = "http://127.0.0.1:9000";
    private String otlpEndpoint;
    private String serviceName;
    private String instanceId;
    private String apiKey;
    private boolean requestTracingEnabled = true;
    private boolean methodTracingEnabled = true;
    private boolean beanGraphEnabled = true;
    private boolean autoConfigurationEnabled = true;
    private boolean asyncTracingEnabled = true;
    private boolean hibernateTracingEnabled = true;
    private boolean restTemplateTracingEnabled = true;
    private boolean webClientTracingEnabled = true;
    private boolean logTracingEnabled = true;
    private String logThreshold = "DEBUG";
    private final List<String> excludedPathPrefixes = new ArrayList<>(List.of("/favicon.ico"));

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getBackendUrl() {
        return backendUrl;
    }

    public void setBackendUrl(String backendUrl) {
        this.backendUrl = backendUrl;
    }

    public String getOtlpEndpoint() {
        return otlpEndpoint;
    }

    public void setOtlpEndpoint(String otlpEndpoint) {
        this.otlpEndpoint = otlpEndpoint;
    }

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public String getInstanceId() {
        return instanceId;
    }

    public void setInstanceId(String instanceId) {
        this.instanceId = instanceId;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public boolean isRequestTracingEnabled() {
        return requestTracingEnabled;
    }

    public void setRequestTracingEnabled(boolean requestTracingEnabled) {
        this.requestTracingEnabled = requestTracingEnabled;
    }

    public boolean isMethodTracingEnabled() {
        return methodTracingEnabled;
    }

    public void setMethodTracingEnabled(boolean methodTracingEnabled) {
        this.methodTracingEnabled = methodTracingEnabled;
    }

    public boolean isBeanGraphEnabled() {
        return beanGraphEnabled;
    }

    public void setBeanGraphEnabled(boolean beanGraphEnabled) {
        this.beanGraphEnabled = beanGraphEnabled;
    }

    public boolean isAutoConfigurationEnabled() {
        return autoConfigurationEnabled;
    }

    public void setAutoConfigurationEnabled(boolean autoConfigurationEnabled) {
        this.autoConfigurationEnabled = autoConfigurationEnabled;
    }

    public boolean isAsyncTracingEnabled() {
        return asyncTracingEnabled;
    }

    public void setAsyncTracingEnabled(boolean asyncTracingEnabled) {
        this.asyncTracingEnabled = asyncTracingEnabled;
    }

    public boolean isHibernateTracingEnabled() {
        return hibernateTracingEnabled;
    }

    public void setHibernateTracingEnabled(boolean hibernateTracingEnabled) {
        this.hibernateTracingEnabled = hibernateTracingEnabled;
    }

    public boolean isRestTemplateTracingEnabled() {
        return restTemplateTracingEnabled;
    }

    public void setRestTemplateTracingEnabled(boolean restTemplateTracingEnabled) {
        this.restTemplateTracingEnabled = restTemplateTracingEnabled;
    }

    public boolean isWebClientTracingEnabled() {
        return webClientTracingEnabled;
    }

    public void setWebClientTracingEnabled(boolean webClientTracingEnabled) {
        this.webClientTracingEnabled = webClientTracingEnabled;
    }

    public boolean isLogTracingEnabled() {
        return logTracingEnabled;
    }

    public void setLogTracingEnabled(boolean logTracingEnabled) {
        this.logTracingEnabled = logTracingEnabled;
    }

    public String getLogThreshold() {
        return logThreshold;
    }

    public void setLogThreshold(String logThreshold) {
        this.logThreshold = logThreshold;
    }

    public List<String> getExcludedPathPrefixes() {
        return excludedPathPrefixes;
    }
}

