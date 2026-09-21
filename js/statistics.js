/**
 * statistics.js
 * 순수 Vanilla JavaScript 통계 엔진
 * 모든 연산은 클라이언트 메모리에서만 수행됩니다.
 */
const Stats = (() => {
  // ===== 기초 유틸리티 =====
  function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
  function mean(arr) { return arr.length ? sum(arr) / arr.length : 0; }

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function mode(arr) {
    const freq = {};
    arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    let maxFreq = 0;
    Object.values(freq).forEach(f => { if (f > maxFreq) maxFreq = f; });
    const modes = Object.keys(freq).filter(k => freq[k] === maxFreq).map(Number);
    return modes.length === arr.length ? null : modes;
  }

  function variance(arr, sample = true) {
    const m = mean(arr);
    const ss = arr.reduce((acc, v) => acc + (v - m) ** 2, 0);
    return ss / (arr.length - (sample ? 1 : 0));
  }

  function stddev(arr, sample = true) { return Math.sqrt(variance(arr, sample)); }

  function min(arr) { return Math.min(...arr); }
  function max(arr) { return Math.max(...arr); }
  function range(arr) { return max(arr) - min(arr); }

  function quartiles(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const q = (p) => {
      const pos = (s.length - 1) * p;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return s[lo] + (s[hi] - s[lo]) * (pos - lo);
    };
    return { q1: q(0.25), q2: q(0.5), q3: q(0.75) };
  }

  function iqr(arr) { const q = quartiles(arr); return q.q3 - q.q1; }

  function cv(arr) { const m = mean(arr); return m !== 0 ? (stddev(arr) / m) * 100 : 0; }

  function skewness(arr) {
    const n = arr.length;
    if (n < 3) return 0;
    const m = mean(arr);
    const s = stddev(arr);
    if (s === 0) return 0;
    const m3 = arr.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0);
    return (n / ((n - 1) * (n - 2))) * m3;
  }

  function kurtosis(arr) {
    const n = arr.length;
    if (n < 4) return 0;
    const m = mean(arr);
    const s = stddev(arr);
    if (s === 0) return 0;
    const m4 = arr.reduce((acc, v) => acc + ((v - m) / s) ** 4, 0);
    const k = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * m4;
    const correction = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
    return k - correction; // excess kurtosis
  }

  // ===== 기술통계 요약 =====
  function descriptive(arr) {
    const q = quartiles(arr);
    return {
      count: arr.length,
      mean: mean(arr),
      median: median(arr),
      mode: mode(arr),
      variance: variance(arr),
      stddev: stddev(arr),
      min: min(arr),
      max: max(arr),
      range: range(arr),
      q1: q.q1,
      q2: q.q2,
      q3: q.q3,
      iqr: iqr(arr),
      cv: cv(arr),
      skewness: skewness(arr),
      kurtosis: kurtosis(arr)
    };
  }

  // ===== 상관관계 =====
  function pearson(x, y) {
    const n = x.length;
    if (n !== y.length || n < 2) return 0;
    const mx = mean(x), my = mean(y);
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx, dy = y[i] - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const den = Math.sqrt(dx2 * dy2);
    return den === 0 ? 0 : num / den;
  }

  function correlationMatrix(data, cols) {
    const matrix = [];
    for (let i = 0; i < cols.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < cols.length; j++) {
        matrix[i][j] = pearson(data[cols[i]], data[cols[j]]);
      }
    }
    return matrix;
  }

  // ===== 선형회귀 (OLS) =====
  function linearRegression(x, y) {
    const n = x.length;
    const mx = mean(x), my = mean(y);
    let ssxy = 0, ssxx = 0, ssyy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx, dy = y[i] - my;
      ssxy += dx * dy;
      ssxx += dx * dx;
      ssyy += dy * dy;
    }
    const slope = ssxx === 0 ? 0 : ssxy / ssxx;
    const intercept = my - slope * mx;
    const r2 = (ssxx * ssyy) === 0 ? 0 : (ssxy * ssxy) / (ssxx * ssyy);

    // Standard Error
    const residuals = x.map((xi, i) => y[i] - (slope * xi + intercept));
    const sse = residuals.reduce((a, r) => a + r * r, 0);
    const se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
    const slopeErr = ssxx > 0 && n > 2 ? se / Math.sqrt(ssxx) : 0;

    // t-stat and p-value for slope
    const tStat = slopeErr !== 0 ? slope / slopeErr : 0;
    const df = n - 2;
    const pValue = df > 0 ? tDistPValue(Math.abs(tStat), df) * 2 : 1;

    return { slope, intercept, r2, se, slopeErr, tStat, pValue, residuals };
  }

  // ===== 이동평균 =====
  function sma(arr, window) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      if (i < window - 1) { result.push(null); continue; }
      let s = 0;
      for (let j = i - window + 1; j <= i; j++) s += arr[j];
      result.push(s / window);
    }
    return result;
  }

  // ===== 볼린저 밴드 =====
  function bollingerBands(arr, window = 20, mult = 2) {
    const mid = sma(arr, window);
    const upper = [], lower = [];
    for (let i = 0; i < arr.length; i++) {
      if (mid[i] === null) { upper.push(null); lower.push(null); continue; }
      const slice = arr.slice(i - window + 1, i + 1);
      const sd = stddev(slice, false);
      upper.push(mid[i] + mult * sd);
      lower.push(mid[i] - mult * sd);
    }
    return { mid, upper, lower };
  }

  // ===== 일일 수익률 =====
  function dailyReturns(arr) {
    const returns = [null];
    for (let i = 1; i < arr.length; i++) {
      returns.push(arr[i - 1] !== 0 ? (arr[i] - arr[i - 1]) / arr[i - 1] : 0);
    }
    return returns;
  }

  function logReturns(arr) {
    const returns = [null];
    for (let i = 1; i < arr.length; i++) {
      returns.push(arr[i - 1] > 0 && arr[i] > 0 ? Math.log(arr[i] / arr[i - 1]) : 0);
    }
    return returns;
  }

  // ===== 변동성 =====
  function annualizedVolatility(returns, tradingDays = 252) {
    const valid = returns.filter(r => r !== null);
    return stddev(valid) * Math.sqrt(tradingDays);
  }

  // ===== 히스토그램 빈 =====
  function histogram(arr, binCount = 20) {
    const mn = min(arr), mx = max(arr);
    const binWidth = (mx - mn) / binCount || 1;
    const bins = [];
    for (let i = 0; i < binCount; i++) {
      bins.push({ from: mn + i * binWidth, to: mn + (i + 1) * binWidth, count: 0 });
    }
    arr.forEach(v => {
      let idx = Math.floor((v - mn) / binWidth);
      if (idx >= binCount) idx = binCount - 1;
      if (idx < 0) idx = 0;
      bins[idx].count++;
    });
    return bins;
  }

  // ===== t-검정 =====
  // t-분포 p-value 근사 (Abramowitz & Stegun)
  function tDistPValue(t, df) {
    const x = df / (df + t * t);
    return 0.5 * incompleteBeta(df / 2, 0.5, x);
  }

  // 불완전 베타 함수 근사
  function incompleteBeta(a, b, x) {
    if (x === 0 || x === 1) return x;
    const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
    // 연분수 전개 (Lentz's method)
    let f = 1, c = 1, d = 0;
    for (let i = 0; i <= 200; i++) {
      let m = Math.floor(i / 2);
      let num;
      if (i === 0) {
        num = 1;
      } else if (i % 2 === 0) {
        num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
      } else {
        num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
      }
      d = 1 + num * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      d = 1 / d;
      c = 1 + num / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      f *= c * d;
      if (Math.abs(c * d - 1) < 1e-10) break;
    }
    return front * (f - 1) / a;
  }

  function lnGamma(z) {
    // Lanczos approx
    const g = 7;
    const c = [
      0.99999999999980993,676.5203681218851,-1259.1392167224028,
      771.32342877765313,-176.61502916214059,12.507343278686905,
      -0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7
    ];
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    }
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  // 1-Sample t-test
  function oneSampleTTest(arr, mu0) {
    const n = arr.length;
    if (n < 2) return { t: 0, df: 0, p: 1 };
    const m = mean(arr);
    const s = stddev(arr);
    const se = s / Math.sqrt(n);
    const t = se !== 0 ? (m - mu0) / se : 0;
    const df = n - 1;
    const p = df > 0 ? tDistPValue(Math.abs(t), df) * 2 : 1;
    return { t, df, p, mean: m, se };
  }

  // 2-Sample Independent t-test
  function twoSampleTTest(arr1, arr2) {
    const n1 = arr1.length, n2 = arr2.length;
    if (n1 < 2 || n2 < 2) return { t: 0, df: 0, p: 1 };
    const m1 = mean(arr1), m2 = mean(arr2);
    const v1 = variance(arr1), v2 = variance(arr2);
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    const t = se !== 0 ? (m1 - m2) / se : 0;
    // Welch–Satterthwaite df
    const num = (v1 / n1 + v2 / n2) ** 2;
    const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
    const df = den !== 0 ? num / den : 0;
    const p = df > 0 ? tDistPValue(Math.abs(t), df) * 2 : 1;
    return { t, df, p, mean1: m1, mean2: m2, se };
  }

  // ===== 이상치 탐지 =====
  function outliersByIQR(arr, factor = 1.5) {
    const q = quartiles(arr);
    const iqrVal = q.q3 - q.q1;
    const lower = q.q1 - factor * iqrVal;
    const upper = q.q3 + factor * iqrVal;
    return arr.map((v, i) => (v < lower || v > upper) ? { index: i, value: v, lower, upper } : null).filter(Boolean);
  }

  function outliersByZScore(arr, threshold = 3) {
    const m = mean(arr);
    const s = stddev(arr);
    if (s === 0) return [];
    return arr.map((v, i) => {
      const z = (v - m) / s;
      return Math.abs(z) > threshold ? { index: i, value: v, z } : null;
    }).filter(Boolean);
  }

  return {
    sum, mean, median, mode, variance, stddev, min, max, range,
    quartiles, iqr, cv, skewness, kurtosis, descriptive,
    pearson, correlationMatrix, linearRegression,
    sma, bollingerBands, dailyReturns, logReturns, annualizedVolatility,
    histogram, oneSampleTTest, twoSampleTTest,
    outliersByIQR, outliersByZScore, tDistPValue
  };
})();
