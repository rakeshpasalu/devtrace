import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const FAQ_DATA = [
  {
    category: "Getting Started",
    items: [
      {
        q: "What is DevTrace Studio?",
        a: "DevTrace Studio is an enterprise-grade runtime observability platform for Spring Boot applications. It lets you monitor what happens inside your app — from JVM boot to live request handling — without modifying any business code."
      },
      {
        q: "How do I connect my Spring Boot app?",
        a: "You have two options:\n\n1. **Zero-code mode** — Use the Java agent to attach to any existing Spring Boot fat jar without touching source code.\n2. **Starter mode** — Add the `spring-boot-starter-devtrace` dependency to your project for deeper runtime insight including bean graphs, async tracing, and Hibernate SQL visibility."
      },
      {
        q: "Do I need both the agent and the starter?",
        a: "No, either one works independently. However, using both together gives the richest experience: the agent provides JVM startup visibility while the starter provides deep Spring-aware runtime insight. When both are present, hooks are automatically de-duplicated."
      },
      {
        q: "What ports does DevTrace use?",
        a: "By default:\n• **9000** — Collector backend (ingest + API + WebSocket)\n• **5173** — Frontend dev server\n• Your app runs on its own port (e.g. 8080)"
      }
    ]
  },
  {
    category: "Trace Explorer",
    items: [
      {
        q: "What is a trace?",
        a: "A trace represents the full lifecycle of a single HTTP request through your application. It includes all spans (controller calls, service method invocations, database queries, outbound HTTP calls) that occurred during that request."
      },
      {
        q: "How do I search for a specific request?",
        a: "Use the global search bar in the header. You can search by trace ID, request ID, HTTP method, path, or service name. You can also filter by status (All, In Progress, 200 OK, Errors) using the dropdown on the Trace Explorer page."
      },
      {
        q: "What do the status colors mean?",
        a: "• **Green (OK)** — The request completed successfully (e.g. HTTP 200)\n• **Red (Error)** — The request resulted in an error\n• **Amber (Pending)** — The request is still in progress"
      },
      {
        q: "What is the Execution Timeline?",
        a: "The timeline shows a Gantt-style visualization of span timing within a request. Each bar represents a span, and its width/position shows when it started and how long it took relative to the overall request duration."
      }
    ]
  },
  {
    category: "Dashboard & Diagnostics",
    items: [
      {
        q: "What are Hot Components?",
        a: "Hot Components are the most frequently invoked or slowest parts of your application. DevTrace automatically ranks components by event count and slow span count, helping you identify performance bottlenecks."
      },
      {
        q: "What counts as a slow span?",
        a: "By default, any span that takes longer than the configured threshold (typically 150ms) is flagged as slow. These are highlighted in the Diagnostics page for quick investigation."
      },
      {
        q: "Is the data persisted?",
        a: "By default, DevTrace uses in-memory storage optimized for local development. Data is bounded and will rotate when limits are reached. For production use, you can extend the collector to persist to Elasticsearch, OpenSearch, or integrate with OpenTelemetry Collector."
      }
    ]
  },
  {
    category: "Bean Graph",
    items: [
      {
        q: "When does the bean graph appear?",
        a: "The bean dependency graph is populated after Spring reaches the `ApplicationReadyEvent`. If you're using agent-only mode, bean graphs require the starter dependency to be present."
      },
      {
        q: "What do the node colors mean?",
        a: "• **Green** — Your application beans (classes starting with your app package)\n• **Blue** — Framework/library beans\n• **Orange** — Prototype-scoped beans"
      }
    ]
  },
  {
    category: "Request Replay",
    items: [
      {
        q: "What is Request Replay?",
        a: "Replay lets you step through a trace event-by-event in chronological order. It's useful for understanding the exact sequence of operations during a request, especially for debugging complex async flows."
      },
      {
        q: "How do I replay a request?",
        a: "1. Select a trace in the Trace Explorer\n2. Click the **Replay** button in the page header, or navigate to the Request Replay page\n3. Use the Play/Pause controls and slider to step through events"
      }
    ]
  },
  {
    category: "Troubleshooting",
    items: [
      {
        q: "The UI shows 'Disconnected' — what should I do?",
        a: "Check that:\n1. The collector backend is running on port 9000\n2. Your browser can reach `http://127.0.0.1:9000/api/health`\n3. No firewall or proxy is blocking WebSocket connections"
      },
      {
        q: "I see no requests in the Trace Explorer",
        a: "Verify:\n1. The collector is running on port 9000\n2. Your app can reach `http://127.0.0.1:9000/ingest`\n3. Your app is launched with the agent or includes the starter dependency\n4. You are hitting the instrumented app, not another instance"
      },
      {
        q: "Port 8080 is already in use",
        a: "Run your app on a different port using the `--server-port` flag:\n```\n./scripts/run-boot-app-with-agent.sh your-app.jar --service-name my-app --server-port 18081\n```"
      }
    ]
  }
];

export default function FaqPage() {
  const [openItems, setOpenItems] = useState(new Set());

  function toggle(key) {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <div className="page-header">
        <h1>Frequently Asked Questions</h1>
      </div>
      <div className="faq-container">
        {FAQ_DATA.map((section) => (
          <div key={section.category} className="faq-section">
            <h2 className="faq-section-title">{section.category}</h2>
            <div className="faq-list">
              {section.items.map((item, i) => {
                const key = `${section.category}-${i}`;
                const isOpen = openItems.has(key);
                return (
                  <div key={key} className={`faq-item ${isOpen ? "is-open" : ""}`}>
                    <button className="faq-question" onClick={() => toggle(key)} type="button">
                      <span>{item.q}</span>
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {isOpen && (
                      <div className="faq-answer">
                        {item.a.split("\n").map((line, li) => (
                          <p key={li}>{line}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
