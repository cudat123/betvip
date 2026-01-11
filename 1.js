const express = require('express');
const axios = require('axios');

// =========== CẤU HÌNH ===========
const CONFIG = {
  PORT: process.env.PORT || 3000,
  API_URL: 'https://wtx.macminim6.online/v1/tx/sessions', // API Thật
  REFRESH_RATE: 3000 // 3 giây cập nhật 1 lần
};

// =========== BIẾN LƯU TRỮ (RAM) ===========
// Lưu trữ dữ liệu thật từ API, không fake
let dataStore = {
  sessions: [],      // Danh sách chi tiết các phiên
  historyString: '', // Chuỗi kết quả (VD: "TXTTX...") để soi cầu
  latestSession: null,
  lastUpdate: null
};

// Biến thống kê dự đoán (Chỉ tính khi server đang chạy)
let predictionStats = {
  total: 0,
  correct: 0,
  currentStreak: 0, // Số lần thua/thắng liên tiếp
  lastPrediction: null,
  lastPredSessionId: 0
};

const app = express();

// =========== HÀM XỬ LÝ DỮ LIỆU CỐT LÕI ===========

/**
 * Hàm chuẩn hóa dữ liệu từ API về định dạng chuẩn của hệ thống
 * Input: JSON từ API { id, resultTruyenThong, dices, point }
 */
function parseSessionData(apiData) {
  // Mapping dữ liệu:
  // resultTruyenThong: "TAI" -> "Tài", "XIU" -> "Xỉu"
  const ketQuaText = apiData.resultTruyenThong === "TAI" ? "Tài" : "Xỉu";
  const ketQuaShort = apiData.resultTruyenThong === "TAI" ? "T" : "X";

  return {
    SessionId: parseInt(apiData.id),           // id -> Phiên
    Result: ketQuaText,                        // resultTruyenThong -> Kết quả
    ResultShort: ketQuaShort,                  // T hoặc X để lưu lịch sử
    Dice1: apiData.dices[0],                   // dices[0]
    Dice2: apiData.dices[1],                   // dices[1]
    Dice3: apiData.dices[2],                   // dices[2]
    Sum: parseInt(apiData.point),              // point -> Tổng
    RawData: apiData                           // Lưu lại gốc nếu cần debug
  };
}

/**
 * Hàm gọi API và cập nhật kho dữ liệu
 */
async function syncDataFromAPI() {
  try {
    const response = await axios.get(CONFIG.API_URL, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (NodeJS Real Data Client)' }
    });

    const rawList = response.data;

    if (!Array.isArray(rawList) || rawList.length === 0) return;

    // 1. Sắp xếp danh sách từ cũ đến mới (ID bé -> ID lớn)
    // Để xây dựng lịch sử chính xác theo thời gian
    const sortedList = rawList.sort((a, b) => a.id - b.id);

    // 2. Xử lý dữ liệu
    let tempHistory = "";
    let tempSessions = [];

    sortedList.forEach(item => {
      const session = parseSessionData(item);
      tempSessions.push(session);
      tempHistory += session.ResultShort;
    });

    // 3. Cập nhật vào biến toàn cục
    dataStore.sessions = tempSessions;
    dataStore.historyString = tempHistory; // Chuỗi full lịch sử từ API
    
    // Lấy phiên mới nhất thực tế
    const newLatest = tempSessions[tempSessions.length - 1];

    // Xử lý logic kiểm tra dự đoán (Nếu có phiên mới)
    if (dataStore.latestSession && newLatest.SessionId > dataStore.latestSession.SessionId) {
        checkPrediction(newLatest);
    }

    dataStore.latestSession = newLatest;
    dataStore.lastUpdate = new Date();

    // Tạo dự đoán cho phiên TIẾP THEO (Phiên hiện tại + 1)
    makePrediction();

  } catch (error) {
    console.error("Lỗi kết nối API:", error.message);
  }
}

// =========== LOGIC DỰ ĐOÁN & KIỂM TRA ===========

