const express = require('express');
const axios = require('axios');

// =========== CẤU HÌNH ===========
const CONFIG = {
  PORT: 3000,
  UPDATE_INTERVAL: 5000,
  MAX_HISTORY: 100,
  PATTERN_LENGTH: 14,
  API_URL: 'https://wtx.macminim6.online/v1/tx/sessions'
};

// =========== DATABASE CẦU ===========
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

// =========== BIẾN ===========
let history = [];
let lastRealData = null;
let predictionHistory = new Map();
let sessionHistory = new Map();
let lastPrediction = null;
let lastPattern = null;
let totalPredictions = 0;
let correctPredictions = 0;
let consecutiveLosses = 0;

const app = express();

/* ================== FIX API =================== */
async function getLatestResult() {
  try {
    const response = await axios.get(CONFIG.API_URL, { timeout: 8000 });
    const raw = response.data;

    if (!raw || !Array.isArray(raw.list) || raw.list.length === 0) {
      console.log("API không có list");
      return null;
    }

    const sorted = [...raw.list].sort((a, b) => Number(b.id) - Number(a.id));
    const latest = sorted[0];

    const result = {
      SessionId: Number(latest.id),
      FirstDice: Number(latest.dices[0]),
      SecondDice: Number(latest.dices[1]),
      ThirdDice: Number(latest.dices[2]),
      DiceSum: Number(latest.point),
      KetQua: latest.resultTruyenThong === "TAI" ? "Tài" : "Xỉu",
      CreatedDate: new Date().toISOString()
    };

    lastRealData = result;
    return result;
  } catch (err) {
    console.log("API lỗi:", err.message);
    return null;
  }
}

/* ================== LOGIC =================== */
function convertToPattern(kq) {
  return kq === "Tài" ? "T" : "X";
}

function predictNextResult() {
  if (history.length < CONFIG.PATTERN_LENGTH) {
    const last = history[history.length - 1];
    return last === "T" ? "Tài" : "Xỉu";
  }

  const pattern = history.slice(-CONFIG.PATTERN_LENGTH).join('');
  lastPattern = pattern;

  if (CAU_DATABASE[pattern]) {
    return CAU_DATABASE[pattern] === "T" ? "Tài" : "Xỉu";
  }

  const t = history.filter(x => x === 'T').length;
  const x = history.filter(x => x === 'X').length;
  return t >= x ? "Tài" : "Xỉu";
}

function evaluate(actual, predicted) {
  if (!predicted) return "Chưa có";
  return actual === predicted ? "Đúng" : "Thua";
}

/* ================== AUTO =================== */
async function autoUpdate() {
  const data = await getLatestResult();
  if (!data) return;

  if (!sessionHistory.has(data.SessionId)) {
    sessionHistory.set(data.SessionId, data);

    history.push(convertToPattern(data.KetQua));
    if (history.length > CONFIG.MAX_HISTORY) history.shift();

    const old = predictionHistory.get(data.SessionId);
    if (old) {
      totalPredictions++;
      if (evaluate(data.KetQua, old) === "Đúng") {
        correctPredictions++;
        consecutiveLosses = 0;
      } else {
        consecutiveLosses++;
      }
    }
  }

  const next = data.SessionId + 1;
  if (!predictionHistory.has(next)) {
    const pred = predictNextResult();
    lastPrediction = pred;
    predictionHistory.set(next, pred);
  }
}

/* ================== API =================== */
app.get('/api/data', async (req, res) => {
  await autoUpdate();

  if (!lastRealData) return res.json({ error: "Đang chờ dữ liệu" });

  const next = lastRealData.SessionId + 1;

  res.json({
    Phien: lastRealData.SessionId,
    Xuc_xac_1: lastRealData.FirstDice,
    Xuc_xac_2: lastRealData.SecondDice,
    Xuc_xac_3: lastRealData.ThirdDice,
    Tong: lastRealData.DiceSum,
    Ket_qua: lastRealData.KetQua,
    phien_hien_tai: next,
    du_doan: predictionHistory.get(next),
    thong_ke: {
      tong: history.length,
      dung: correctPredictions,
      thua_lien_tiep: consecutiveLosses
    },
    pattern: lastPattern,
    timestamp: new Date().toISOString()
  });
});

/* ================== START =================== */
app.listen(CONFIG.PORT, () => {
  console.log("Server chạy: http://localhost:" + CONFIG.PORT);
  setInterval(autoUpdate, CONFIG.UPDATE_INTERVAL);
});
