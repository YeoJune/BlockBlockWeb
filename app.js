// app.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("./database");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcrypt");
const fs = require("fs");
const AdmZip = require("adm-zip");

const app = express();
const port = process.env.PORT || 3000;
const gamesDir = "public/games";

// 게임 파일 저장 디렉토리 생성
if (!fs.existsSync(gamesDir)) {
  fs.mkdirSync(gamesDir, { recursive: true });
}

// 미들웨어 설정
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// 세션 설정
app.use(
  session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: ".",
    }),
    secret: process.env.SESSION_SECRET || "catiscute",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24시간
    },
  })
);

// 정적 파일 제공 설정
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/games",
  express.static(path.join(__dirname, "public/games"), {
    setHeaders: (res, filePath) => {
      // console.log('Serving file:', filePath); // 디버깅용 로그

      if (filePath.endsWith(".js")) {
        res.set("Content-Type", "application/javascript");
      } else if (filePath.endsWith(".wasm")) {
        res.set("Content-Type", "application/wasm");
      } else if (filePath.endsWith(".data")) {
        res.set("Content-Type", "application/octet-stream");
      }

      // 캐시 비활성화 (개발 중에는 유용할 수 있음)
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    },
  })
);

// 파일 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (req.body.platform === "webgl") {
      const tempDir = path.join(__dirname, "public/games/temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      cb(null, tempDir);
    } else {
      cb(null, path.join(__dirname, "public/games"));
    }
  },
  filename: (req, file, cb) => {
    if (req.body.platform === "webgl") {
      cb(null, file.originalname);
    } else {
      const { major, minor, patch, platform } = req.body;
      const version = `v${major}.${minor}.${patch}`;
      cb(null, `game_${platform}_${version}${path.extname(file.originalname)}`);
    }
  },
});
const upload = multer({ storage: storage });

// 세션 체크 미들웨어
const requireLogin = (req, res, next) => {
  if (req.session.adminId) {
    next();
  } else {
    res.redirect("/admin/login");
  }
};

// 버전 문자열 파싱 함수
const parseVersion = (versionStr) => {
  const match = versionStr.match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
  };
};