function makePrediction() {
  // Chỉ dự đoán khi có dữ liệu thật
  if (!dataStore.historyString || dataStore.historyString.length < 10) return;

  const currentSessionId = dataStore.latestSession.SessionId;
  const nextSessionId = currentSessionId + 1;

  // Nếu đã dự đoán cho phiên này rồi thì bỏ qua
  if (predictionStats.lastPredSessionId === nextSessionId) return;

  // --- THUẬT TOÁN SOI CẦU ĐƠN GIẢN DỰA TRÊN DỮ LIỆU THẬT ---
  const history = dataStore.historyString;
  let prediction = "";
  let reason = "";

  // 1. Soi cầu bệt (Nếu 4 lần gần nhất giống nhau -> Bắt bệt)
  const last4 = history.slice(-4);
  if (last4 === "TTTT") {
    prediction = "Tài";
    reason = "Theo cầu bệt Tài (4 tay)";
  } else if (last4 === "XXXX") {
    prediction = "Xỉu";
    reason = "Theo cầu bệt Xỉu (4 tay)";
  } 
  // 2. Soi cầu 1-1 (TXTX hoặc XTXT)
  else if (history.slice(-4) === "TXTX") {
    prediction = "Tài";
    reason = "Theo cầu chuyền 1-1";
  } else if (history.slice(-4) === "XTXT") {
    prediction = "Xỉu";
    reason = "Theo cầu chuyền 1-1";
  }
  // 3. Soi theo xu hướng 20 phiên gần nhất
  else {
    const last20 = history.slice(-20);
    const countT = (last20.match(/T/g) || []).length;
    // Nếu Tài đang áp đảo (>12/20) -> Đánh hồi Xỉu (Bẻ cầu) hoặc theo Tài tùy chiến thuật
    // Ở đây chọn đánh theo xu hướng
    if (countT >= 12) {
      prediction = "Tài";
      reason = `Xu hướng Tài mạnh (${countT}/20)`;
    } else if (countT <= 8) {
      prediction = "Xỉu";
      reason = `Xu hướng Xỉu mạnh (${20-countT}/20)`;
    } else {
        // Cầu loạn: Đánh ngược kết quả phiên trước
        const lastResult = history.slice(-1);
        prediction = lastResult === 'T' ? "Xỉu" : "Tài";
        reason = "Cầu ngắn, đánh đảo";
    }
  }

  predictionStats.lastPrediction = prediction;
  predictionStats.lastPredSessionId = nextSessionId;
  predictionStats.reason = reason;
}

function checkPrediction(newResult) {
  // Kiểm tra dự đoán của phiên cũ
  if (predictionStats.lastPrediction && predictionStats.lastPredSessionId === newResult.SessionId) {
    predictionStats.total++;
    if (newResult.Result === predictionStats.lastPrediction) {
      predictionStats.correct++;
      // Reset streak thua nếu thắng
      if (predictionStats.currentStreak < 0) predictionStats.currentStreak = 1;
      else predictionStats.currentStreak++;
    } else {
      // Reset streak thắng nếu thua
      if (predictionStats.currentStreak > 0) predictionStats.currentStreak = -1;
      else predictionStats.currentStreak--;
    }
  }
}

// =========== API ROUTE CHO CLIENT ===========

app.get('/api/live', async (req, res) => {
  // Nếu chưa có dữ liệu, thử gọi đồng bộ 1 lần
  if (!dataStore.latestSession) {
    await syncDataFromAPI();
  }

  const historyArr = dataStore.sessions.slice(-20); // Lấy 20 phiên hiển thị
  
  res.json({
    current_session: {
      id: dataStore.latestSession?.SessionId || 0,
      dices: [dataStore.latestSession?.Dice1, dataStore.latestSession?.Dice2, dataStore.latestSession?.Dice3],
      sum: dataStore.latestSession?.Sum,
      result: dataStore.latestSession?.Result
    },
    next_prediction: {
      session_id: dataStore.latestSession ? dataStore.latestSession.SessionId + 1 : 0,
      pick: predictionStats.lastPrediction || "Đang tính...",
      logic: predictionStats.reason || "Chờ dữ liệu..."
    },
    stats: {
      total_predictions: predictionStats.total,
      win_rate: predictionStats.total > 0 ? ((predictionStats.correct / predictionStats.total) * 100).toFixed(1) + '%' : '0%',
      streak: predictionStats.currentStreak > 0 ? `Thắng thông ${predictionStats.currentStreak}` : `Gãy ${Math.abs(predictionStats.currentStreak)}`
    },
    history_log: historyArr.map(s => ({
      phien: s.SessionId,
      ketqua: s.ResultShort, // T hoặc X
      tong: s.Sum
    })).reverse(), // Đảo ngược để phiên mới nhất lên đầu
    last_update: new Date().toLocaleTimeString()
  });
});

