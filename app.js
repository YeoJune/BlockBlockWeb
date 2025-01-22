require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("./database");
const app = express();
const port = process.env.PORT || 3000;

// 미들웨어 설정
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// 파일 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/games/");
  },
  filename: (req, file, cb) => {
    cb(null, `game_${req.body.version}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage: storage });

// 관리자 인증 미들웨어
const adminAuth = (req, res, next) => {
  const { password } = req.query;
  if (password === process.env.ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).send("Unauthorized");
  }
};

// 라우트: 메인 페이지
app.get("/", async (req, res) => {
  const latestVersion = await db.getLatestVersion();
  res.render("index", { version: latestVersion });
});

// 라우트: 피드백 게시판
app.get("/feedback", async (req, res) => {
  const feedback = await db.getAllFeedback();
  const versions = await db.getAllVersions();
  res.render("feedback", { feedback, versions });
});

// 라우트: 글쓰기 페이지
app.get("/feedback/write", async (req, res) => {
  const versions = await db.getAllVersions();
  res.render("write", { versions });
});

// 라우트: 피드백 작성 처리
app.post("/feedback", async (req, res) => {
  const { version_id, author, content } = req.body;
  await db.createFeedback(version_id, author, content);
  res.redirect("/feedback");
});

// 라우트: 관리자 페이지
app.get("/admin", adminAuth, async (req, res) => {
  const versions = await db.getAllVersions();
  res.render("admin", {
    versions,
    password: req.query.password,
  });
});

// 라우트: 게임 파일 업로드
app.post(
  "/admin/upload",
  adminAuth,
  upload.single("game_file"),
  async (req, res) => {
    try {
      const { version } = req.body;
      const filename = req.file.filename;
      await db.createVersion(version, filename);
      res.redirect(`/admin?password=${req.query.password}`);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).send("Upload failed");
    }
  }
);
// 서버 시작
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
