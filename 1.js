const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Hàm fetch chung
async function fetchBetVip(url) {
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;

    return {
        phien: data.phien,
        xuc_xac_1: data.xuc_xac_1,
        xuc_xac_2: data.xuc_xac_2,
        xuc_xac_3: data.xuc_xac_3,
        tong: data.tong,
        ket_qua: data.ket_qua
    };
}

/* ===== API TX ===== */
app.get("/api/tx", async (req, res) => {
    try {
        const data = await fetchBetVip(
            "https://betvip-seven.vercel.app/betvip/tx"
        );
        res.json({
            ban: "TX",
            status: "success",
            data
        });
    } catch (err) {
        res.status(500).json({
            ban: "TX",
            status: "error",
            message: err.message
        });
    }
});

/* ===== API MD5 ===== */
app.get("/api/md5", async (req, res) => {
    try {
        const data = await fetchBetVip(
            "https://betvip-seven.vercel.app/betvip/md5"
        );
        res.json({
            ban: "MD5",
            status: "success",
            data
        });
    } catch (err) {
        res.status(500).json({
            ban: "MD5",
            status: "error",
            message: err.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
