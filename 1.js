const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

/* ===========================
   BETVIP - HUD THƯỜNG
=========================== */
app.get("/tx", async (req, res) => {
    try {
        const { data } = await axios.get("https://betvip2x.hacksieucap.pro/huddd");

        if (data.phiendudoan) {
            data.phien_hien_tai = data.phiendudoan;
            delete data.phiendudoan;
        }

        res.json(data);

    } catch (err) {
        res.status(500).json({ error: "Lỗi BETVIP HUD" });
    }
});


/* ===========================
   BETVIP - MD5
=========================== */
app.get("/md5", async (req, res) => {
    try {
        const { data } = await axios.get("https://betvip2x.hacksieucap.pro/md5dd");

        if (data.phiendudoan) {
            data.phien_hien_tai = data.phiendudoan;
            delete data.phiendudoan;
        }

        res.json(data);

    } catch (err) {
        res.status(500).json({ error: "Lỗi BETVIP MD5" });
    }
});


app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
