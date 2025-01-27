const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const db = new sqlite3.Database(path.join(__dirname, "game.db"));

// 데이터베이스 초기화
db.serialize(() => {
  // 버전 테이블 생성
  db.run(`CREATE TABLE IF NOT EXISTS versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        platform TEXT NOT NULL,  -- 플랫폼 정보 추가
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
exports.createVersion = (version, platform, filename) => {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO versions (version, platform, filename) VALUES (?, ?, ?)",
      [version, platform, filename],
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

exports.deleteVersion = (id) => {
  return new Promise((resolve, reject) => {
    // 트랜잭션 시작
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      // 해당 버전과 연관된 피드백 먼저 삭제
      db.run("DELETE FROM feedback WHERE version_id = ?", [id], (err) => {
        if (err) {
          db.run("ROLLBACK");
          return reject(err);
        }

        // 버전 삭제
        db.run("DELETE FROM versions WHERE id = ?", [id], (err) => {
          if (err) {
            db.run("ROLLBACK");
            return reject(err);
          }

          // 변경사항 커밋
          db.run("COMMIT", (err) => {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }
            resolve();
          });
        });
      });
    });
  });
};
