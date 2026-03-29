import fs from "fs"
import { resolve } from "path"
import { DatabaseSync } from "node:sqlite"

const inContainerPath = process.env.CONFIG_PATH

const getDatabasePath = () =>
  inContainerPath
    ? resolve(inContainerPath, "history.db")
    : resolve(process.cwd(), "../../config", "history.db")

class Database {
  private static db: DatabaseSync | null = null

  private static ensureColumn(
    db: DatabaseSync,
    table: string,
    column: string,
    definition: string,
  ) {
    const columns = db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>

    if (columns.some((item) => item.name === column)) {
      return
    }

    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }

  private static initializeSchema(db: DatabaseSync) {
    db.exec("PRAGMA foreign_keys = ON")

    db.exec(`
      CREATE TABLE IF NOT EXISTS managers (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
        disabled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS manager_settings (
        manager_id TEXT PRIMARY KEY,
        default_audio TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE
      ) STRICT
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        manager_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE
      ) STRICT
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS manager_oidc_identities (
        id TEXT PRIMARY KEY,
        manager_id TEXT NOT NULL,
        issuer TEXT NOT NULL,
        subject TEXT NOT NULL,
        email TEXT,
        username_claim TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE,
        UNIQUE (issuer, subject)
      ) STRICT
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS quiz_runs (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        quizz_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        total_players INTEGER NOT NULL,
        question_count INTEGER NOT NULL,
        winner TEXT,
        payload_json TEXT NOT NULL
      ) STRICT
    `)

    Database.ensureColumn(db, "quiz_runs", "manager_id", "TEXT")

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_quizzes_manager_id
      ON quizzes(manager_id)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_quiz_runs_manager_id
      ON quiz_runs(manager_id)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_manager_oidc_identities_manager_id
      ON manager_oidc_identities(manager_id)
    `)
  }

  static getDb() {
    if (Database.db) {
      return Database.db
    }

    const path = getDatabasePath()
    const directory = resolve(path, "..")

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }

    const db = new DatabaseSync(path)
    Database.initializeSchema(db)
    Database.db = db

    return db
  }

  static init() {
    Database.getDb()
  }
}

export default Database
