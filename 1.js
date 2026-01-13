const express = require('express');
const axios = require('axios');

// =========== CẤU HÌNH HỆ THỐNG ===========
const CONFIG = {
  PORT: process.env.PORT || 3000,
  UPDATE_INTERVAL: 5000,
  MAX_HISTORY: 100,
  PATTERN_LENGTH: 14,
  API_URL: 'https://wtx.macminim6.online/v1/tx/sessions'
};

// =========== CƠ SỞ DỮ LIỆU CẦU THỰC ===========
const CAU_DATABASE = {
  'TTXTTXXTTXXTTX': 'X',
  'TXXTTXXTTXXTTX': 'T',
  'XXTTXXTTXXTTXX': 'X',
  'XTTXXTTXXTTXXT': 'T',
  'TTXXTTXXTTXXTT': 'X',
  'TXTXXTTXXTTXXT': 'T',
  'XTXXTTXXTTXXTX': 'X',
  'TXTTXXTTXXTTXT': 'T',
  'XXTTXXTTXXTTXT': 'X',
  'TTXTTXXTTXXTXT': 'T'
};

// =========== BIẾN TOÀN CỤC ===========
let history = [];
let lastPrediction = null;
let lastPattern = null;
let consecutiveLosses = 0;
let totalPredictions = 0;
let correctPredictions = 0;
let lastSessionId = 0;
let sessionHistory = new Map();
let lastRealData = null;
let predictionHistory = new Map();
let isAutoUpdating = true;

const app = express();

// =========== MIDDLEWARE ===========
app.use(express.static('public'));

// =========== HÀM BIÊN DỊCH DUY NHẤT ===========
async function getLatestResult() {
  try {
    const response = await axios.get(CONFIG.API_URL, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    const data = response.data;
    
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }
    
    // Tìm phiên có ID lớn nhất (phiên mới nhất)
    let latestSession = data[0];
    for (const session of data) {
      if (session.id > latestSession.id) {
        latestSession = session;
      }
    }
    
    // BIÊN DỊCH DUY NHẤT:
    // Input: { "id": 6734241, "resultTruyenThong": "TAI", "dices": [3, 6, 3], "point": 12 }
    // Output: { SessionId: 6734241, FirstDice: 3, SecondDice: 6, ThirdDice: 3, DiceSum: 12, KetQua: "Tài" }
    
    const ketQua = latestSession.resultTruyenThong === "TAI" ? "Tài" : "Xỉu";
    
    const result = {
      SessionId: parseInt(latestSession.id),
      FirstDice: parseInt(latestSession.dices[0]),
      SecondDice: parseInt(latestSession.dices[1]),
      ThirdDice: parseInt(latestSession.dices[2]),
      DiceSum: parseInt(latestSession.point),
      KetQua: ketQua,
      CreatedDate: new Date().toISOString()
    };
    
    // Kiểm tra dữ liệu hợp lệ
    if (isNaN(result.SessionId) || isNaN(result.FirstDice) || 
        isNaN(result.SecondDice) || isNaN(result.ThirdDice) || isNaN(result.DiceSum)) {
      return null;
    }
    
    lastRealData = result;
    return result;
    
  } catch (error) {
    return null;
  }
}

function convertToPattern(result) {
  return result === "Tài" ? 'T' : 'X';
}

