const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const db = new sqlite3.Database(path.join(__dirname, "game.db"));

// 데이터베이스 초기화
db.serialize(() => {
  // 버전 테이블 생성
  db.run(`CREATE TABLE IF NOT EXISTS versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        filename TEXT NOT NULL,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  // 피드백 테이블 생성
  db.run(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id INTEGER,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (version_id) REFERENCES versions(id)
    )`);
});

// 버전 관련 함수들
exports.createVersion = (version, filename) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO versions (version, filename) VALUES (?, ?)",
      [version, filename],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

exports.getAllVersions = () => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM versions ORDER BY upload_date DESC",
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

exports.getLatestVersion = () => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM versions ORDER BY upload_date DESC LIMIT 1",
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

// 피드백 관련 함수들
exports.createFeedback = (version_id, author, content) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO feedback (version_id, author, content) VALUES (?, ?, ?)",
      [version_id, author, content],
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
      `
            SELECT f.*, v.version 
            FROM feedback f 
            JOIN versions v ON f.version_id = v.id 
            ORDER BY f.created_at DESC
        `,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};
