// ===== PDF PERFORMANCE REPORT =====
const downloadPdfReport = async () => {
  const btn = document.getElementById('pdfReportBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating...';

  try {
    if (!lastAnalytics) await loadDashboard();
    const a = lastAnalytics;
    const user = getUser();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 50;

    // ----- Header -----
    doc.setFontSize(20);
    doc.setTextColor(124, 58, 237);
    doc.text('Smart Study Planner', margin, y);
    y += 22;
    doc.setFontSize(13);
    doc.setTextColor(30, 27, 75);
    doc.text('Performance Report', margin, y);
    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(`Student: ${user?.name || 'Student'}  |  Generated: ${new Date().toLocaleString()}`, margin, y);
    y += 24;

    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 24;

    // ----- KPIs -----
    doc.setFontSize(12);
    doc.setTextColor(30, 27, 75);
    doc.text('Overview', margin, y);
    y += 18;

    const kpis = [
      [`Total Sessions`, `${a.totalSessions}`],
      [`Completion Rate`, `${a.completionRate}%`],
      [`Minutes Studied`, `${a.totalMinutes} min`],
      [`Current Streak`, `${a.gamification?.streak ?? 0} days`],
      [`Level`, `${a.gamification?.level ?? 1} (${a.gamification?.xp ?? 0} XP)`],
      [`Badges Earned`, `${a.gamification?.badges?.length ?? 0}`],
    ];
    doc.setFontSize(10);
    kpis.forEach(([label, value]) => {
      doc.setTextColor(107, 114, 128);
      doc.text(label, margin, y);
      doc.setTextColor(30, 27, 75);
      doc.text(String(value), margin + 160, y);
      y += 16;
    });
    y += 12;

    // ----- Chart snapshots -----
    const addChartImage = (canvasId, title, w, h) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      if (y + h + 30 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = 50;
      }
      doc.setFontSize(11);
      doc.setTextColor(30, 27, 75);
      doc.text(title, margin, y);
      y += 10;
      try {
        const imgData = canvas.toDataURL('image/png', 1.0);
        doc.addImage(imgData, 'PNG', margin, y, w, h);
        y += h + 20;
      } catch (e) {
        y += 10;
      }
    };

    const chartWidth = pageWidth - margin * 2;
    addChartImage('weeklyChart', 'Weekly Activity', chartWidth, 180);
    addChartImage('subjectChart', 'Subject Breakdown', chartWidth * 0.6, 180);
    addChartImage('trendChart', '30-Day Study Trend', chartWidth, 140);

    // ----- Subject table -----
    if (y + 40 > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = 50;
    }
    doc.setFontSize(12);
    doc.setTextColor(30, 27, 75);
    doc.text('Subject Breakdown', margin, y);
    y += 16;
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text('Subject', margin, y);
    doc.text('Sessions', margin + 200, y);
    doc.text('Completed', margin + 280, y);
    doc.text('Minutes', margin + 370, y);
    y += 10;
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;

    (a.subjectBreakdown || []).forEach((s) => {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = 50;
      }
      doc.setTextColor(30, 27, 75);
      doc.text(s.subject, margin, y);
      doc.text(String(s.total), margin + 200, y);
      doc.text(String(s.completed), margin + 280, y);
      doc.text(String(s.minutes), margin + 370, y);
      y += 16;
    });

    doc.save(`study-performance-report-${new Date().toISOString().split('T')[0]}.pdf`);
    toast('PDF report downloaded! 📄', 'success');
  } catch (err) {
    console.error(err);
    toast('Failed to generate PDF report', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '📄 Download PDF Report';
  }
};

// ===== CSV ANALYTICS EXPORT =====
// Sits alongside the PDF report above (doesn't replace it). Streams a raw
// per-session CSV straight from the backend (server/routes/analyticsRoutes.js
// -> GET /api/analytics/export/csv) so it works even before the dashboard
// charts have loaded.
const downloadCsvReport = async () => {
  const btn = document.getElementById('csvReportBtn');
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Exporting...';

  try {
    await downloadCsvExport();
    toast('CSV export downloaded! 📊', 'success');
  } catch (err) {
    console.error(err);
    toast('Failed to export CSV', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
};