function predictNextResult() {
  if (history.length < CONFIG.PATTERN_LENGTH) {
    if (history.length > 0) {
      const lastResult = history[history.length - 1];
      return {
        prediction: lastResult === 'T' ? "Tài" : "Xỉu",
        reason: `Chưa đủ dữ liệu (${history.length}/${CONFIG.PATTERN_LENGTH}). Dự đoán theo kết quả trước đó.`,
        pattern: null,
        confidence: 0.6
      };
    }
    
    return {
      prediction: Math.random() < 0.5 ? "Tài" : "Xỉu",
      reason: `Chưa đủ dữ liệu (${history.length}/${CONFIG.PATTERN_LENGTH}). Dự đoán ngẫu nhiên.`,
      pattern: null,
      confidence: 0.5
    };
  }

  const recentPattern = history.slice(-CONFIG.PATTERN_LENGTH).join('');
  
  if (CAU_DATABASE[recentPattern]) {
    const predictedResult = CAU_DATABASE[recentPattern] === 'T' ? "Tài" : "Xỉu";
    return {
      prediction: predictedResult,
      reason: `Tìm thấy pattern trong database: ${recentPattern} → ${predictedResult}`,
      pattern: recentPattern,
      confidence: 0.85
    };
  } else {
    const last10 = history.slice(-10);
    const last10Tai = last10.filter(h => h === 'T').length;
    const last10Xiu = last10.filter(h => h === 'X').length;
    
    const last5 = history.slice(-5);
    const last5Tai = last5.filter(h => h === 'T').length;
    const last5Xiu = last5.filter(h => h === 'X').length;
    
    let prediction;
    let reason;
    
    if (last5Tai >= 4) {
      prediction = "Tài";
      reason = `Mạnh Tài: ${last5Tai} Tài trong 5 lần gần nhất`;
    } else if (last5Xiu >= 4) {
      prediction = "Xỉu";
      reason = `Mạnh Xỉu: ${last5Xiu} Xỉu trong 5 lần gần nhất`;
    } else if (last10Tai >= 7) {
      prediction = "Tài";
      reason = `Xu hướng Tài: ${last10Tai} Tài trong 10 lần gần nhất`;
    } else if (last10Xiu >= 7) {
      prediction = "Xỉu";
      reason = `Xu hướng Xỉu: ${last10Xiu} Xỉu trong 10 lần gần nhất`;
    } else {
      const totalTai = history.filter(h => h === 'T').length;
      const totalXiu = history.filter(h => h === 'X').length;
      const overallTaiRate = totalTai / history.length;
      prediction = overallTaiRate > 0.5 ? "Tài" : "Xỉu";
      reason = `Cân bằng. Dự đoán theo tỷ lệ tổng (${(overallTaiRate*100).toFixed(1)}% Tài)`;
    }
    
    return {
      prediction: prediction,
      reason: reason,
      pattern: recentPattern,
      confidence: 0.7
    };
  }
}

function evaluatePrediction(actualResult, predictedResult) {
  if (!predictedResult) return "Chưa có dự đoán";
  return actualResult === predictedResult ? "Đúng" : "Thua";
}

// =========== HÀM TỰ ĐỘNG CẬP NHẬT ===========
async function autoUpdateData() {
  try {
    const currentData = await getLatestResult();
    
    if (!currentData) {
      return;
    }
    
    const isNewSession = !sessionHistory.has(currentData.SessionId);
    
    if (isNewSession) {
      sessionHistory.set(currentData.SessionId, {
        result: currentData.KetQua,
        dice: [currentData.FirstDice, currentData.SecondDice, currentData.ThirdDice],
        sum: currentData.DiceSum,
        time: currentData.CreatedDate,
        sessionId: currentData.SessionId
      });
      
      if (sessionHistory.size > 100) {
        const oldestKey = Array.from(sessionHistory.keys())[0];
        sessionHistory.delete(oldestKey);
      }
      
      lastSessionId = currentData.SessionId;
      
      const currentResult = convertToPattern(currentData.KetQua);
      history.push(currentResult);
      
      if (history.length > CONFIG.MAX_HISTORY) {
        history = history.slice(-CONFIG.MAX_HISTORY);
      }
      
      const previousPrediction = predictionHistory.get(currentData.SessionId);
      if (previousPrediction) {
        const predictionResult = evaluatePrediction(currentData.KetQua, previousPrediction);
        totalPredictions++;
        
        if (predictionResult === "Đúng") {
          correctPredictions++;
          consecutiveLosses = 0;
        } else {
          consecutiveLosses++;
        }
        
        predictionHistory.delete(currentData.SessionId);
      }
    }
    
    const nextSessionId = currentData.SessionId + 1;
    if (!predictionHistory.has(nextSessionId)) {
      const nextPrediction = predictNextResult();
      lastPrediction = nextPrediction.prediction;
      lastPattern = nextPrediction.pattern;
      
      predictionHistory.set(nextSessionId, lastPrediction);
    }
    
  } catch (error) {
    // Không log lỗi
  }
}

