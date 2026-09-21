/**
 * data-loader.js
 * 클라이언트 사이드 파일 파싱 엔진
 * FileReader API + SheetJS로 Excel/CSV 파일을 브라우저 메모리에서만 처리
 * 어떠한 데이터도 외부 서버로 전송하지 않습니다.
 */
const DataLoader = (() => {
  /**
   * 내장 샘플 데이터 로드
   */
  function loadSampleData() {
    return {
      name: SAMPLE_DATA.name,
      columns: SAMPLE_DATA.columns,
      rows: SAMPLE_DATA.rows.map(r => {
        const obj = {};
        SAMPLE_DATA.columns.forEach((c, i) => { obj[c] = r[i]; });
        return obj;
      }),
      numericColumns: SAMPLE_DATA.columns.filter(c => c !== 'Date'),
      dateColumn: 'Date'
    };
  }

  /**
   * File 객체로부터 데이터 파싱 (Excel/CSV)
   * @returns {Promise<{name, columns, rows, numericColumns, dateColumn}>}
   */
  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const firstSheet = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheet];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: null });

          if (json.length === 0) {
            reject(new Error('파일에 데이터가 없습니다.'));
            return;
          }

          const columns = Object.keys(json[0]);
          const numericColumns = [];
          let dateColumn = null;

          // 타입 추론
          columns.forEach(col => {
            const sample = json.slice(0, Math.min(20, json.length)).map(r => r[col]).filter(v => v != null);
            if (sample.length === 0) return;

            // 날짜 감지
            if (!dateColumn) {
              const isDate = sample.every(v =>
                v instanceof Date ||
                (typeof v === 'string' && !isNaN(Date.parse(v)) && /\d{4}[-\/]/.test(v))
              );
              if (isDate) { dateColumn = col; return; }
            }

            // 숫자 감지
            const isNumeric = sample.every(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(v)));
            if (isNumeric) numericColumns.push(col);
          });

          // 행 데이터 정제
          const rows = json.map(row => {
            const clean = {};
            columns.forEach(col => {
              if (col === dateColumn) {
                const v = row[col];
                clean[col] = v instanceof Date ? v.toISOString().split('T')[0] : String(v || '');
              } else if (numericColumns.includes(col)) {
                clean[col] = parseFloat(row[col]) || 0;
              } else {
                clean[col] = row[col];
              }
            });
            return clean;
          });

          resolve({
            name: file.name,
            columns,
            rows,
            numericColumns,
            dateColumn
          });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('파일 읽기 실패'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 특정 컬럼의 숫자 배열 추출
   */
  function getColumnData(rows, colName) {
    return rows.map(r => r[colName]).filter(v => typeof v === 'number' && !isNaN(v));
  }

  /**
   * 컬럼별 데이터 맵 생성
   */
  function buildColumnMap(rows, numericColumns) {
    const map = {};
    numericColumns.forEach(col => {
      map[col] = getColumnData(rows, col);
    });
    return map;
  }

  return { loadSampleData, loadFile, getColumnData, buildColumnMap };
})();
