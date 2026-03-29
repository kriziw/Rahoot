import type {
  ManagerAccount,
  ManagerSession,
  ManagerSettings,
  ManagerSettingsUpdate,
  Quizz,
  QuizzWithId,
} from "@mindbuzz/common/types/game"
import { usernameValidator } from "@mindbuzz/common/validators/auth"
import Config from "@mindbuzz/socket/services/config"
import Database from "@mindbuzz/socket/services/database"
import History from "@mindbuzz/socket/services/history"
import { normalizeOptionalAsset, normalizeQuizz } from "@mindbuzz/socket/services/quizz"
import { randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { v4 as uuid } from "uuid"

const LEGACY_PLACEHOLDER_PASSWORD = "PASSWORD"

type ManagerRow = {
  id: string
  username: string
  role: ManagerAccount["role"]
  disabled_at: string | null
  created_at: string
  updated_at: string
  password_hash?: string
}

type LoginResult =
  | { ok: true; manager: ManagerSession }
  | { ok: false; reason: "invalid" | "disabled" }

const formatManager = (manager: ManagerRow): ManagerAccount => ({
  id: manager.id,
  username: manager.username,
  role: manager.role,
  disabledAt: manager.disabled_at,
  createdAt: manager.created_at,
  updatedAt: manager.updated_at,
})

const toSession = (manager: ManagerRow): ManagerSession => ({
  id: manager.id,
  username: manager.username,
  role: manager.role,
})

const normalizePassword = (password: string) => {
  const normalized = password.trim()

  if (!normalized) {
    throw new Error("Password is required")
  }

  return normalized
}

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")

  return `${salt}:${hash}`
}

const verifyPassword = (password: string, passwordHash: string) => {
  const [salt, storedHash] = passwordHash.split(":")

  if (!salt || !storedHash) {
    return false
  }

  const derivedHash = scryptSync(password, salt, storedHash.length / 2).toString(
    "hex",
  )

  return timingSafeEqual(
    Buffer.from(derivedHash, "hex"),
    Buffer.from(storedHash, "hex"),
  )
}

class AccountStore {
  private static getDb() {
    return Database.getDb()
  }

  private static getManagerCount() {
    const db = AccountStore.getDb()
    const result = db
      .prepare("SELECT COUNT(*) AS count FROM managers")
      .get() as { count: number }

    return result.count
  }

  private static normalizeUsername(username: string) {
    const normalized = username.trim()
    const result = usernameValidator.safeParse(normalized)

    if (!result.success) {
      throw new Error(result.error.issues[0].message)
    }

    return normalized
  }

  private static generateAvailableUsername(baseUsername: string) {
    const db = AccountStore.getDb()
    const sanitizedBase = baseUsername
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
    const fallbackBase = `user-${randomBytes(2).toString("hex")}`
    let normalizedBase = (sanitizedBase || fallbackBase).slice(0, 20)

    if (normalizedBase.length < 4) {
      normalizedBase = `${normalizedBase}${fallbackBase}`.slice(0, 20)
    }

    let candidate = AccountStore.normalizeUsername(normalizedBase)
    let suffix = 1

    while (
      db.prepare(
        "SELECT 1 FROM managers WHERE username = ? LIMIT 1",
      ).get(candidate)
    ) {
      suffix += 1
      const suffixText = `-${suffix}`
      const trimmedBase = normalizedBase.slice(0, 20 - suffixText.length)
      candidate = AccountStore.normalizeUsername(`${trimmedBase}${suffixText}`)
    }

    return candidate
  }

  private static createManagerRecord(
    username: string,
    password: string,
    role: ManagerAccount["role"],
  ) {
    const db = AccountStore.getDb()
    const now = new Date().toISOString()
    const id = uuid()
    const normalizedUsername = AccountStore.normalizeUsername(username)
    const normalizedPassword = normalizePassword(password)
    const statement = db.prepare(`
      INSERT INTO managers (
        id,
        username,
        password_hash,
        role,
        disabled_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?)
    `)

    try {
      statement.run(
        id,
        normalizedUsername,
        hashPassword(normalizedPassword),
        role,
        now,
        now,
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new Error("Username is already in use")
      }

      throw error
    }

    return AccountStore.getManagerRowById(id)!
  }