// =========== ROUTE API ===========
app.get('/api/data', async (req, res) => {
  try {
    await autoUpdateData();
    
    const currentData = lastRealData;
    
    if (!currentData) {
      return res.json({
        error: "Không có dữ liệu",
        message: "Đang chờ dữ liệu từ API",
        timestamp: new Date().toISOString()
      });
    }
    
    const nextSessionId = currentData.SessionId + 1;
    const nextPrediction = predictionHistory.get(nextSessionId) || lastPrediction;
    
    const taiCount = history.filter(h => h === 'T').length;
    const xiuCount = history.filter(h => h === 'X').length;
    const total = taiCount + xiuCount;
    const taiRate = total > 0 ? (taiCount / total * 100).toFixed(1) : '0.0';
    const xiuRate = total > 0 ? (xiuCount / total * 100).toFixed(1) : '0.0';
    
    let ketqua_ddoan = "Chưa có";
    const currentPrediction = predictionHistory.get(currentData.SessionId);
    if (currentPrediction) {
      ketqua_ddoan = evaluatePrediction(currentData.KetQua, currentPrediction);
    }
    
    const response = {
      Phien: currentData.SessionId,
      Xuc_xac_1: currentData.FirstDice,
      Xuc_xac_2: currentData.SecondDice,
      Xuc_xac_3: currentData.ThirdDice,
      Tong: currentData.DiceSum,
      Ket_qua: currentData.KetQua,
      phien_hien_tai: currentData.SessionId + 1,
      du_doan: nextPrediction,
      li_do: "Phân tích pattern và xu hướng từ dữ liệu thực",
      ketqua_ddoan: ketqua_ddoan,
      chien_luoc: consecutiveLosses >= 2 ? "Điều chỉnh chiến lược" : "Theo xu hướng hiện tại",
      chien_luoc_chi_tiet: consecutiveLosses >= 2 ? 
        `Thua ${consecutiveLosses} lần liên tiếp. Cần xem xét lại pattern.` :
        `Theo phân tích xu hướng từ ${total} kết quả gần đây`,
      thong_ke: {
        tong_du_doan: totalPredictions,
        dung: correctPredictions,
        ti_le: totalPredictions > 0 ? 
          ((correctPredictions / totalPredictions) * 100).toFixed(2) + '%' : '0%',
        thua_lien_tiep: consecutiveLosses,
        lich_su_dai: history.length,
        pattern_hien_tai: lastPattern,
        ty_le_thuc_te: {
          tai: `${taiCount}/${total} (${taiRate}%)`,
          xiu: `${xiuCount}/${total} (${xiuRate}%)`
        },
        phien_moi_nhat: currentData.SessionId,
        tong_phien_da_xu_ly: sessionHistory.size
      },
      lich_su_gian: history.slice(-10).map(h => h === 'T' ? 'Tài' : 'Xỉu'),
      pattern_hien_tai: lastPattern,
      timestamp: new Date().toISOString(),
      data_source: "API: https://wtx.macminim6.online/v1/tx/sessions",
      auto_update: isAutoUpdating,
      update_interval: CONFIG.UPDATE_INTERVAL / 1000 + " giây"
    };
    
    res.json(response);
    
  } catch (error) {
    res.status(500).json({
      error: "Lỗi server",
      timestamp: new Date().toISOString()
    });
  }
});

