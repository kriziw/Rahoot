import type {
  ManagerRole,
  ManagerSession,
  OidcStatus,
} from "@mindbuzz/common/types/game"
import AccountStore from "@mindbuzz/socket/services/accountStore"
import Config from "@mindbuzz/socket/services/config"
import OidcStore from "@mindbuzz/socket/services/oidcStore"
import { createHash, randomBytes } from "crypto"

type DiscoveryDocument = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint?: string
}

type AuthorizationState = {
  clientId: string
  returnTo: string
  codeVerifier: string
  nonce: string
  createdAt: number
}

type LoginHandoff = {
  manager: ManagerSession
  returnTo: string
  createdAt: number
}

type IdTokenClaims = {
  iss?: string
  sub?: string
  aud?: string | string[]
  exp?: number
  nonce?: string
  email?: string
  preferred_username?: string
  [key: string]: unknown
}

const AUTH_STATE_TTL_MS = 10 * 60 * 1000
const LOGIN_HANDOFF_TTL_MS = 2 * 60 * 1000
const DEFAULT_RETURN_TO = "/manager"

const authorizationStates = new Map<string, AuthorizationState>()
const loginHandoffs = new Map<string, LoginHandoff>()

const toBase64Url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

const createCodeVerifier = () => toBase64Url(randomBytes(48))

const createCodeChallenge = (codeVerifier: string) =>
  toBase64Url(createHash("sha256").update(codeVerifier).digest())

const createStateToken = () => toBase64Url(randomBytes(24))

const parseJwtClaims = (token: string): IdTokenClaims | null => {
  const [, payload] = token.split(".")

  if (!payload) {
    return null
  }

  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/")
    const decodedPayload = Buffer.from(normalizedPayload, "base64").toString("utf-8")

    return JSON.parse(decodedPayload) as IdTokenClaims
  } catch {
    return null
  }
}

const getNestedClaim = (source: Record<string, unknown>, path: string) => {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((value, segment) => {
      if (!value || typeof value !== "object") {
        return undefined
      }

      return (value as Record<string, unknown>)[segment]
    }, source)
}

const normalizeRoleValues = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

const mapRoleFromClaims = (claims: Record<string, unknown>): ManagerRole | null => {
  const config = Config.oidc()
  const claimValue = config.roleClaimPath
    ? getNestedClaim(claims, config.roleClaimPath)
    : undefined
  const normalizedRoleValues = normalizeRoleValues(claimValue)

  if (
    normalizedRoleValues.some((value) => config.adminRoleValues.includes(value))
  ) {
    return "admin"
  }

  if (
    normalizedRoleValues.some((value) => config.managerRoleValues.includes(value))
  ) {
    return "manager"
  }

  return null
}

const deriveUsername = (claims: Record<string, unknown>) => {
  const preferredUsername =
    typeof claims.preferred_username === "string"
      ? claims.preferred_username.trim()
      : ""
  const email = typeof claims.email === "string" ? claims.email.trim() : ""
  const emailUsername = email.includes("@") ? email.split("@")[0] : email

  return preferredUsername || emailUsername || `oidc-user-${randomBytes(4).toString("hex")}`
}

const cleanupExpiredEntries = () => {
  const now = Date.now()

  authorizationStates.forEach((state, key) => {
    if (state.createdAt + AUTH_STATE_TTL_MS < now) {
      authorizationStates.delete(key)
    }
  })

  loginHandoffs.forEach((handoff, key) => {
    if (handoff.createdAt + LOGIN_HANDOFF_TTL_MS < now) {
      loginHandoffs.delete(key)
    }
  })
}

