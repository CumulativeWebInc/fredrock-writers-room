/* FredRock Writers Room — charts.js
 * Hand-rolled inline SVG bar charts. No dependencies.
 *   barChart(el, rows[{label, value}]) — horizontal bars, auto-scaled.
 *   metricBar(el, label, value, max)    — single labeled progress bar.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmt(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  // Horizontal bar chart. rows: [{label, value}]. Scales to max value.
  function barChart(el, rows, opts) {
    if (!el) return;
    opts = opts || {};
    rows = (rows || []).slice().sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
    var W = opts.width || 560;
    var labelW = opts.labelWidth || 150;
    var barH = opts.barHeight || 20;
    var gap = opts.gap || 8;
    var padR = 56;
    var H = rows.length * (barH + gap) + gap;
    var max = Math.max.apply(null, [1].concat(rows.map(function (r) { return Number(r.value) || 0; })));
    var accent = opts.accent || "#d4a24e";

    var parts = [];
    parts.push('<svg class="fr-chart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(opts.aria || "bar chart") + '">');
    rows.forEach(function (r, i) {
      var y = gap + i * (barH + gap);
      var v = Number(r.value) || 0;
      var bw = Math.max(2, ((W - labelW - padR) * v) / max);
      var ty = y + barH / 2 + 4;
      parts.push('<text x="0" y="' + ty + '" class="fr-chart-label">' + esc(String(r.label).slice(0, 24)) + "</text>");
      parts.push('<rect x="' + labelW + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="' + barH + '" rx="3" fill="' + accent + '" opacity="' + (v > 0 ? "0.92" : "0.15") + '"/>');
      parts.push('<text x="' + (labelW + bw + 8) + '" y="' + ty + '" class="fr-chart-value">' + fmt(v) + "</text>");
    });
    parts.push("</svg>");
    el.innerHTML = parts.join("");
  }

  // Single labeled metric bar: value of max, shown as "label  v/max (pct%)".
  function metricBar(el, label, value, max) {
    if (!el) return;
    var v = Number(value) || 0;
    var m = Number(max) || 0;
    var pct = m > 0 ? Math.min(100, (v / m) * 100) : 0;
    el.innerHTML =
      '<div class="fr-metric">' +
        '<div class="fr-metric-head"><span>' + esc(label) + '</span><span>' + fmt(v) + " / " + fmt(m) + " (" + pct.toFixed(0) + "%)</span></div>" +
        '<div class="fr-metric-track"><div class="fr-metric-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      "</div>";
  }

  window.Charts = { barChart: barChart, metricBar: metricBar };
})();