  private static migrateLegacyResources(managerId: string) {
    const db = AccountStore.getDb()
    const quizCount = db
      .prepare("SELECT COUNT(*) AS count FROM quizzes")
      .get() as { count: number }

    if (quizCount.count === 0) {
      const insertQuiz = db.prepare(`
        INSERT INTO quizzes (
          id,
          manager_id,
          subject,
          payload_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      const now = new Date().toISOString()

      Config.quizz().forEach((quizz) => {
        insertQuiz.run(
          quizz.id,
          managerId,
          quizz.subject,
          JSON.stringify({
            subject: quizz.subject,
            questions: quizz.questions,
          }),
          now,
          now,
        )
      })
    }

    const legacySettings = Config.managerSettings()

    if (legacySettings.defaultAudio) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO manager_settings (
          manager_id,
          default_audio,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(manager_id) DO UPDATE SET
          default_audio = excluded.default_audio,
          updated_at = excluded.updated_at
      `).run(managerId, legacySettings.defaultAudio, now, now)
    }

    History.claimLegacyRuns(managerId)
  }

  private static getManagerRowById(managerId: string) {
    const db = AccountStore.getDb()

    return db.prepare(`
      SELECT
        id,
        username,
        role,
        disabled_at,
        created_at,
        updated_at
      FROM managers
      WHERE id = ?
    `).get(managerId) as ManagerRow | undefined
  }

  static init() {
    Database.init()
    AccountStore.autoMigrateLegacyAdmin()
  }

  static isBootstrapRequired() {
    return AccountStore.getManagerCount() === 0
  }

  static autoMigrateLegacyAdmin() {
    if (!AccountStore.isBootstrapRequired()) {
      return
    }

    const legacyConfig = Config.game()
    const legacyPassword =
      typeof legacyConfig.managerPassword === "string"
        ? legacyConfig.managerPassword.trim()
        : ""

    if (!legacyPassword || legacyPassword === LEGACY_PLACEHOLDER_PASSWORD) {
      return
    }

    const admin = AccountStore.createManagerRecord("admin", legacyPassword, "admin")
    AccountStore.migrateLegacyResources(admin.id)
  }

  static createInitialAdmin(username: string, password: string) {
    if (!AccountStore.isBootstrapRequired()) {
      throw new Error("Initial admin is already configured")
    }

    const admin = AccountStore.createManagerRecord(username, password, "admin")
    AccountStore.migrateLegacyResources(admin.id)

    return toSession(admin)
  }

  static authenticateManager(username: string, password: string): LoginResult {
    const db = AccountStore.getDb()
    const normalizedUsername = username.trim()
    const normalizedPassword = password.trim()
    const manager = db.prepare(`
      SELECT
        id,
        username,
        role,
        disabled_at,
        created_at,
        updated_at,
        password_hash
      FROM managers
      WHERE username = ?
    `).get(normalizedUsername) as ManagerRow | undefined

    if (!manager || !manager.password_hash) {
      return { ok: false, reason: "invalid" }
    }

    if (manager.disabled_at) {
      return { ok: false, reason: "disabled" }
    }

    if (!normalizedPassword || !verifyPassword(normalizedPassword, manager.password_hash)) {
      return { ok: false, reason: "invalid" }
    }

    return {
      ok: true,
      manager: toSession(manager),
    }
  }

  static getManagerById(managerId: string) {
    const manager = AccountStore.getManagerRowById(managerId)

    return manager ? formatManager(manager) : null
  }

  static listManagers() {
    const db = AccountStore.getDb()
    const managers = db.prepare(`
      SELECT
        id,
        username,
        role,
        disabled_at,
        created_at,
        updated_at
      FROM managers
      ORDER BY
        CASE role WHEN 'admin' THEN 0 ELSE 1 END,
        username COLLATE NOCASE ASC
    `).all() as ManagerRow[]

    return managers.map(formatManager)
  }

  static createManager(username: string, password: string) {
    const manager = AccountStore.createManagerRecord(username, password, "manager")

    return formatManager(manager)
  }

  static createOidcManager(username: string, role: ManagerAccount["role"]) {
    const generatedPassword = randomBytes(24).toString("hex")
    const safeUsername = AccountStore.generateAvailableUsername(username)
    const manager = AccountStore.createManagerRecord(
      safeUsername,
      generatedPassword,
      role,
    )

    return formatManager(manager)
  }