// =========== ROUTE GIAO DIỆN WEB ===========
app.get('/', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dự Đoán Tài Xỉu</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; background: #0f172a; color: #fff; min-height: 100vh; padding: 15px; }
      .container { max-width: 1200px; margin: 0 auto; }
      header { text-align: center; padding: 20px 0; background: rgba(30, 41, 59, 0.8); border-radius: 10px; margin-bottom: 20px; }
      h1 { font-size: 1.8em; margin-bottom: 5px; color: #3b82f6; }
      .subtitle { font-size: 0.9em; color: #94a3b8; margin-bottom: 10px; }
      .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 20px; }
      .card { background: rgba(30, 41, 59, 0.8); border-radius: 10px; padding: 15px; border: 1px solid rgba(255, 255, 255, 0.1); }
      .card h2 { font-size: 1.1em; margin-bottom: 10px; color: #60a5fa; display: flex; align-items: center; gap: 8px; }
      .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .info-item { padding: 8px; background: rgba(15, 23, 42, 0.6); border-radius: 6px; }
      .label { font-size: 0.8em; color: #94a3b8; margin-bottom: 3px; }
      .value { font-size: 1.1em; font-weight: bold; }
      .tai { color: #22c55e; }
      .xiu { color: #ef4444; }
      .dice-display { display: flex; justify-content: center; gap: 10px; margin: 15px 0; }
      .dice { width: 50px; height: 50px; background: linear-gradient(45deg, #3b82f6, #6366f1); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.5em; font-weight: bold; }
      .prediction { text-align: center; padding: 15px; border-radius: 10px; margin: 15px 0; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); }
      .prediction-value { font-size: 2em; font-weight: bold; margin: 5px 0; }
      .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; }
      .stat-item { padding: 10px; background: rgba(15, 23, 42, 0.6); border-radius: 6px; text-align: center; }
      .stat-value { font-size: 1.3em; font-weight: bold; margin: 3px 0; }
      .history-items { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .history-item { padding: 5px 10px; border-radius: 12px; font-weight: bold; font-size: 0.8em; }
      .history-item.tai { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
      .history-item.xiu { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
      .buttons { display: flex; gap: 10px; margin-top: 20px; justify-content: center; flex-wrap: wrap; }
      button { padding: 8px 16px; border: none; border-radius: 18px; background: #3b82f6; color: white; font-weight: 600; cursor: pointer; font-size: 0.85em; }
      button:hover { background: #2563eb; }
      .timestamp { text-align: center; color: #64748b; margin-top: 20px; font-size: 0.8em; }
      .loading { text-align: center; padding: 30px; color: #94a3b8; }
      .strategy { background: rgba(245, 158, 11, 0.15); padding: 10px; border-radius: 6px; margin-top: 10px; font-size: 0.85em; }
      .api-link { margin-top: 10px; text-align: center; }
      .api-link a { color: #60a5fa; text-decoration: none; padding: 6px 12px; background: rgba(15, 23, 42, 0.8); border-radius: 6px; display: inline-block; font-size: 0.8em; }
      @media (max-width: 768px) { .dashboard { grid-template-columns: 1fr; } .dice { width: 45px; height: 45px; } h1 { font-size: 1.5em; } }
    </style>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  </head>
  <body>
    <div class="container">
      <header>
        <h1><i class="fas fa-chart-line"></i> Dự Đoán Tài Xỉu</h1>
        <div class="subtitle">Hệ thống dự đoán từ API: resultTruyenThong & dices</div>
        <div id="status" class="subtitle">Đang kết nối...</div>
        <div class="api-link">
          <a href="/api/data" target="_blank"><i class="fas fa-code"></i> Xem JSON API (/api/data)</a>
        </div>
      </header>
      
      <div class="dashboard">
        <div class="card">
          <h2><i class="fas fa-dice"></i> Kết Quả Hiện Tại</h2>
          <div id="currentResult">
            <div class="loading">Đang tải dữ liệu...</div>
          </div>
        </div>
        
        <div class="card">
          <h2><i class="fas fa-bullseye"></i> Dự Đoán Tiếp Theo</h2>
          <div id="prediction">
            <div class="loading">Đang tính toán...</div>
          </div>
        </div>
        
        <div class="card">
          <h2><i class="fas fa-chart-bar"></i> Thống Kê</h2>
          <div id="stats">
            <div class="loading">Đang tải thống kê...</div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h2><i class="fas fa-history"></i> Lịch Sử 10 Lần Gần Nhất</h2>
        <div id="history" class="history-items">
          <div class="loading">Đang tải lịch sử...</div>
        </div>
      </div>
      
      <div class="buttons">
        <button onclick="refreshData()"><i class="fas fa-sync-alt"></i> Làm Mới</button>
        <button onclick="toggleAutoRefresh()"><i class="fas fa-clock"></i> <span id="autoRefreshText">Tự Động: BẬT</span></button>
        <button onclick="window.open('/api/data', '_blank')"><i class="fas fa-file-code"></i> Xem JSON</button>
      </div>
      
      <div class="timestamp">
        Cập nhật lần cuối: <span id="lastUpdate">--:--:--</span> | Phiên: <span id="latestSession">--</span>
      </div>
    </div>
    
    <script>
      let autoRefresh = true;
      let refreshInterval;
      
      function formatNumber(num) {
        return num.toString().padStart(2, '0');
      }
      
      function updateTime() {
        const now = new Date();
        const timeString = \`\${formatNumber(now.getHours())}:\${formatNumber(now.getMinutes())}:\${formatNumber(now.getSeconds())}\`;
        document.getElementById('lastUpdate').textContent = timeString;
      }
      
      function toggleAutoRefresh() {
        autoRefresh = !autoRefresh;
        const buttonText = document.getElementById('autoRefreshText');
        if (autoRefresh) {
          buttonText.textContent = 'Tự Động: BẬT';
          startAutoRefresh();
        } else {
          buttonText.textContent = 'Tự Động: TẮT';
          if (refreshInterval) clearInterval(refreshInterval);
        }
      }
      
      function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(fetchData, 5000);
      }
      
      function refreshData() {
        fetchData();
        if (autoRefresh) startAutoRefresh();
      }
      
      function fetchData() {
        document.getElementById('status').textContent = 'Đang cập nhật...';
        fetch('/api/data')
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              document.getElementById('status').textContent = 'Lỗi: ' + data.message;
              return;
            }
            updateDisplay(data);
            document.getElementById('status').textContent = 'Đã cập nhật';
            updateTime();
          })
          .catch(error => {
            document.getElementById('status').textContent = 'Lỗi kết nối';
          });
      }
      
      function updateDisplay(data) {
        document.getElementById('latestSession').textContent = data.Phien || '--';
        
        document.getElementById('currentResult').innerHTML = \`
          <div class="info-grid">
            <div class="info-item">
              <div class="label">Phiên số</div>
              <div class="value">#\${data.Phien}</div>
            </div>
            <div class="info-item">
              <div class="label">Tổng điểm</div>
              <div class="value \${data.Tong >= 11 ? 'tai' : 'xiu'}">\${data.Tong}</div>
            </div>
            <div class="info-item">
              <div class="label">Kết quả</div>
              <div class="value \${data.Ket_qua === 'Tài' ? 'tai' : 'xiu'}">\${data.Ket_qua}</div>
            </div>
            <div class="info-item">
              <div class="label">Đánh giá</div>
              <div class="value \${data.ketqua_ddoan === 'Đúng' ? 'tai' : data.ketqua_ddoan === 'Thua' ? 'xiu' : ''}">\${data.ketqua_ddoan}</div>
            </div>
          </div>
          <div class="dice-display">
            <div class="dice">\${data.Xuc_xac_1}</div>
            <div class="dice">\${data.Xuc_xac_2}</div>
            <div class="dice">\${data.Xuc_xac_3}</div>
          </div>
        \`;
        
        document.getElementById('prediction').innerHTML = \`
          <div class="prediction">
            <div class="label">Phiên tiếp theo: #\${data.phien_hien_tai}</div>
            <div class="prediction-value \${data.du_doan === 'Tài' ? 'tai' : 'xiu'}">\${data.du_doan}</div>
            <div class="label">\${data.li_do}</div>
          </div>
          <div class="strategy">
            <div class="label">Chiến lược: \${data.chien_luoc}</div>
            <div class="label">\${data.chien_luoc_chi_tiet}</div>
          </div>
        \`;
        
        document.getElementById('stats').innerHTML = \`
          <div class="stats-grid">
            <div class="stat-item">
              <div class="label">Tổng dự đoán</div>
              <div class="stat-value">\${data.thong_ke.tong_du_doan}</div>
            </div>
            <div class="stat-item">
              <div class="label">Đúng</div>
              <div class="stat-value tai">\${data.thong_ke.dung}</div>
            </div>
            <div class="stat-item">
              <div class="label">Tỷ lệ đúng</div>
              <div class="stat-value">\${data.thong_ke.ti_le}</div>
            </div>
            <div class="stat-item">
              <div class="label">Thua liên tiếp</div>
              <div class="stat-value \${data.thong_ke.thua_lien_tiep > 0 ? 'xiu' : 'tai'}">\${data.thong_ke.thua_lien_tiep}</div>
            </div>
          </div>
          <div style="margin-top: 10px; font-size: 0.8em; color: #94a3b8;">
            <div><i class="fas fa-chart-pie"></i> Tài: \${data.thong_ke.ty_le_thuc_te.tai} | Xỉu: \${data.thong_ke.ty_le_thuc_te.xiu}</div>
          </div>
        \`;
        
        document.getElementById('history').innerHTML = data.lich_su_gian.map((item, index) => {
          const isTai = item === 'Tài';
          return \`<div class="history-item \${isTai ? 'tai' : 'xiu'}">\${isTai ? 'T' : 'X'}</div>\`;
        }).join('');
      }
      
      document.addEventListener('DOMContentLoaded', function() {
        fetchData();
        startAutoRefresh();
        setInterval(updateTime, 1000);
      });
    </script>
  </body>
  </html>
  `);
});

// =========== KHỞI ĐỘNG SERVER ===========
app.listen(CONFIG.PORT, () => {
  console.log(`Server chạy tại http://localhost:${CONFIG.PORT}`);
  
  autoUpdateData();
  
  const updateInterval = setInterval(async () => {
    if (isAutoUpdating) {
      await autoUpdateData();
    }
  }, CONFIG.UPDATE_INTERVAL);
  
  process.on('SIGINT', () => {
    clearInterval(updateInterval);
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    clearInterval(updateInterval);
    process.exit(0);
  });
});
