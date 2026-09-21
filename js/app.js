/**
 * app.js
 * 메인 대시보드 애플리케이션 로직
 * 탭 전환, 원클릭 통계 분석, 파라미터 실시간 반응, 내보내기
 */
const App = (() => {
  let state = {
    dataset: null,
    colMap: {},
    currentTab: 'overview'
  };

  // ===== 초기화 =====
  function init() {
    setupFileUpload();
    setupTabs();
    setupSampleButton();
    // 자동 샘플 로드
    loadSample();
  }

  function loadSample() {
    const data = DataLoader.loadSampleData();
    setDataset(data);
  }

  function setDataset(data) {
    state.dataset = data;
    state.colMap = DataLoader.buildColumnMap(data.rows, data.numericColumns);
    document.getElementById('data-name').textContent = data.name;
    document.getElementById('data-rows').textContent = data.rows.length + '행';
    document.getElementById('data-cols').textContent = data.columns.length + '열';
    updateAllTabs();
    showTab(state.currentTab);
  }

  // ===== 파일 업로드 =====
  function setupFileUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });
  }

  async function handleFile(file) {
    const statusEl = document.getElementById('upload-status');
    statusEl.textContent = '파일 로딩 중...';
    statusEl.className = 'upload-status loading';
    try {
      const data = await DataLoader.loadFile(file);
      setDataset(data);
      statusEl.textContent = `✓ "${data.name}" 로드 완료 (${data.rows.length}행)`;
      statusEl.className = 'upload-status success';
    } catch (err) {
      statusEl.textContent = `✗ 오류: ${err.message}`;
      statusEl.className = 'upload-status error';
    }
  }

  function setupSampleButton() {
    document.getElementById('btn-sample').addEventListener('click', loadSample);
  }

  // ===== 탭 시스템 =====
  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
  }

  function showTab(tabId) {
    state.currentTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tabId));

    // 탭 전환 시 해당 탭 리렌더
    const renderMap = {
      'overview': renderOverview,
      'timeseries': renderTimeSeries,
      'descriptive': renderDescriptive,
      'correlation': renderCorrelation,
      'hypothesis': renderHypothesis,
      'outliers': renderOutliers,
      'rawdata': renderRawData
    };
    if (renderMap[tabId]) renderMap[tabId]();
  }

  function updateAllTabs() {
    // KPI 카드 업데이트
    if (!state.dataset) return;
    const d = state.dataset;
    const closeData = state.colMap['Close'] || state.colMap[d.numericColumns[0]] || [];

    if (closeData.length > 0) {
      const latest = closeData[closeData.length - 1];
      const first = closeData[0];
      const change = ((latest - first) / first * 100);
      const vol = Stats.annualizedVolatility(Stats.dailyReturns(closeData).filter(r => r !== null));

      document.getElementById('kpi-latest').textContent = latest.toFixed(2);
      document.getElementById('kpi-change').textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
      document.getElementById('kpi-change').className = 'kpi-value ' + (change >= 0 ? 'positive' : 'negative');
      document.getElementById('kpi-volatility').textContent = (vol * 100).toFixed(2) + '%';
      document.getElementById('kpi-mean').textContent = Stats.mean(closeData).toFixed(2);
    }
  }

  // ===== 개요 탭 =====
  function renderOverview() {
    if (!state.dataset) return;
    const d = state.dataset;
    const dates = d.rows.map(r => r[d.dateColumn] || '');
    const close = state.colMap['Close'] || state.colMap[d.numericColumns[0]] || [];
    const vol = state.colMap['Volume'] || [];

    // 주가 차트
    Charts.priceChart('chart-overview-price', dates, close, { sma5: true, sma20: true });

    // 거래량 차트
    if (vol.length) {
      Charts.volumeChart('chart-overview-volume', dates, vol, close);
    }

    // 요약 테이블
    const summaryEl = document.getElementById('overview-summary');
    const cols = d.numericColumns.slice(0, 6);
    let html = '<table class="stats-table"><thead><tr><th>지표</th>';
    cols.forEach(c => html += `<th>${c}</th>`);
    html += '</tr></thead><tbody>';
    const metrics = ['count', 'mean', 'stddev', 'min', 'max'];
    const metricLabels = ['관측수', '평균', '표준편차', '최소', '최대'];
    metrics.forEach((m, idx) => {
      html += `<tr><td class="metric-name">${metricLabels[idx]}</td>`;
      cols.forEach(c => {
        const arr = state.colMap[c] || [];
        const desc = Stats.descriptive(arr);
        const val = desc[m];
        html += `<td>${typeof val === 'number' ? formatNum(val) : val}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    summaryEl.innerHTML = html;
  }

  // ===== 시계열 & 테크니컬 분석 탭 =====
  function renderTimeSeries() {
    if (!state.dataset) return;
    const d = state.dataset;
    const dates = d.rows.map(r => r[d.dateColumn] || '');
    const close = state.colMap['Close'] || state.colMap[d.numericColumns[0]] || [];

    // 컨트롤 바인딩
    const container = document.getElementById('tab-timeseries');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const renderChart = () => {
      const opts = {
        sma5: document.getElementById('chk-sma5').checked,
        sma20: document.getElementById('chk-sma20').checked,
        sma60: document.getElementById('chk-sma60').checked,
        bollinger: document.getElementById('chk-bollinger').checked
      };
      Charts.priceChart('chart-ts-price', dates, close, opts);
    };
    checkboxes.forEach(cb => cb.addEventListener('change', renderChart));
    renderChart();

    // 수익률 차트
    const returns = Stats.dailyReturns(close);
    Charts.returnsLineChart('chart-ts-returns', dates, returns);

    // 수익률 분포 히스토그램
    Charts.returnsHistogram('chart-ts-histogram', returns);

    // 테크니컬 지표 요약
    const validReturns = returns.filter(r => r !== null);
    const vol = Stats.annualizedVolatility(validReturns);
    const avgReturn = Stats.mean(validReturns);
    const maxReturn = Stats.max(validReturns);
    const minReturn = Stats.min(validReturns);
    const skew = Stats.skewness(validReturns);
    const kurt = Stats.kurtosis(validReturns);

    document.getElementById('ts-stats').innerHTML = `
      <div class="mini-stat"><span class="mini-label">연환산 변동성</span><span class="mini-value">${(vol * 100).toFixed(2)}%</span></div>
      <div class="mini-stat"><span class="mini-label">평균 일일 수익률</span><span class="mini-value">${(avgReturn * 100).toFixed(4)}%</span></div>
      <div class="mini-stat"><span class="mini-label">최대 일일 수익률</span><span class="mini-value positive">${(maxReturn * 100).toFixed(4)}%</span></div>
      <div class="mini-stat"><span class="mini-label">최소 일일 수익률</span><span class="mini-value negative">${(minReturn * 100).toFixed(4)}%</span></div>
      <div class="mini-stat"><span class="mini-label">수익률 왜도</span><span class="mini-value">${skew.toFixed(4)}</span></div>
      <div class="mini-stat"><span class="mini-label">수익률 첨도</span><span class="mini-value">${kurt.toFixed(4)}</span></div>
    `;
  }

  // ===== 기초 기술통계 탭 =====
  function renderDescriptive() {
    if (!state.dataset) return;
    const d = state.dataset;

    // 변수 선택
    const select = document.getElementById('desc-column');
    select.innerHTML = '';
    d.numericColumns.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      select.appendChild(opt);
    });

    const render = () => {
      const col = select.value;
      const arr = state.colMap[col] || [];
      const desc = Stats.descriptive(arr);

      const tableEl = document.getElementById('desc-table');
      const items = [
        ['관측 수 (n)', desc.count],
        ['평균 (Mean)', desc.mean.toFixed(6)],
        ['중위수 (Median)', desc.median.toFixed(6)],
        ['최빈수 (Mode)', desc.mode ? desc.mode.join(', ') : 'N/A'],
        ['분산 (Variance)', desc.variance.toFixed(6)],
        ['표준편차 (Std Dev)', desc.stddev.toFixed(6)],
        ['최소 (Min)', desc.min.toFixed(6)],
        ['최대 (Max)', desc.max.toFixed(6)],
        ['범위 (Range)', desc.range.toFixed(6)],
        ['제1사분위수 (Q1)', desc.q1.toFixed(6)],
        ['중위수 (Q2)', desc.q2.toFixed(6)],
        ['제3사분위수 (Q3)', desc.q3.toFixed(6)],
        ['사분위 범위 (IQR)', desc.iqr.toFixed(6)],
        ['변동계수 (CV)', desc.cv.toFixed(4) + '%'],
        ['왜도 (Skewness)', desc.skewness.toFixed(6)],
        ['첨도 (Kurtosis)', desc.kurtosis.toFixed(6)]
      ];

      let html = '<table class="stats-table"><thead><tr><th>통계량</th><th>값</th></tr></thead><tbody>';
      items.forEach(([label, val]) => {
        html += `<tr><td class="metric-name">${label}</td><td>${val}</td></tr>`;
      });
      html += '</tbody></table>';
      tableEl.innerHTML = html;

      // 박스플롯 스타일 시각화 (바 차트로 표현)
      const dates = d.rows.map(r => r[d.dateColumn] || '');
      Charts.lineChart('chart-desc', dates, [{
        label: col,
        data: arr,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderWidth: 2,
        pointRadius: 2,
        fill: true
      }]);

      // 히스토그램
      Charts.returnsHistogram('chart-desc-hist', arr);
    };

    select.addEventListener('change', render);
    render();

    // 전체 변수 요약 테이블
    renderDescriptiveAll();
  }

  function renderDescriptiveAll() {
    const d = state.dataset;
    const el = document.getElementById('desc-all-table');
    const cols = d.numericColumns;
    let html = '<table class="stats-table compact"><thead><tr><th>변수</th><th>평균</th><th>중위수</th><th>표준편차</th><th>왜도</th><th>첨도</th><th>Min</th><th>Max</th><th>IQR</th></tr></thead><tbody>';
    cols.forEach(c => {
      const desc = Stats.descriptive(state.colMap[c] || []);
      html += `<tr>
        <td class="metric-name">${c}</td>
        <td>${formatNum(desc.mean)}</td>
        <td>${formatNum(desc.median)}</td>
        <td>${formatNum(desc.stddev)}</td>
        <td>${desc.skewness.toFixed(4)}</td>
        <td>${desc.kurtosis.toFixed(4)}</td>
        <td>${formatNum(desc.min)}</td>
        <td>${formatNum(desc.max)}</td>
        <td>${formatNum(desc.iqr)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  // ===== 상관관계 & 회귀분석 탭 =====
  function renderCorrelation() {
    if (!state.dataset) return;
    const d = state.dataset;
    const cols = d.numericColumns;

    // 상관계수 매트릭스
    const matrix = Stats.correlationMatrix(state.colMap, cols);
    const matrixEl = document.getElementById('corr-matrix');
    let html = '<table class="stats-table corr-table"><thead><tr><th></th>';
    cols.forEach(c => html += `<th>${c}</th>`);
    html += '</tr></thead><tbody>';
    matrix.forEach((row, i) => {
      html += `<tr><td class="metric-name">${cols[i]}</td>`;
      row.forEach((val, j) => {
        const abs = Math.abs(val);
        let bg;
        if (i === j) bg = 'rgba(59,130,246,0.3)';
        else if (abs > 0.7) bg = val > 0 ? `rgba(16,185,129,${abs * 0.5})` : `rgba(239,68,68,${abs * 0.5})`;
        else if (abs > 0.3) bg = val > 0 ? `rgba(16,185,129,${abs * 0.3})` : `rgba(239,68,68,${abs * 0.3})`;
        else bg = 'transparent';
        html += `<td style="background:${bg};text-align:center">${val.toFixed(3)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    matrixEl.innerHTML = html;

    // 회귀분석 변수 선택
    const selX = document.getElementById('reg-x');
    const selY = document.getElementById('reg-y');
    selX.innerHTML = ''; selY.innerHTML = '';
    cols.forEach((c, i) => {
      selX.innerHTML += `<option value="${c}" ${i === 0 ? 'selected' : ''}>${c}</option>`;
      selY.innerHTML += `<option value="${c}" ${i === Math.min(3, cols.length - 1) ? 'selected' : ''}>${c}</option>`;
    });

    const renderReg = () => {
      const xCol = selX.value, yCol = selY.value;
      const xData = state.colMap[xCol] || [];
      const yData = state.colMap[yCol] || [];
      const len = Math.min(xData.length, yData.length);
      const reg = Charts.scatterWithRegression('chart-regression', xData.slice(0, len), yData.slice(0, len), xCol, yCol);

      if (reg) {
        document.getElementById('reg-results').innerHTML = `
          <div class="mini-stat"><span class="mini-label">기울기 (β₁)</span><span class="mini-value">${reg.slope.toFixed(6)}</span></div>
          <div class="mini-stat"><span class="mini-label">절편 (β₀)</span><span class="mini-value">${reg.intercept.toFixed(6)}</span></div>
          <div class="mini-stat"><span class="mini-label">R²</span><span class="mini-value">${reg.r2.toFixed(6)}</span></div>
          <div class="mini-stat"><span class="mini-label">표준오차 (SE)</span><span class="mini-value">${reg.se.toFixed(6)}</span></div>
          <div class="mini-stat"><span class="mini-label">t-통계량</span><span class="mini-value">${reg.tStat.toFixed(4)}</span></div>
          <div class="mini-stat"><span class="mini-label">p-value</span><span class="mini-value">${reg.pValue < 0.0001 ? '< 0.0001' : reg.pValue.toFixed(6)}</span></div>
          <div class="mini-stat full-width"><span class="mini-label">회귀식</span><span class="mini-value">${yCol} = ${reg.slope.toFixed(4)} × ${xCol} + ${reg.intercept.toFixed(4)}</span></div>
        `;
      }
    };

    selX.addEventListener('change', renderReg);
    selY.addEventListener('change', renderReg);
    renderReg();
  }

  // ===== 가설검정 탭 =====
  function renderHypothesis() {
    if (!state.dataset) return;
    const d = state.dataset;
    const cols = d.numericColumns;

    // 1-Sample t-test
    const selCol = document.getElementById('ttest-col');
    selCol.innerHTML = '';
    cols.forEach(c => {
      selCol.innerHTML += `<option value="${c}">${c}</option>`;
    });

    const renderOneT = () => {
      const col = selCol.value;
      const mu0 = parseFloat(document.getElementById('ttest-mu').value) || 0;
      const arr = state.colMap[col] || [];
      const result = Stats.oneSampleTTest(arr, mu0);

      document.getElementById('ttest1-results').innerHTML = `
        <table class="stats-table"><thead><tr><th>지표</th><th>값</th></tr></thead><tbody>
        <tr><td class="metric-name">검정 변수</td><td>${col}</td></tr>
        <tr><td class="metric-name">관측 수 (n)</td><td>${arr.length}</td></tr>
        <tr><td class="metric-name">표본 평균</td><td>${result.mean.toFixed(6)}</td></tr>
        <tr><td class="metric-name">기준값 (μ₀)</td><td>${mu0}</td></tr>
        <tr><td class="metric-name">표준오차 (SE)</td><td>${result.se.toFixed(6)}</td></tr>
        <tr><td class="metric-name">t-통계량</td><td>${result.t.toFixed(6)}</td></tr>
        <tr><td class="metric-name">자유도 (df)</td><td>${result.df}</td></tr>
        <tr><td class="metric-name">p-value (양측)</td><td class="${result.p < 0.05 ? 'significant' : ''}">${result.p < 0.0001 ? '< 0.0001' : result.p.toFixed(6)}</td></tr>
        <tr><td class="metric-name">유의성 (α=0.05)</td><td class="${result.p < 0.05 ? 'significant' : ''}">${result.p < 0.05 ? '✓ 유의함 (H₀ 기각)' : '✗ 유의하지 않음'}</td></tr>
        </tbody></table>
      `;
    };

    selCol.addEventListener('change', renderOneT);
    document.getElementById('ttest-mu').addEventListener('input', renderOneT);
    renderOneT();

    // 2-Sample t-test (전반기 vs 후반기)
    const renderTwoT = () => {
      const col = document.getElementById('ttest2-col').value || cols[0];
      const arr = state.colMap[col] || [];
      const mid = Math.floor(arr.length / 2);
      const group1 = arr.slice(0, mid);
      const group2 = arr.slice(mid);
      const result = Stats.twoSampleTTest(group1, group2);

      document.getElementById('ttest2-results').innerHTML = `
        <table class="stats-table"><thead><tr><th>지표</th><th>값</th></tr></thead><tbody>
        <tr><td class="metric-name">검정 변수</td><td>${col}</td></tr>
        <tr><td class="metric-name">그룹1 (전반부) 크기</td><td>${group1.length}</td></tr>
        <tr><td class="metric-name">그룹2 (후반부) 크기</td><td>${group2.length}</td></tr>
        <tr><td class="metric-name">그룹1 평균</td><td>${result.mean1.toFixed(6)}</td></tr>
        <tr><td class="metric-name">그룹2 평균</td><td>${result.mean2.toFixed(6)}</td></tr>
        <tr><td class="metric-name">평균 차이</td><td>${(result.mean1 - result.mean2).toFixed(6)}</td></tr>
        <tr><td class="metric-name">t-통계량</td><td>${result.t.toFixed(6)}</td></tr>
        <tr><td class="metric-name">자유도 (df)</td><td>${result.df.toFixed(2)}</td></tr>
        <tr><td class="metric-name">p-value (양측)</td><td class="${result.p < 0.05 ? 'significant' : ''}">${result.p < 0.0001 ? '< 0.0001' : result.p.toFixed(6)}</td></tr>
        <tr><td class="metric-name">유의성 (α=0.05)</td><td class="${result.p < 0.05 ? 'significant' : ''}">${result.p < 0.05 ? '✓ 유의함 (H₀ 기각)' : '✗ 유의하지 않음'}</td></tr>
        </tbody></table>
      `;
    };

    const selCol2 = document.getElementById('ttest2-col');
    selCol2.innerHTML = '';
    cols.forEach(c => selCol2.innerHTML += `<option value="${c}">${c}</option>`);
    selCol2.addEventListener('change', renderTwoT);
    renderTwoT();
  }

  // ===== 이상치 탐지 탭 =====
  function renderOutliers() {
    if (!state.dataset) return;
    const d = state.dataset;
    const cols = d.numericColumns;

    const selCol = document.getElementById('outlier-col');
    selCol.innerHTML = '';
    cols.forEach(c => selCol.innerHTML += `<option value="${c}">${c}</option>`);

    const render = () => {
      const col = selCol.value;
      const method = document.getElementById('outlier-method').value;
      const threshold = parseFloat(document.getElementById('outlier-threshold').value) || (method === 'iqr' ? 1.5 : 3);
      const arr = state.colMap[col] || [];

      let outliers;
      if (method === 'iqr') {
        outliers = Stats.outliersByIQR(arr, threshold);
      } else {
        outliers = Stats.outliersByZScore(arr, threshold);
      }

      // 결과 테이블
      let html = `<p class="outlier-count">총 <strong>${outliers.length}</strong>개의 이상치 탐지 (${arr.length}개 중)</p>`;
      if (outliers.length > 0) {
        html += '<table class="stats-table"><thead><tr><th>행 번호</th><th>값</th>';
        if (method === 'iqr') html += '<th>하한</th><th>상한</th>';
        else html += '<th>Z-Score</th>';
        html += '<th>날짜</th></tr></thead><tbody>';
        outliers.forEach(o => {
          const dateVal = d.rows[o.index] ? (d.rows[o.index][d.dateColumn] || '') : '';
          html += `<tr><td>${o.index + 1}</td><td>${formatNum(o.value)}</td>`;
          if (method === 'iqr') html += `<td>${formatNum(o.lower)}</td><td>${formatNum(o.upper)}</td>`;
          else html += `<td>${o.z.toFixed(4)}</td>`;
          html += `<td>${dateVal}</td></tr>`;
        });
        html += '</tbody></table>';
      }
      document.getElementById('outlier-results').innerHTML = html;

      // 이상치 시각화 차트
      const dates = d.rows.map(r => r[d.dateColumn] || '');
      const outlierIndices = new Set(outliers.map(o => o.index));
      const normalData = arr.map((v, i) => outlierIndices.has(i) ? null : v);
      const outlierData = arr.map((v, i) => outlierIndices.has(i) ? v : null);

      Charts.destroy('chart-outliers');
      const ctx = document.getElementById('chart-outliers').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [
            {
              label: '정상값',
              data: normalData,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,0.1)',
              borderWidth: 2,
              pointRadius: 2,
              fill: false,
              spanGaps: true
            },
            {
              label: '이상치',
              data: outlierData,
              borderColor: 'transparent',
              backgroundColor: '#ef4444',
              pointRadius: 6,
              pointStyle: 'crossRot',
              showLine: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { usePointStyle: true } } },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 12, font: { size: 10 } } },
            y: { grid: { color: 'rgba(0,0,0,0.06)' } }
          }
        }
      });
    };

    selCol.addEventListener('change', render);
    document.getElementById('outlier-method').addEventListener('change', render);
    document.getElementById('outlier-threshold').addEventListener('input', render);
    render();
  }

  // ===== 원시 데이터 뷰어 탭 =====
  function renderRawData() {
    if (!state.dataset) return;
    const d = state.dataset;
    const pageSize = 20;
    let currentPage = 0;
    let filteredRows = d.rows;
    let sortCol = null;
    let sortAsc = true;

    const render = () => {
      const total = filteredRows.length;
      const totalPages = Math.ceil(total / pageSize);
      const start = currentPage * pageSize;
      const pageRows = filteredRows.slice(start, start + pageSize);

      let html = '<table class="stats-table raw-table"><thead><tr>';
      d.columns.forEach(c => {
        const arrow = sortCol === c ? (sortAsc ? ' ▲' : ' ▼') : '';
        html += `<th class="sortable" data-col="${c}">${c}${arrow}</th>`;
      });
      html += '</tr></thead><tbody>';
      pageRows.forEach((row, i) => {
        html += '<tr>';
        d.columns.forEach(c => {
          html += `<td>${typeof row[c] === 'number' ? formatNum(row[c]) : (row[c] || '')}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      html += `<div class="pagination">
        <button class="btn-page" id="btn-prev" ${currentPage === 0 ? 'disabled' : ''}>◀ 이전</button>
        <span>${currentPage + 1} / ${totalPages || 1} 페이지 (총 ${total}행)</span>
        <button class="btn-page" id="btn-next" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>다음 ▶</button>
      </div>`;

      document.getElementById('raw-data-table').innerHTML = html;

      // 정렬 이벤트
      document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.col;
          if (sortCol === col) sortAsc = !sortAsc;
          else { sortCol = col; sortAsc = true; }
          filteredRows = [...filteredRows].sort((a, b) => {
            const va = a[col], vb = b[col];
            if (typeof va === 'number') return sortAsc ? va - vb : vb - va;
            return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
          });
          currentPage = 0;
          render();
        });
      });

      // 페이지네이션 이벤트
      const prevBtn = document.getElementById('btn-prev');
      const nextBtn = document.getElementById('btn-next');
      if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; render(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; render(); });
    };

    // 검색
    const searchInput = document.getElementById('raw-search');
    searchInput.value = '';
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      filteredRows = q ? d.rows.filter(row =>
        d.columns.some(c => String(row[c]).toLowerCase().includes(q))
      ) : d.rows;
      currentPage = 0;
      render();
    });

    render();
  }

  // ===== 유틸 =====
  function formatNum(val) {
    if (typeof val !== 'number') return val;
    if (Math.abs(val) >= 1e6) return val.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
    if (Math.abs(val) < 0.01 && val !== 0) return val.toExponential(4);
    return val.toLocaleString('ko-KR', { maximumFractionDigits: 5 });
  }

  // ===== 결과 내보내기 =====
  function exportCSV() {
    if (!state.dataset) return;
    const d = state.dataset;
    let csv = d.columns.join(',') + '\n';
    d.rows.forEach(row => {
      csv += d.columns.map(c => row[c]).join(',') + '\n';
    });
    downloadFile(csv, 'data_export.csv', 'text/csv');
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 전역 이벤트
  document.addEventListener('DOMContentLoaded', () => {
    init();
    document.getElementById('btn-export').addEventListener('click', exportCSV);
  });

  return { init, loadSample, setDataset, exportCSV };
})();
