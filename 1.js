const http = require("http");

const HUDD_API = "https://betvip2x .hacksieucap.pro/huddd";

// ===== HÀM GỌI API HUDD =====
async function getHuddFull() {
  try {
    const res = await fetch(HUDD_API);
    const data = await res.json();

    return {
      // ===== META =====
      id: "@tiendataox",
      // ===== PHIÊN =====
      phien_hien_tai: data.phiendudoan, // đổi tên
      phien: data.Phien,

      // ===== KẾT QUẢ =====
      ket_qua_hien_tai: data.Ket_qua,
      tong: data.Tong,

      // ===== XÚC XẮC =====
      xuc_xac_1: data.Xuc_xac_1,
      xuc_xac_2: data.Xuc_xac_2,
      xuc_xac_3: data.Xuc_xac_3,

      // ===== DỰ ĐOÁN =====
      du_doan: data.du_doan,
      ty_le_du_doan: data.ty_le_dd,

      // ===== CHIẾN THUẬT / CẦU =====
      chien_thuat: data.chien_thuat,
      dang_cau: data.dang_cau,

      // ===== GIẢI THÍCH =====
      giai_thich: data.giai_thich,
      phan_tich_chi_tiet: data.phan_tich_chi_tiet,

      // ===== PATTERN =====
      pattern: data.pattern,
      patternb: data.pattern_kogioihab_van
    };
  } catch (err) {
    return {
      error: "HUDD API lỗi hoặc die",
      detail: err.toString()
    };
  }
}

// ===== SERVER HTTP =====
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/tx") {
    const data = await getHuddFull();

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });

    res.end(JSON.stringify(data, null, 2));
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

// ===== START SERVER =====
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ HUDD API chạy: http://localhost:${PORT}/api/tx');
});