class OidcAuth {
  private static async fetchJson<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init)

    if (!response.ok) {
      throw new Error(`OIDC request failed with status ${response.status}`)
    }

    return (await response.json()) as T
  }

  static status(): OidcStatus {
    return Config.oidcStatus()
  }

  static async getDiscoveryDocument() {
    const config = Config.oidc()

    if (!config.discoveryUrl) {
      throw new Error("OIDC discovery URL is not configured")
    }

    return OidcAuth.fetchJson<DiscoveryDocument>(config.discoveryUrl)
  }

  static async buildAuthorizationUrl(input: {
    clientId: string
    returnTo?: string
    redirectUri: string
  }) {
    cleanupExpiredEntries()

    const status = OidcAuth.status()

    if (!status.enabled || !status.configured) {
      throw new Error("SSO is not configured")
    }

    const config = Config.oidc()
    const discovery = await OidcAuth.getDiscoveryDocument()
    const state = createStateToken()
    const nonce = createStateToken()
    const codeVerifier = createCodeVerifier()
    const codeChallenge = createCodeChallenge(codeVerifier)
    const returnTo =
      input.returnTo && input.returnTo.startsWith("/")
        ? input.returnTo
        : DEFAULT_RETURN_TO

    authorizationStates.set(state, {
      clientId: input.clientId,
      returnTo,
      codeVerifier,
      nonce,
      createdAt: Date.now(),
    })

    const authorizationUrl = new URL(discovery.authorization_endpoint)

    authorizationUrl.searchParams.set("client_id", config.clientId)
    authorizationUrl.searchParams.set("redirect_uri", input.redirectUri)
    authorizationUrl.searchParams.set("response_type", "code")
    authorizationUrl.searchParams.set("scope", config.scopes.join(" "))
    authorizationUrl.searchParams.set("state", state)
    authorizationUrl.searchParams.set("nonce", nonce)
    authorizationUrl.searchParams.set("code_challenge", codeChallenge)
    authorizationUrl.searchParams.set("code_challenge_method", "S256")

    return authorizationUrl.toString()
  }

  private static validateIdToken(
    idToken: string | undefined,
    discovery: DiscoveryDocument,
    nonce: string,
  ) {
    if (!idToken) {
      return null
    }

    const claims = parseJwtClaims(idToken)
    const config = Config.oidc()

    if (!claims) {
      throw new Error("Invalid ID token payload")
    }

    if (claims.iss !== discovery.issuer) {
      throw new Error("Invalid token issuer")
    }

    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]

    if (!audiences.includes(config.clientId)) {
      throw new Error("Invalid token audience")
    }

    if (claims.nonce !== nonce) {
      throw new Error("Invalid token nonce")
    }

    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
      throw new Error("Expired ID token")
    }

    return claims
  }

  static async handleCallback(input: {
    code: string
    state: string
    redirectUri: string
  }) {
    cleanupExpiredEntries()
    const storedState = authorizationStates.get(input.state)

    if (!storedState) {
      throw new Error("Invalid or expired OIDC state")
    }

    authorizationStates.delete(input.state)

    if (storedState.createdAt + AUTH_STATE_TTL_MS < Date.now()) {
      throw new Error("Expired OIDC authorization request")
    }

    const config = Config.oidc()
    const discovery = await OidcAuth.getDiscoveryDocument()
    const clientSecret = Config.oidcSecret()

    if (!clientSecret) {
      throw new Error("OIDC client secret is not configured")
    }

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: config.clientId,
      client_secret: clientSecret,
      code_verifier: storedState.codeVerifier,
    })

    const tokenResponse = await OidcAuth.fetchJson<{
      access_token: string
      id_token?: string
    }>(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    })

    const idTokenClaims = OidcAuth.validateIdToken(
      tokenResponse.id_token,
      discovery,
      storedState.nonce,
    )
    const userInfo = discovery.userinfo_endpoint
      ? await OidcAuth.fetchJson<Record<string, unknown>>(discovery.userinfo_endpoint, {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
          },
        })
      : {}
    const claims = {
      ...(idTokenClaims ?? {}),
      ...userInfo,
    }
    const issuer =
      typeof claims.iss === "string" && claims.iss
        ? claims.iss
        : discovery.issuer
    const subject =
      typeof claims.sub === "string" && claims.sub ? claims.sub : undefined

    if (!subject) {
      throw new Error("OIDC subject claim is required")
    }

    const mappedRole = mapRoleFromClaims(claims)

    if (!mappedRole) {
      throw new Error("Your account does not have a mapped MindBuzz role")
    }

    const existingIdentity = OidcStore.getIdentityByIssuerSubject(issuer, subject)
    let manager =
      existingIdentity && AccountStore.getManagerById(existingIdentity.managerId)
        ? AccountStore.getManagerById(existingIdentity.managerId)
        : null

    if (manager?.disabledAt) {
      throw new Error("Account is disabled")
    }

    if (!manager) {
      if (!config.autoProvisionEnabled) {
        throw new Error("SSO account is not provisioned")
      }

      manager = AccountStore.createOidcManager(deriveUsername(claims), mappedRole)
    } else if (manager.role !== mappedRole) {
      manager = AccountStore.updateManagerRole(manager.id, mappedRole)
    }

    OidcStore.upsertIdentity({
      managerId: manager.id,
      issuer,
      subject,
      email: typeof claims.email === "string" ? claims.email : null,
      usernameClaim:
        typeof claims.preferred_username === "string"
          ? claims.preferred_username
          : null,
      lastLoginAt: new Date().toISOString(),
    })

    loginHandoffs.set(storedState.clientId, {
      manager: {
        id: manager.id,
        username: manager.username,
        role: manager.role,
      },
      returnTo: storedState.returnTo,
      createdAt: Date.now(),
    })

    return storedState.returnTo
  }

  static consumeLoginHandoff(clientId: string) {
    cleanupExpiredEntries()
    const handoff = loginHandoffs.get(clientId)

    if (!handoff) {
      return null
    }

    loginHandoffs.delete(clientId)

    if (handoff.createdAt + LOGIN_HANDOFF_TTL_MS < Date.now()) {
      return null
    }

    return handoff
  }
}

export default OidcAuth
