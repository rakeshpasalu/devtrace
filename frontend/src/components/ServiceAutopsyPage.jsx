import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle, Award, BarChart3, Box, Bug, CheckCircle, ChevronRight,
  Download, FileText, Gauge, Heart, Layers, Loader2, Shield, Skull,
  TrendingDown, TrendingUp, Zap
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDuration } from "../utils.js";

const SEVERITY_COLORS = { critical: "var(--red)", warning: "var(--amber)", info: "var(--accent)" };
const SEVERITY_BG = { critical: "var(--red-glow)", warning: "rgba(251,191,36,0.12)", info: "var(--accent-glow)" };

/* ─── Build report from snapshot (client-side) ─── */
function buildReport(snapshot) {
  const stats = snapshot.stats ?? {};
  const analytics = snapshot.endpointAnalytics ?? [];
  const diag = snapshot.diagnostics ?? {};
  const startup = snapshot.startup ?? {};
  const beanG = snapshot.beanGraph ?? { nodes: [], links: [] };
  const errors = diag.errors ?? [];
  const slowSpans = diag.slowSpans ?? [];
  const services = diag.services ?? [];
  const startupEvts = startup.recentEvents ?? [];
  const nodes = beanG.nodes ?? [];
  const edges = beanG.links ?? [];

  // Bean inventory
  const beanTotal = nodes.length;
  const startupBeans = startupEvts.filter(e => e.type === "BEAN_CREATION").length;
  const runtimeBeans = Math.max(0, beanTotal - startupBeans);

  const entityBeans = nodes.filter(b => /repository|dao|entity|jparepository/i.test(b.className ?? b.id ?? ""));
  const controllerBeans = nodes.filter(b => /controller|restcontroller|endpoint/i.test(b.className ?? b.role ?? b.id ?? ""));
  const serviceBeans = nodes.filter(b => /service|usecase|facade/i.test(b.className ?? b.role ?? b.id ?? ""));

  // AIS (light)
  const outDegree = new Map();
  const inDegree = new Map();
  for (const e of edges) {
    outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  const godBeans = nodes
    .map(n => ({ ...n, dependencyCount: outDegree.get(n.id) ?? 0 }))
    .filter(n => n.dependencyCount > 5)
    .sort((a, b) => b.dependencyCount - a.dependencyCount)
    .slice(0, 10);

  // Health score
  let healthScore = 100;
  const healthDeductions = [];

  const errorRate = stats.retainedRequests > 0 ? errors.length / stats.retainedRequests : 0;
  if (errorRate > 0.1) {
    const d = Math.min(30, Math.round(errorRate * 100));
    healthScore -= d;
    healthDeductions.push({ reason: `High error rate (${(errorRate * 100).toFixed(1)}%)`, points: d });
  }

  const totalEvts = snapshot.recentEvents?.length ?? 1;
  const slowRatio = slowSpans.length / Math.max(1, totalEvts);
  if (slowRatio > 0.05) {
    const d = Math.min(20, Math.round(slowRatio * 200));
    healthScore -= d;
    healthDeductions.push({ reason: `${slowSpans.length} slow spans detected`, points: d });
  }

  const anomalyCount = analytics.filter(a => a.anomaly).length;
  if (anomalyCount > 0) {
    const d = Math.min(15, anomalyCount * 5);
    healthScore -= d;
    healthDeductions.push({ reason: `${anomalyCount} endpoint anomalies`, points: d });
  }

  if (godBeans.length > 0) {
    const d = Math.min(10, godBeans.length * 2);
    healthScore -= d;
    healthDeductions.push({ reason: `${godBeans.length} God Beans detected`, points: d });
  }

  healthScore = Math.max(0, healthScore);

  const grade = healthScore >= 95 ? "A+" : healthScore >= 90 ? "A" : healthScore >= 85 ? "A-"
    : healthScore >= 80 ? "B+" : healthScore >= 75 ? "B" : healthScore >= 70 ? "B-"
    : healthScore >= 65 ? "C+" : healthScore >= 60 ? "C" : healthScore >= 55 ? "C-"
    : healthScore >= 50 ? "D" : "F";

  // Bottlenecks
  const bottlenecks = analytics.filter(a => a.p95 > 0).sort((a, b) => b.p95 - a.p95).slice(0, 5)
    .map(a => ({ endpoint: a.endpoint, p95: a.p95, p99: a.p99, total: a.total, errorRate: a.errorRate, anomaly: a.anomaly }));

  // Recommendations
  const recommendations = [];
  if (godBeans.length > 0) {
    recommendations.push({ severity: "warning", title: "Refactor God Beans", detail: `${godBeans.length} bean(s) have excessive dependencies (>5). Consider splitting: ${godBeans.slice(0, 3).map(b => b.id).join(", ")}` });
  }
  if (bottlenecks.length > 0 && bottlenecks[0].p95 > 500) {
    recommendations.push({ severity: "critical", title: "Optimize Slow Endpoints", detail: `${bottlenecks[0].endpoint} has p95 of ${bottlenecks[0].p95}ms. Add caching, optimize queries, or reduce payload size.` });
  }
  if (anomalyCount > 0) {
    recommendations.push({ severity: "warning", title: "Investigate Latency Regressions", detail: `${anomalyCount} endpoint(s) show recent latency spikes vs baseline.` });
  }
  if (errors.length > 10) {
    const types = [...new Set(errors.slice(-20).map(e => e.attributes?.exceptionType ?? e.name ?? "Unknown"))].slice(0, 3).join(", ");
    recommendations.push({ severity: "critical", title: "Address Runtime Errors", detail: `${errors.length} errors captured. Top types: ${types}` });
  }
  if (startupBeans > 100) {
    recommendations.push({ severity: "info", title: "Consider Lazy Bean Initialization", detail: `${startupBeans} beans created at startup. Use @Lazy or spring.main.lazy-initialization=true.` });
  }

  return {
    generatedAt: new Date().toISOString(),
    serviceName: services[0]?.service ?? "Unknown Service",
    healthScore, grade, healthDeductions, stats,
    beanInventory: {
      total: beanTotal, startup: startupBeans, runtime: runtimeBeans,
      controllers: controllerBeans.length, services: serviceBeans.length, repositories: entityBeans.length,
      controllerNames: controllerBeans.map(b => b.id), serviceNames: serviceBeans.map(b => b.id),
      repositoryNames: entityBeans.map(b => b.id),
    },
    endpointSummary: analytics.slice(0, 20),
    bottlenecks,
    slowSpanSummary: slowSpans.slice(-20).map(s => ({
      name: s.name, component: s.component, durationMs: s.durationMs, className: s.className, methodName: s.methodName,
    })),
    errorSummary: {
      totalErrors: errors.length,
      recentErrors: errors.slice(-10).map(e => ({
        name: e.name, type: e.attributes?.exceptionType ?? "Unknown",
        message: e.attributes?.exceptionMessage ?? "", timestamp: e.timestamp,
      })),
    },
    recommendations,
  };
}

export default function ServiceAutopsyPage({ snapshot }) {
  const [generating, setGenerating] = useState(false);
  const report = useMemo(() => buildReport(snapshot ?? {}), [snapshot]);

  const downloadPDF = useCallback(async () => {
    if (!report) return;
    setGenerating(true);

    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 18;
      const CW = W - 2 * M;
      let y = 0;
      let pageNum = 1;

      // Palette (all RGB arrays - no Unicode anywhere)
      const C = {
        dark: [15, 20, 35], darkCard: [22, 28, 48],
        accent: [96, 165, 250], green: [52, 211, 153], amber: [251, 191, 36],
        red: [239, 68, 68], purple: [167, 139, 250],
        white: [255, 255, 255], offWhite: [248, 250, 252],
        gray100: [241, 245, 249], gray200: [226, 232, 240],
        gray400: [148, 163, 184], gray500: [100, 116, 139],
        gray700: [51, 65, 85], gray900: [15, 23, 42],
      };
      const gradeC = report.healthScore >= 80 ? C.green : report.healthScore >= 60 ? C.amber : C.red;

      function setC(c) { doc.setTextColor(...c); }
      function setF(c) { doc.setFillColor(...c); }
      function setD(c) { doc.setDrawColor(...c); }

      function newPage() {
        doc.addPage(); pageNum += 1; y = M;
        setF(C.white); doc.rect(0, 0, W, H, "F");
        setF(C.accent); doc.rect(0, 0, W, 1.5, "F");
        drawPageFooter();
      }
      function need(h = 30) { if (y + h > H - 20) newPage(); }
      function drawPageFooter() {
        setC(C.gray400); doc.setFontSize(7);
        doc.text("DevTrace Studio  |  Service Autopsy Report", M, H - 7);
        doc.text("Page " + pageNum, W - M, H - 7, { align: "right" });
      }
      function sectionTitle(title) {
        need(20); y += 4;
        setF(C.gray900); doc.roundedRect(M, y, CW, 9, 1.5, 1.5, "F");
        doc.setFontSize(10); setC(C.white);
        doc.text("    " + title, M + 2, y + 6.2);
        y += 14;
      }
      function subTitle(title) {
        need(12); doc.setFontSize(11); setC(C.gray700);
        doc.text(title, M, y); y += 6;
      }
      function scoreBar(x, barY, w, score) {
        const pct = Math.min(1, score / 100);
        const col = score >= 80 ? C.green : score >= 60 ? C.amber : C.red;
        setF(C.gray100); doc.roundedRect(x, barY, w, 4, 2, 2, "F");
        if (pct > 0) { setF(col); doc.roundedRect(x, barY, Math.max(4, w * pct), 4, 2, 2, "F"); }
      }

      // ═══ COVER PAGE ═══
      setF(C.dark); doc.rect(0, 0, W, H, "F");
      setF(C.accent); doc.rect(0, 0, W, 2, "F");
      setF(C.accent); doc.rect(M, 40, 2, 50, "F");

      doc.setFontSize(32); setC(C.white);
      doc.text("Service Autopsy", M + 8, 56);
      doc.setFontSize(14); setC(C.gray400);
      doc.text("Comprehensive Health Report", M + 8, 66);
      doc.setFontSize(12); setC(C.accent);
      doc.text(report.serviceName, M + 8, 80);
      doc.setFontSize(9); setC(C.gray500);
      doc.text(new Date(report.generatedAt).toLocaleString(), M + 8, 88);

      // Grade badge
      const gx = W - M - 40;
      setF(C.darkCard); doc.roundedRect(gx, 42, 40, 50, 4, 4, "F");
      setD(gradeC); doc.setLineWidth(0.8); doc.roundedRect(gx, 42, 40, 50, 4, 4, "S");
      doc.setFontSize(30); setC(gradeC);
      doc.text(report.grade, gx + 20, 62, { align: "center" });
      doc.setFontSize(12);
      doc.text(report.healthScore + "/100", gx + 20, 73, { align: "center" });
      doc.setFontSize(7); setC(C.gray400);
      doc.text("HEALTH SCORE", gx + 20, 82, { align: "center" });

      // Stats row
      const statsData = [
        ["EVENTS", String(report.stats?.totalEvents ?? 0)],
        ["REQUESTS", String(report.stats?.retainedRequests ?? 0)],
        ["BEANS", String(report.beanInventory?.total ?? 0)],
        ["ENDPOINTS", String(report.endpointSummary?.length ?? 0)],
        ["ERRORS", String(report.errorSummary?.totalErrors ?? 0)],
      ];
      const sw = (CW - 4 * 3) / 5;
      statsData.forEach(([lbl, val], i) => {
        const sx = M + i * (sw + 3);
        setF(C.darkCard); doc.roundedRect(sx, 108, sw, 22, 2, 2, "F");
        doc.setFontSize(14); setC(C.white);
        doc.text(val, sx + sw / 2, 119, { align: "center" });
        doc.setFontSize(6); setC(C.gray400);
        doc.text(lbl, sx + sw / 2, 126, { align: "center" });
      });

      doc.setFontSize(9); setC(C.accent);
      doc.text("DevTrace Studio", M, H - 18);
      doc.setFontSize(7); setC(C.gray500);
      doc.text("Spring Boot Observability Platform", M, H - 13);

      // ═══ EXECUTIVE SUMMARY ═══
      newPage();
      sectionTitle("Executive Summary");

      // Health + Error cards side by side
      const hsW = CW / 2 - 5;
      setF(C.gray100); doc.roundedRect(M, y, hsW, 30, 3, 3, "F");
      doc.setFontSize(8); setC(C.gray400); doc.text("OVERALL HEALTH", M + 5, y + 7);
      doc.setFontSize(22); setC(gradeC);
      doc.text(report.grade + "  " + report.healthScore + "/100", M + 5, y + 22);
      scoreBar(M + 5, y + 25, hsW - 10, report.healthScore);

      const erX = M + hsW + 10;
      const errRate = report.stats?.retainedRequests > 0
        ? ((report.errorSummary?.totalErrors ?? 0) / report.stats.retainedRequests * 100).toFixed(1) : "0.0";
      const errC = Number(errRate) > 10 ? C.red : Number(errRate) > 0 ? C.amber : C.green;
      setF(C.gray100); doc.roundedRect(erX, y, hsW, 30, 3, 3, "F");
      doc.setFontSize(8); setC(C.gray400); doc.text("ERROR RATE", erX + 5, y + 7);
      doc.setFontSize(22); setC(errC); doc.text(errRate + "%", erX + 5, y + 22);
      scoreBar(erX + 5, y + 25, hsW - 10, Math.min(100, Number(errRate)));
      y += 38;

      // Health deductions
      if (report.healthDeductions?.length > 0) {
        subTitle("Health Deductions");
        report.healthDeductions.forEach(d => {
          need(8);
          setF(C.red); doc.circle(M + 2, y - 1, 1.2, "F");
          doc.setFontSize(9); setC(C.red); doc.text("-" + d.points + " pts", M + 6, y);
          setC(C.gray700); doc.text(d.reason, M + 22, y);
          y += 5.5;
        });
        y += 4;
      }

      // Recommendations
      if ((report.recommendations ?? []).length > 0) {
        subTitle("Recommendations");
        report.recommendations.forEach(r => {
          need(18);
          const sc = r.severity === "critical" ? C.red : r.severity === "warning" ? C.amber : C.accent;
          setF(sc); doc.roundedRect(M, y - 1, 2, 10, 1, 1, "F");
          doc.setFontSize(6); setC(sc);
          doc.text(r.severity === "critical" ? "CRITICAL" : r.severity === "warning" ? "WARNING" : "INFO", M + 5, y + 1);
          doc.setFontSize(9); setC(C.gray900); doc.text(r.title, M + 26, y + 1);
          doc.setFontSize(8); setC(C.gray500);
          const lines = doc.splitTextToSize(r.detail, CW - 8);
          doc.text(lines, M + 5, y + 6);
          y += 6 + lines.length * 3.5 + 4;
        });
      }

      // ═══ BEAN INVENTORY ═══
      sectionTitle("Bean Inventory");
      const inv = report.beanInventory ?? {};
      const beanStats = [
        ["Total", inv.total], ["Startup", inv.startup], ["Runtime", inv.runtime],
        ["Controllers", inv.controllers], ["Services", inv.services], ["Repos", inv.repositories],
      ];
      const bw = (CW - 5 * 4) / 6;
      beanStats.forEach(([lbl, val], i) => {
        const bx = M + i * (bw + 4);
        setF(C.gray100); doc.roundedRect(bx, y, bw, 18, 2, 2, "F");
        doc.setFontSize(13); setC(C.gray900);
        doc.text(String(val ?? 0), bx + bw / 2, y + 9, { align: "center" });
        doc.setFontSize(6); setC(C.gray400);
        doc.text(lbl.toUpperCase(), bx + bw / 2, y + 15, { align: "center" });
      });
      y += 24;

      [["Controllers", inv.controllerNames], ["Services", inv.serviceNames], ["Repositories", inv.repositoryNames]]
        .filter(([, arr]) => arr?.length > 0).forEach(([title, arr]) => {
          need(15); doc.setFontSize(8); setC(C.gray700);
          doc.text(title + ":", M, y); y += 4;
          doc.setFontSize(7); setC(C.gray500);
          (arr ?? []).slice(0, 8).forEach(n => { doc.text("  - " + n, M + 2, y); y += 3.5; });
          y += 3;
        });

      // ═══ ENDPOINT PERFORMANCE ═══
      sectionTitle("Endpoint Performance");
      if ((report.endpointSummary ?? []).length > 0) {
        autoTable(doc, {
          startY: y, margin: { left: M, right: M },
          head: [["Endpoint", "Calls", "p50", "p95", "p99", "Err%"]],
          body: report.endpointSummary.slice(0, 15).map(e => [
            e.endpoint, String(e.total), e.p50 + "ms", e.p95 + "ms", e.p99 + "ms", e.errorRate + "%",
          ]),
          styles: { fontSize: 7.5, cellPadding: 2.5, textColor: C.gray700, lineColor: C.gray200, lineWidth: 0.2 },
          headStyles: { fillColor: C.accent, textColor: C.white, fontStyle: "bold", fontSize: 7 },
          alternateRowStyles: { fillColor: C.gray100 },
          columnStyles: { 0: { cellWidth: 62 } },
        });
        y = doc.lastAutoTable.finalY + 6;
      } else {
        doc.setFontSize(9); setC(C.gray400); doc.text("No endpoint data captured.", M, y); y += 8;
      }

      // Bottlenecks
      if ((report.bottlenecks ?? []).length > 0) {
        need(30); subTitle("Performance Bottlenecks");
        report.bottlenecks.forEach(b => {
          need(12);
          setF(C.red); doc.roundedRect(M, y - 2, 2, 8, 1, 1, "F");
          doc.setFontSize(8); setC(C.gray900); doc.text(b.endpoint, M + 5, y);
          doc.setFontSize(7); setC(C.gray500);
          doc.text("p95: " + b.p95 + "ms  |  p99: " + b.p99 + "ms  |  " + b.total + " calls  |  err: " + b.errorRate + "%", M + 5, y + 4.5);
          y += 10;
        });
        y += 2;
      }

      // ═══ SLOW SPANS ═══
      if ((report.slowSpanSummary ?? []).length > 0) {
        sectionTitle("Slow Spans");
        autoTable(doc, {
          startY: y, margin: { left: M, right: M },
          head: [["Span Name", "Component", "Duration"]],
          body: report.slowSpanSummary.slice(0, 12).map(s => [
            s.name ?? ((s.className ?? "").split(".").pop() + "." + s.methodName),
            s.component ?? "--", s.durationMs + "ms",
          ]),
          styles: { fontSize: 7.5, cellPadding: 2.5, textColor: C.gray700, lineColor: C.gray200, lineWidth: 0.2 },
          headStyles: { fillColor: C.red, textColor: C.white, fontStyle: "bold", fontSize: 7 },
          alternateRowStyles: { fillColor: [254, 242, 242] },
        });
        y = doc.lastAutoTable.finalY + 6;
      }

      // ═══ ERROR SUMMARY ═══
      sectionTitle("Error Summary (" + (report.errorSummary?.totalErrors ?? 0) + " total)");
      if ((report.errorSummary?.recentErrors ?? []).length > 0) {
        autoTable(doc, {
          startY: y, margin: { left: M, right: M },
          head: [["Error Name", "Exception Type", "Message"]],
          body: report.errorSummary.recentErrors.map(e => [
            e.name ?? "--", e.type ?? "--", (e.message ?? "--").substring(0, 60),
          ]),
          styles: { fontSize: 7.5, cellPadding: 2.5, textColor: C.gray700, lineColor: C.gray200, lineWidth: 0.2 },
          headStyles: { fillColor: C.red, textColor: C.white, fontStyle: "bold", fontSize: 7 },
          alternateRowStyles: { fillColor: [254, 242, 242] },
        });
        y = doc.lastAutoTable.finalY + 6;
      } else {
        doc.setFontSize(9); setC(C.green); doc.text("No errors detected -- service is healthy.", M, y); y += 8;
      }

      // ═══ ARCHITECTURE SCORE ═══
      const ais = report.architectureScore ?? {};
      if (ais.dimensions) {
        sectionTitle("Architecture Intelligence Score");
        const dims = Object.entries(ais.dimensions ?? {});
        const dw = (CW - (dims.length - 1) * 3) / dims.length;
        dims.forEach(([key, val], i) => {
          const dx = M + i * (dw + 3);
          const dc = val >= 80 ? C.green : val >= 60 ? C.amber : C.red;
          setF(C.gray100); doc.roundedRect(dx, y, dw, 22, 2, 2, "F");
          doc.setFontSize(13); setC(dc);
          doc.text(String(val), dx + dw / 2, y + 10, { align: "center" });
          doc.setFontSize(5.5); setC(C.gray400);
          doc.text(key.toUpperCase(), dx + dw / 2, y + 16, { align: "center" });
          scoreBar(dx + 3, y + 18, dw - 6, val);
        });
        y += 28;

        need(12); doc.setFontSize(10); setC(C.gray900);
        doc.text("Overall: " + (ais.overallGrade ?? "?") + " (" + (ais.overallScore ?? 0) + "/100)", M, y);
        y += 8;

        if (ais.godBeans?.length > 0) {
          need(15); subTitle("God Beans (over-connected)");
          ais.godBeans.forEach(b => {
            need(5); doc.setFontSize(7); setC(C.gray700);
            doc.text("- " + b.id + " (" + b.dependencyCount + " deps)", M + 2, y); y += 4;
          });
          y += 3;
        }
        if (ais.startupTax?.length > 0) {
          need(15); subTitle("Startup Tax (slowest to init)");
          ais.startupTax.forEach(b => {
            need(5); doc.setFontSize(7); setC(C.gray700);
            doc.text("- " + b.bean + " (" + b.durationMs + "ms)", M + 2, y); y += 4;
          });
          y += 3;
        }
        if (ais.deepestChain?.length > 1) {
          need(12); subTitle("Deepest Dependency Chain (depth: " + ais.maxChainDepth + ")");
          doc.setFontSize(6.5); setC(C.gray500);
          const chainStr = ais.deepestChain.join(" -> ");
          const lines = doc.splitTextToSize(chainStr, CW);
          doc.text(lines, M + 2, y); y += lines.length * 3 + 4;
        }
      }

      drawPageFooter();
      doc.save("devtrace-autopsy-" + report.serviceName.replace(/[^a-zA-Z0-9]/g, "_") + "-" + Date.now() + ".pdf");
    } catch (err) {
      console.error("PDF generation failed:", err);
    }
    setGenerating(false);
  }, [report]);

  const inv = report.beanInventory ?? {};
  const gradeColor = report.healthScore >= 80 ? "var(--green)" : report.healthScore >= 60 ? "var(--amber)" : "var(--red)";
  const gradeBg = report.healthScore >= 80 ? "var(--green-glow)" : report.healthScore >= 60 ? "rgba(251,191,36,0.12)" : "var(--red-glow)";

  return (
    <div className="autopsy-page">
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Skull size={24} /> Service Autopsy
        </h1>
        <button className="btn btn-primary autopsy-download-btn" onClick={downloadPDF} disabled={generating}>
          {generating ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
          {generating ? "Generating…" : "Download PDF Report"}
        </button>
      </div>

      {/* Hero Grade Card */}
      <div className="autopsy-hero">
        <div className="autopsy-grade-circle" style={{ background: gradeBg, borderColor: gradeColor }}>
          <span className="autopsy-grade-letter" style={{ color: gradeColor }}>{report.grade}</span>
          <span className="autopsy-grade-score" style={{ color: gradeColor }}>{report.healthScore}/100</span>
        </div>
        <div className="autopsy-hero-info">
          <div className="autopsy-service-name">{report.serviceName}</div>
          <div className="autopsy-hero-sub">
            Comprehensive health analysis · {new Date(report.generatedAt).toLocaleString()}
          </div>
          <div className="autopsy-hero-stats">
            <span><strong>{report.stats?.totalEvents ?? 0}</strong> events</span>
            <span><strong>{report.stats?.retainedRequests ?? 0}</strong> requests</span>
            <span><strong>{inv.total}</strong> beans</span>
            <span><strong>{report.errorSummary?.totalErrors ?? 0}</strong> errors</span>
          </div>
        </div>
      </div>

      {/* Deductions */}
      {report.healthDeductions?.length > 0 && (
        <div className="card autopsy-deductions">
          <div className="card-header">
            <span className="card-title"><TrendingDown size={14} /> Health Deductions</span>
          </div>
          <div className="autopsy-deduction-list">
            {report.healthDeductions.map((d, i) => (
              <div key={i} className="autopsy-deduction-item">
                <span className="autopsy-deduction-points">−{d.points}</span>
                <span>{d.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bean Inventory */}
      <div className="autopsy-section-title"><Box size={16} /> Bean Inventory</div>
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-label"><Layers size={14} /> Total Beans</div>
          <div className="metric-value">{inv.total}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><Zap size={14} /> Startup Beans</div>
          <div className="metric-value">{inv.startup}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><Box size={14} /> Runtime Beans</div>
          <div className="metric-value">{inv.runtime}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><Shield size={14} /> Controllers</div>
          <div className="metric-value">{inv.controllers}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><Heart size={14} /> Services</div>
          <div className="metric-value">{inv.services}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label"><BarChart3 size={14} /> Repositories</div>
          <div className="metric-value">{inv.repositories}</div>
        </div>
      </div>

      {/* Recommendations */}
      {(report.recommendations ?? []).length > 0 && (
        <>
          <div className="autopsy-section-title"><AlertTriangle size={16} /> Recommendations</div>
          <div className="autopsy-recommendations">
            {report.recommendations.map((r, i) => (
              <div key={i} className="autopsy-rec-card" style={{ borderColor: SEVERITY_COLORS[r.severity], background: SEVERITY_BG[r.severity] }}>
                <div className="autopsy-rec-header">
                  {r.severity === "critical" ? <Bug size={16} style={{ color: "var(--red)" }} /> :
                    r.severity === "warning" ? <AlertTriangle size={16} style={{ color: "var(--amber)" }} /> :
                      <CheckCircle size={16} style={{ color: "var(--accent)" }} />}
                  <strong>{r.title}</strong>
                  <span className="autopsy-rec-severity" style={{ color: SEVERITY_COLORS[r.severity] }}>
                    {r.severity.toUpperCase()}
                  </span>
                </div>
                <div className="autopsy-rec-detail">{r.detail}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bottlenecks */}
      {(report.bottlenecks ?? []).length > 0 && (
        <>
          <div className="autopsy-section-title"><TrendingUp size={16} /> Performance Bottlenecks</div>
          <div className="autopsy-bottlenecks">
            {report.bottlenecks.map((b, i) => (
              <div key={i} className="signal-row">
                <div>
                  <strong>{b.endpoint}</strong><br />
                  <small>p95: {b.p95}ms · p99: {b.p99}ms · {b.total} calls</small>
                </div>
                <span className="chip" style={{
                  background: b.p95 > 500 ? "var(--red-glow)" : "var(--green-glow)",
                  color: b.p95 > 500 ? "var(--red)" : "var(--green)"
                }}>{b.errorRate}% err</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Endpoint Summary Table */}
      {(report.endpointSummary ?? []).length > 0 && (
        <>
          <div className="autopsy-section-title"><Gauge size={16} /> Endpoint Performance</div>
          <div className="card" style={{ overflow: "auto" }}>
            <table className="autopsy-table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Calls</th>
                  <th>p50</th>
                  <th>p95</th>
                  <th>p99</th>
                  <th>Err %</th>
                </tr>
              </thead>
              <tbody>
                {report.endpointSummary.map((e, i) => (
                  <tr key={i}>
                    <td className="autopsy-endpoint-cell">{e.endpoint}</td>
                    <td>{e.total}</td>
                    <td>{e.p50}ms</td>
                    <td style={{ color: e.p95 > 500 ? "var(--red)" : undefined }}>{e.p95}ms</td>
                    <td style={{ color: e.p99 > 1000 ? "var(--red)" : undefined }}>{e.p99}ms</td>
                    <td style={{ color: e.errorRate > 5 ? "var(--red)" : undefined }}>{e.errorRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Slow Spans */}
      {(report.slowSpanSummary ?? []).length > 0 && (
        <>
          <div className="autopsy-section-title"><AlertTriangle size={16} /> Slow Spans</div>
          <div className="signal-list">
            {report.slowSpanSummary.slice(0, 10).map((s, i) => (
              <div key={i} className="signal-row">
                <div>
                  <strong>{s.name ?? `${(s.className ?? "").split(".").pop()}.${s.methodName}`}</strong><br />
                  <small>{s.component ?? "runtime"}</small>
                </div>
                <span className="chip" style={{ background: "var(--red-glow)", color: "var(--red)" }}>
                  {formatDuration(s.durationMs)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Error Summary */}
      <div className="autopsy-section-title"><Bug size={16} /> Error Summary ({report.errorSummary?.totalErrors ?? 0})</div>
      {(report.errorSummary?.recentErrors ?? []).length > 0 ? (
        <div className="signal-list">
          {report.errorSummary.recentErrors.map((e, i) => (
            <div key={i} className="signal-row is-error">
              <div>
                <strong>{e.name}</strong><br />
                <small>{e.type} · {e.message?.substring(0, 80)}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
          <CheckCircle size={24} style={{ marginBottom: 8 }} />
          <div>No errors detected — your service is healthy!</div>
        </div>
      )}
    </div>
  );
}