// 라우트: 메인 페이지
app.get("/", async (req, res) => {
  try {
    const latestVersions = await db.getLatestVersions();
    const latestPatchNote = await db.getLatestPatchNote();
    res.render("index", {
      versions: latestVersions,
      patchNote: latestPatchNote,
      isAdmin: !!req.session.adminId,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 라우트: 버전 목록 페이지
app.get("/versions", async (req, res) => {
  try {
    const groupedVersions = await db.getVersionsByPlatform();
    res.render("versions", {
      groupedVersions,
      isAdmin: !!req.session.adminId,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 라우트: 패치노트 페이지
app.get("/patch-notes", async (req, res) => {
  try {
    const patchNotes = await db.getPatchNotes();
    res.render("patch_notes", {
      patchNotes,
      isAdmin: !!req.session.adminId,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 패치노트 조회 API
app.get("/api/patch-notes/:versionId", requireLogin, async (req, res) => {
  try {
    const versionId = req.params.versionId;
    const patchNote = await db.getPatchNoteByVersionId(versionId);
    res.json(patchNote);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// 라우트: 피드백 게시판
app.get("/feedback", async (req, res) => {
  try {
    const feedback = await db.getAllFeedback();
    const versions = await db.getAllVersions();
    res.render("feedback", {
      feedback,
      versions,
      isAdmin: !!req.session.adminId,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 라우트: 글쓰기 페이지
app.get("/feedback/write", async (req, res) => {
  try {
    const versions = await db.getAllVersions();
    res.render("write", {
      versions,
      isAdmin: !!req.session.adminId,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 라우트: 피드백 작성 처리
app.post("/feedback", async (req, res) => {
  try {
    const { version_id, author, content, type } = req.body;
    await db.createFeedback(version_id, author, content, type);
    res.redirect("/feedback");
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 라우트: 피드백 삭제 (관리자 전용)
app.post("/feedback/delete", requireLogin, async (req, res) => {
  try {
    const { feedback_id } = req.body;
    await db.deleteFeedback(feedback_id);
    res.redirect("/feedback");
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 라우트: 관리자 로그인 페이지
app.get("/admin/login", (req, res) => {
  if (req.session.adminId) {
    res.redirect("/admin");
  } else {
    res.render("admin_login", { error: null });
  }
});

// 라우트: 관리자 로그인 처리
app.post("/admin/login", async (req, res) => {
  try {
    const { password } = req.body;
    const admin = await db.getAdmin();

    if (admin && (await bcrypt.compare(password, admin.password_hash))) {
      req.session.adminId = admin.id;
      res.redirect("/admin");
    } else {
      res.render("admin_login", { error: "잘못된 비밀번호입니다." });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 라우트: 관리자 로그아웃
app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// 라우트: 관리자 페이지
app.get("/admin", requireLogin, async (req, res) => {
  try {
    const versions = await db.getAllVersions();
    res.render("admin", { versions });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 라우트: 게임 파일 업로드
app.post(
  "/admin/upload",
  requireLogin,
  upload.single("game_file"),
  async (req, res) => {
    try {
      const { major, minor, patch, platform } = req.body;
      const version = `v${major}.${minor}.${patch}`;
      let filename = req.file.filename;

      if (
        platform === "webgl" &&
        path.extname(filename).toLowerCase() === ".zip"
      ) {
        try {
          const tempZipPath = path.join(
            __dirname,
            "public/games/temp",
            filename
          );
          const extractPath = path.join(
            __dirname,
            "public/games",
            `webgl_${version}`
          );

          // 기존 디렉토리가 있다면 삭제
          if (fs.existsSync(extractPath)) {
            fs.rmSync(extractPath, { recursive: true, force: true });
          }

          // zip 파일 읽기 및 압축 해제
          const zip = new AdmZip(tempZipPath);
          zip.extractAllTo(extractPath, true);

          // 임시 zip 파일 삭제
          fs.unlinkSync(tempZipPath);

          // DB에 저장할 파일명 업데이트
          filename = `webgl_${version}`;
        } catch (error) {
          console.error("Error extracting zip:", error);
          throw new Error(
            "WebGL 빌드 압축 해제 중 오류가 발생했습니다: " + error.message
          );
        }
      }

      const versionId = await db.createVersion(
        parseInt(major),
        parseInt(minor),
        parseInt(patch),
        platform,
        filename
      );

      if (req.body.patch_note) {
        await db.createPatchNote(versionId, req.body.patch_note);
      }

      res.redirect("/admin");
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).send(error.message || "업로드 중 오류가 발생했습니다.");
    }
  }
);

// 라우트: 버전 삭제
app.post("/admin/delete", requireLogin, async (req, res) => {
  try {
    const { version_id, filename } = req.body;

    // 실제 파일/폴더 삭제
    const filePath = path.join(__dirname, "public/games", filename);
    if (fs.existsSync(filePath)) {
      try {
        // 폴더면 recursive하게 삭제, 파일이면 그냥 삭제
        fs.rmSync(filePath, { recursive: true, force: true });
      } catch (error) {
        console.error("File delete error:", error);
      }
    }

    // 데이터베이스에서 삭제
    await db.deleteVersion(version_id);

    res.redirect("/admin");
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).send("삭제 중 오류가 발생했습니다.");
  }
});

// 초기 관리자 계정 생성 (환경 변수에서 설정)
const initializeAdmin = async () => {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
      const existingAdmin = await db.getAdmin();
      if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        await db.createAdmin(passwordHash);
        console.log("Initial admin account created");
      }
    }
  } catch (error) {
    console.error("Failed to create initial admin account:", error);
  }
};

app.get("/play/:versionId", async (req, res) => {
  try {
    const version = await db.getVersionById(req.params.versionId);
    if (!version || version.platform !== "webgl") {
      return res.status(404).send("게임을 찾을 수 없습니다.");
    }

    const gameDir = path.join(__dirname, "public/games", version.filename);
    const indexPath = path.join(gameDir, "index.html");

    if (!fs.existsSync(indexPath)) {
      return res.status(404).send("게임 파일을 찾을 수 없습니다.");
    }

    let html = fs.readFileSync(indexPath, "utf8");

    // Unity 빌드 파일의 경로를 수정
    const basePath = `/games/${version.filename}/`;

    // Build 폴더 내 파일들의 경로 수정
    html = html
      .replace('src="Build/', `src="${basePath}Build/`)
      .replace('dataUrl: "Build/', `dataUrl: "${basePath}Build/`)
      .replace('frameworkUrl: "Build/', `frameworkUrl: "${basePath}Build/`)
      .replace('codeUrl: "Build/', `codeUrl: "${basePath}Build/`)
      .replace(
        'streamingAssetsUrl: "StreamingAssets',
        `streamingAssetsUrl: "${basePath}StreamingAssets`
      );

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
});

// 서버 시작
app.listen(port, async () => {
  await initializeAdmin();
  console.log(`Server running at http://localhost:${port}`);
});