  static resetManagerPassword(managerId: string, password: string) {
    const db = AccountStore.getDb()
    const now = new Date().toISOString()
    const normalizedPassword = normalizePassword(password)

    db.prepare(`
      UPDATE managers
      SET password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(hashPassword(normalizedPassword), now, managerId)

    const manager = AccountStore.getManagerById(managerId)

    if (!manager) {
      throw new Error("Manager not found")
    }

    return manager
  }

  static setManagerDisabled(managerId: string, disabled: boolean) {
    const db = AccountStore.getDb()
    const now = new Date().toISOString()
    const disabledAt = disabled ? now : null

    db.prepare(`
      UPDATE managers
      SET disabled_at = ?, updated_at = ?
      WHERE id = ?
    `).run(disabledAt, now, managerId)

    const manager = AccountStore.getManagerById(managerId)

    if (!manager) {
      throw new Error("Manager not found")
    }

    return manager
  }

  static updateManagerRole(managerId: string, role: ManagerAccount["role"]) {
    const db = AccountStore.getDb()
    const now = new Date().toISOString()

    db.prepare(`
      UPDATE managers
      SET role = ?, updated_at = ?
      WHERE id = ?
    `).run(role, now, managerId)

    const manager = AccountStore.getManagerById(managerId)

    if (!manager) {
      throw new Error("Manager not found")
    }

    return manager
  }

  static getManagerSettings(managerId: string): ManagerSettings {
    const db = AccountStore.getDb()
    const result = db.prepare(`
      SELECT default_audio AS defaultAudio
      FROM manager_settings
      WHERE manager_id = ?
    `).get(managerId) as { defaultAudio: string | null } | undefined

    return {
      defaultAudio: normalizeOptionalAsset(result?.defaultAudio ?? undefined),
    }
  }

  static updateManagerSettings(
    managerId: string,
    settings: ManagerSettingsUpdate,
  ) {
    const db = AccountStore.getDb()
    const now = new Date().toISOString()

    if (settings.password !== undefined) {
      const normalizedPassword = normalizePassword(settings.password)

      db.prepare(`
        UPDATE managers
        SET password_hash = ?, updated_at = ?
        WHERE id = ?
      `).run(hashPassword(normalizedPassword), now, managerId)
    }

    const currentSettings = AccountStore.getManagerSettings(managerId)
    const defaultAudio =
      settings.defaultAudio === undefined
        ? currentSettings.defaultAudio ?? null
        : settings.defaultAudio === null
          ? null
          : normalizeOptionalAsset(settings.defaultAudio) ?? null

    db.prepare(`
      INSERT INTO manager_settings (
        manager_id,
        default_audio,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(manager_id) DO UPDATE SET
        default_audio = excluded.default_audio,
        updated_at = excluded.updated_at
    `).run(managerId, defaultAudio ?? null, now, now)

    return AccountStore.getManagerSettings(managerId)
  }

  static listQuizzes(managerId: string) {
    const db = AccountStore.getDb()
    const rows = db.prepare(`
      SELECT id, payload_json AS payloadJson
      FROM quizzes
      WHERE manager_id = ?
      ORDER BY subject COLLATE NOCASE ASC
    `).all(managerId) as Array<{ id: string; payloadJson: string }>

    return rows.map((row) => ({
      id: row.id,
      ...(JSON.parse(row.payloadJson) as Quizz),
    })) as QuizzWithId[]
  }

  static getQuizz(managerId: string, quizzId: string) {
    const db = AccountStore.getDb()
    const row = db.prepare(`
      SELECT id, payload_json AS payloadJson
      FROM quizzes
      WHERE manager_id = ? AND id = ?
    `).get(managerId, quizzId) as
      | { id: string; payloadJson: string }
      | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      ...(JSON.parse(row.payloadJson) as Quizz),
    } satisfies QuizzWithId
  }

  static createQuizz(managerId: string, subject: string) {
    const db = AccountStore.getDb()
    const quizz = normalizeQuizz({
      subject,
      questions: [
        {
          question: "New question",
          answers: ["Answer 1", "Answer 2"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
      ],
    })
    const now = new Date().toISOString()
    const id = uuid()

    db.prepare(`
      INSERT INTO quizzes (
        id,
        manager_id,
        subject,
        payload_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      managerId,
      quizz.subject,
      JSON.stringify(quizz),
      now,
      now,
    )

    return {
      id,
      ...quizz,
    }
  }

  static updateQuizz(managerId: string, quizzId: string, quizz: Quizz) {
    const db = AccountStore.getDb()
    const normalizedQuizz = normalizeQuizz(quizz)
    const now = new Date().toISOString()
    const result = db.prepare(`
      UPDATE quizzes
      SET subject = ?, payload_json = ?, updated_at = ?
      WHERE id = ? AND manager_id = ?
    `).run(
      normalizedQuizz.subject,
      JSON.stringify(normalizedQuizz),
      now,
      quizzId,
      managerId,
    )

    if (result.changes === 0) {
      throw new Error("Quiz not found")
    }

    return {
      id: quizzId,
      ...normalizedQuizz,
    }
  }

  static deleteQuizz(managerId: string, quizzId: string) {
    const db = AccountStore.getDb()
    const result = db.prepare(`
      DELETE FROM quizzes
      WHERE id = ? AND manager_id = ?
    `).run(quizzId, managerId)

    if (result.changes === 0) {
      throw new Error("Quiz not found")
    }
  }
}

export default AccountStore
