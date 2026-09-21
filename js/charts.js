/**
 * charts.js
 * Chart.js 기반 인터랙티브 차트 렌더러
 * 모든 차트는 클라이언트 메모리에서만 렌더링됩니다.
 */
const Charts = (() => {
  const instances = {};

  function destroy(id) {
    if (instances[id]) {
      instances[id].destroy();
      delete instances[id];
    }
  }

  function getCtx(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    return el.getContext('2d');
  }

  // ===== 시계열 주가 차트 (SMA + Bollinger) =====
  function priceChart(canvasId, dates, close, options = {}) {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const datasets = [
      {
        label: 'Close',
        data: close,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth: 2,
        pointRadius: 1,
        fill: false,
        order: 1
      }
    ];

    if (options.sma5) {
      datasets.push({
        label: 'SMA 5',
        data: Stats.sma(close, 5),
        borderColor: '#f59e0b',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        order: 2
      });
    }
    if (options.sma20) {
      datasets.push({
        label: 'SMA 20',
        data: Stats.sma(close, 20),
        borderColor: '#10b981',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        order: 3
      });
    }
    if (options.sma60) {
      datasets.push({
        label: 'SMA 60',
        data: Stats.sma(close, 60),
        borderColor: '#ef4444',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        order: 4
      });
    }
    if (options.bollinger) {
      const bb = Stats.bollingerBands(close, 20, 2);
      datasets.push({
        label: 'BB Upper',
        data: bb.upper,
        borderColor: 'rgba(168,85,247,0.5)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        order: 5
      });
      datasets.push({
        label: 'BB Lower',
        data: bb.lower,
        borderColor: 'rgba(168,85,247,0.5)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: '-1',
        backgroundColor: 'rgba(168,85,247,0.06)',
        order: 6
      });
    }

    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: dates, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { display: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { display: true, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  // ===== 거래량 바 차트 =====
  function volumeChart(canvasId, dates, volume, close) {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const colors = volume.map((_, i) => {
      if (i === 0) return 'rgba(107,114,128,0.6)';
      return close[i] >= close[i - 1] ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)';
    });

    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [{
          label: 'Volume',
          data: volume,
          backgroundColor: colors,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => 'Volume: ' + ctx.raw.toLocaleString()
            }
          }
        },
        scales: {
          x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { display: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { callback: v => (v / 1e6).toFixed(0) + 'M' } }
        }
      }
    });
  }

  // ===== 수익률 분포 히스토그램 =====
  function returnsHistogram(canvasId, returns) {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const valid = returns.filter(r => r !== null);
    const bins = Stats.histogram(valid, 25);
    const labels = bins.map(b => ((b.from + b.to) / 2 * 100).toFixed(2) + '%');

    // 정규분포 곡선 근사
    const m = Stats.mean(valid);
    const s = Stats.stddev(valid);
    const totalCount = valid.length;
    const binWidth = bins.length > 0 ? (bins[0].to - bins[0].from) : 1;
    const normalCurve = bins.map(b => {
      const x = (b.from + b.to) / 2;
      const pdf = (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - m) / s) ** 2);
      return pdf * totalCount * binWidth;
    });

    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Frequency',
            data: bins.map(b => b.count),
            backgroundColor: 'rgba(59,130,246,0.5)',
            borderColor: 'rgba(59,130,246,0.8)',
            borderWidth: 1,
            order: 2
          },
          {
            label: 'Normal Curve',
            data: normalCurve,
            type: 'line',
            borderColor: '#ef4444',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } }
        },
        scales: {
          x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
          y: { display: true, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  // ===== 산점도 + 회귀선 =====
  function scatterWithRegression(canvasId, xData, yData, xLabel, yLabel) {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const reg = Stats.linearRegression(xData, yData);
    const xMin = Stats.min(xData);
    const xMax = Stats.max(xData);

    const scatterData = xData.map((x, i) => ({ x, y: yData[i] }));

    instances[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: `${yLabel} vs ${xLabel}`,
            data: scatterData,
            backgroundColor: 'rgba(59,130,246,0.5)',
            pointRadius: 4,
            order: 2
          },
          {
            label: `Regression (R²=${reg.r2.toFixed(4)})`,
            data: [
              { x: xMin, y: reg.slope * xMin + reg.intercept },
              { x: xMax, y: reg.slope * xMax + reg.intercept }
            ],
            type: 'line',
            borderColor: '#ef4444',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } }
        },
        scales: {
          x: { title: { display: true, text: xLabel }, grid: { color: 'rgba(0,0,0,0.06)' } },
          y: { title: { display: true, text: yLabel }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
    return reg;
  }

  // ===== 범용 라인 차트 =====
  function lineChart(canvasId, labels, datasets) {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } }
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  // ===== 일일 수익률 라인 차트 =====
  function returnsLineChart(canvasId, dates, returns) {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const colors = returns.map(r => r === null ? 'transparent' : (r >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'));

    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [{
          label: 'Daily Return',
          data: returns.map(r => r === null ? 0 : r * 100),
          backgroundColor: colors,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ctx.raw.toFixed(4) + '%' }
          }
        },
        scales: {
          x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
          y: { display: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { callback: v => v.toFixed(2) + '%' } }
        }
      }
    });
  }

  return {
    destroy, priceChart, volumeChart, returnsHistogram,
    scatterWithRegression, lineChart, returnsLineChart
  };
})();
