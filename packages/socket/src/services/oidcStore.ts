import type { ManagerOidcIdentity } from "@mindbuzz/common/types/game"
import Database from "@mindbuzz/socket/services/database"
import { v4 as uuid } from "uuid"

type ManagerOidcIdentityRow = {
  id: string
  manager_id: string
  issuer: string
  subject: string
  email: string | null
  username_claim: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

const formatIdentity = (identity: ManagerOidcIdentityRow): ManagerOidcIdentity => ({
  id: identity.id,
  managerId: identity.manager_id,
  issuer: identity.issuer,
  subject: identity.subject,
  email: identity.email,
  usernameClaim: identity.username_claim,
  lastLoginAt: identity.last_login_at,
  createdAt: identity.created_at,
  updatedAt: identity.updated_at,
})

class OidcStore {
  private static getDb() {
    return Database.getDb()
  }

  static getIdentityByIssuerSubject(issuer: string, subject: string) {
    const db = OidcStore.getDb()
    const identity = db.prepare(`
      SELECT
        id,
        manager_id,
        issuer,
        subject,
        email,
        username_claim,
        last_login_at,
        created_at,
        updated_at
      FROM manager_oidc_identities
      WHERE issuer = ? AND subject = ?
    `).get(issuer, subject) as ManagerOidcIdentityRow | undefined

    return identity ? formatIdentity(identity) : null
  }

  static listIdentitiesForManager(managerId: string) {
    const db = OidcStore.getDb()
    const identities = db.prepare(`
      SELECT
        id,
        manager_id,
        issuer,
        subject,
        email,
        username_claim,
        last_login_at,
        created_at,
        updated_at
      FROM manager_oidc_identities
      WHERE manager_id = ?
      ORDER BY issuer COLLATE NOCASE ASC, subject COLLATE NOCASE ASC
    `).all(managerId) as ManagerOidcIdentityRow[]

    return identities.map(formatIdentity)
  }

  static upsertIdentity(input: {
    managerId: string
    issuer: string
    subject: string
    email?: string | null
    usernameClaim?: string | null
    lastLoginAt?: string | null
  }) {
    const db = OidcStore.getDb()
    const now = new Date().toISOString()
    const existing = OidcStore.getIdentityByIssuerSubject(input.issuer, input.subject)

    if (existing) {
      db.prepare(`
        UPDATE manager_oidc_identities
        SET
          manager_id = ?,
          email = ?,
          username_claim = ?,
          last_login_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        input.managerId,
        input.email ?? null,
        input.usernameClaim ?? null,
        input.lastLoginAt ?? existing.lastLoginAt,
        now,
        existing.id,
      )

      return OidcStore.getIdentityByIssuerSubject(input.issuer, input.subject)
    }

    const id = uuid()

    db.prepare(`
      INSERT INTO manager_oidc_identities (
        id,
        manager_id,
        issuer,
        subject,
        email,
        username_claim,
        last_login_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.managerId,
      input.issuer,
      input.subject,
      input.email ?? null,
      input.usernameClaim ?? null,
      input.lastLoginAt ?? null,
      now,
      now,
    )

    return OidcStore.getIdentityByIssuerSubject(input.issuer, input.subject)
  }
}

export default OidcStore
