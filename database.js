// database.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const db = new sqlite3.Database(path.join(__dirname, "game.db"));

// 데이터베이스 초기화
db.serialize(() => {
  // 버전 테이블 생성
  db.run(`CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    major_version INTEGER NOT NULL,
    minor_version INTEGER NOT NULL,
    patch_version INTEGER NOT NULL,
    version TEXT NOT NULL,
    platform TEXT NOT NULL,
    filename TEXT NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 피드백 테이블 생성
  db.run(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('bug', 'feature', 'balance', 'general')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
  )`);

  // 패치노트 테이블 생성
  db.run(`CREATE TABLE IF NOT EXISTS patch_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER UNIQUE,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
  )`);

  // 관리자 계정 테이블 생성
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// 버전 관련 함수들
exports.createVersion = (
  majorVersion,
  minorVersion,
  patchVersion,
  platform,
  filename
) => {
  return new Promise((resolve, reject) => {
    const version = `v${majorVersion}.${minorVersion}.${patchVersion}`;
    db.run(
      "INSERT INTO versions (major_version, minor_version, patch_version, version, platform, filename) VALUES (?, ?, ?, ?, ?, ?)",
      [majorVersion, minorVersion, patchVersion, version, platform, filename],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

exports.getAllVersions = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM versions 
       ORDER BY major_version DESC, minor_version DESC, patch_version DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

exports.getVersionsByPlatform = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT v.*, pn.content as patch_note
       FROM versions v
       LEFT JOIN patch_notes pn ON v.id = pn.version_id
       ORDER BY v.major_version DESC, v.minor_version DESC, v.patch_version DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else {
          const groupedVersions = rows.reduce((acc, version) => {
            if (!acc[version.platform]) {
              acc[version.platform] = [];
            }
            acc[version.platform].push(version);
            return acc;
          }, {});
          resolve(groupedVersions);
        }
      }
    );
  });
};

exports.getLatestVersions = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT v.*, pn.content as patch_note
       FROM versions v
       LEFT JOIN patch_notes pn ON v.id = pn.version_id
       WHERE (v.platform, v.upload_date) IN (
         SELECT platform, MAX(upload_date)
         FROM versions
         GROUP BY platform
       )`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

// 피드백 관련 함수들
exports.createFeedback = (version_id, author, content, type) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO feedback (version_id, author, content, type) VALUES (?, ?, ?, ?)",
      [version_id, author, content, type],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

exports.getAllFeedback = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT f.*, v.version 
       FROM feedback f 
       JOIN versions v ON f.version_id = v.id 
       ORDER BY f.created_at DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

exports.deleteFeedback = (id) => {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM feedback WHERE id = ?", [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// 패치노트 관련 함수들
exports.createPatchNote = (version_id, content) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO patch_notes (version_id, content) VALUES (?, ?)",
      [version_id, content],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

exports.getPatchNotes = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT pn.*, v.version, v.platform
       FROM patch_notes pn
       JOIN versions v ON pn.version_id = v.id
       ORDER BY v.major_version DESC, v.minor_version DESC, v.patch_version DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

exports.getPatchNoteByVersionId = (versionId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT pn.*, v.version, v.platform
           FROM patch_notes pn
           JOIN versions v ON pn.version_id = v.id
           WHERE pn.version_id = ?`,
      [versionId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

exports.getLatestPatchNote = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT pn.*, v.version, v.platform
       FROM patch_notes pn
       JOIN versions v ON pn.version_id = v.id
       ORDER BY v.major_version DESC, v.minor_version DESC, v.patch_version DESC
       LIMIT 1`,
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

// 버전 삭제
exports.deleteVersion = (id) => {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM versions WHERE id = ?", [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// 관리자 인증 관련 함수들
exports.createAdmin = (passwordHash) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO admins (password_hash) VALUES (?)",
      [passwordHash],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

exports.getAdmin = () => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM admins LIMIT 1", [], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getVersionById = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM versions WHERE id = ?", [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getLatestWebGLVersion = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM versions 
       WHERE platform = 'webgl' 
       ORDER BY major_version DESC, minor_version DESC, patch_version DESC 
       LIMIT 1`,
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

module.exports = exports;
