package com.devtrace.studio.spring;

import com.devtrace.studio.common.TraceEventType;
import com.devtrace.studio.common.TraceOperations;
import org.hibernate.resource.jdbc.spi.StatementInspector;

import java.util.Map;

public class DevTraceHibernateStatementInspector implements StatementInspector {
    @Override
    public String inspect(String sql) {
        TraceOperations.emit(TraceEventType.DATABASE_QUERY, "hibernate.query", "database", Map.of(
                "sql", compact(sql)
        ));
        return sql;
    }

    private String compact(String sql) {
        return sql == null ? "" : sql.replaceAll("\\s+", " ").trim();
    }
}