// =========== GIAO DIỆN WEB ĐƠN GIẢN ===========
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Soi Cầu Realtime API</title>
        <style>
            body { background: #1a1a1a; color: #fff; font-family: sans-serif; text-align: center; padding: 20px; }
            .box { background: #2d2d2d; padding: 20px; border-radius: 10px; margin: 15px auto; max-width: 600px; border: 1px solid #444; }
            .dice-group { display: flex; justify-content: center; gap: 10px; margin: 15px 0; }
            .dice { width: 50px; height: 50px; background: #eee; color: #000; font-weight: bold; font-size: 24px; line-height: 50px; border-radius: 8px; }
            .result-tai { color: #2ecc71; font-weight: bold; font-size: 2em; }
            .result-xiu { color: #e74c3c; font-weight: bold; font-size: 2em; }
            .pred-box { background: #2c3e50; padding: 15px; border-radius: 8px; }
            .history-bar { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 10px; }
            .badge { padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .bg-tai { background: rgba(46, 204, 113, 0.2); color: #2ecc71; border: 1px solid #2ecc71; }
            .bg-xiu { background: rgba(231, 76, 60, 0.2); color: #e74c3c; border: 1px solid #e74c3c; }
            .stats { display: flex; justify-content: space-around; font-size: 0.9em; color: #aaa; }
        </style>
    </head>
    <body>
        <h2>HỆ THỐNG DỮ LIỆU THẬT</h2>
        <div style="font-size: 0.8em; color: #888">API: wtx.macminim6.online</div>

        <div class="box">
            <h3>PHIÊN #<span id="phien">---</span></h3>
            <div class="dice-group">
                <div class="dice" id="d1">-</div>
                <div class="dice" id="d2">-</div>
                <div class="dice" id="d3">-</div>
            </div>
            <div id="ketqua" class="">---</div>
            <div style="margin-top:10px">Tổng điểm: <span id="tong">0</span></div>
        </div>

        <div class="box pred-box">
            <h3>DỰ ĐOÁN PHIÊN KẾ TIẾP</h3>
            <div style="font-size: 2.5em; font-weight: bold; color: #f1c40f" id="du-doan">---</div>
            <div style="color: #bbb; margin-top: 5px" id="ly-do">Đang tải dữ liệu...</div>
            <hr style="border-color: #444">
            <div class="stats">
                <span id="win-rate">Tỷ lệ thắng: 0%</span>
                <span id="streak">Chuỗi: 0</span>
            </div>
        </div>

        <div class="box">
            <h4>Lịch sử 20 phiên gần nhất</h4>
            <div class="history-bar" id="history">Loading...</div>
        </div>

        <script>
            function update() {
                fetch('/api/live')
                .then(r => r.json())
                .then(data => {
                    if(!data.current_session.id) return;

                    // Update KQ hiện tại
                    document.getElementById('phien').innerText = data.current_session.id;
                    document.getElementById('d1').innerText = data.current_session.dices[0];
                    document.getElementById('d2').innerText = data.current_session.dices[1];
                    document.getElementById('d3').innerText = data.current_session.dices[2];
                    document.getElementById('tong').innerText = data.current_session.sum;
                    
                    const kqEl = document.getElementById('ketqua');
                    kqEl.innerText = data.current_session.result;
                    kqEl.className = data.current_session.result === 'Tài' ? 'result-tai' : 'result-xiu';

                    // Update Dự đoán
                    document.getElementById('du-doan').innerText = data.next_prediction.pick;
                    document.getElementById('ly-do').innerText = data.next_prediction.logic;
                    document.getElementById('win-rate').innerText = 'Win Rate: ' + data.stats.win_rate;
                    document.getElementById('streak').innerText = data.stats.streak;

                    // Update Lịch sử
                    const hisHtml = data.history_log.map(h => {
                        const cls = h.ketqua === 'T' ? 'bg-tai' : 'bg-xiu';
                        return \`<div class="badge \${cls}">\${h.ketqua}</div>\`;
                    }).join('');
                    document.getElementById('history').innerHTML = hisHtml;
                });
            }

            setInterval(update, 3000); // 3 giây update giao diện 1 lần
            update();
        </script>
    </body>
    </html>
    `);
});

// =========== KHỞI ĐỘNG ===========
app.listen(CONFIG.PORT, async () => {
  console.log(\`Server đang chạy tại http://localhost:\${CONFIG.PORT}\`);
  console.log("Đang tải dữ liệu lịch sử lần đầu...");
  await syncDataFromAPI(); // Tải dữ liệu thật ngay khi mở server
  console.log("Đã đồng bộ dữ liệu xong!");
  
  // Thiết lập interval tự động cập nhật
  setInterval(syncDataFromAPI, CONFIG.REFRESH_RATE);
});
