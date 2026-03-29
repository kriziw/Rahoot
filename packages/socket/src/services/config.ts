import type {
  ManagerSettings,
  ManagerSettingsUpdate,
  OidcConfig,
  OidcConfigInput,
  OidcStatus,
  Quizz,
  QuizzWithId,
} from "@mindbuzz/common/types/game"
import {
  type RawQuizz,
  normalizeOptionalAsset,
  normalizeQuizz,
} from "@mindbuzz/socket/services/quizz"
import fs from "fs"
import { resolve } from "path"

const inContainerPath = process.env.CONFIG_PATH

const getPath = (path: string = "") =>
  inContainerPath
    ? resolve(inContainerPath, path)
    : resolve(process.cwd(), "../../config", path)

const getMediaPath = (path: string = "") =>
  inContainerPath
    ? resolve(inContainerPath, "..", "media", path)
    : resolve(process.cwd(), "../../media", path)

type StoredOidcConfig = Omit<OidcConfig, "hasClientSecret"> & {
  clientSecret: string
}

type AuthConfig = {
  oidc: StoredOidcConfig
}

const DEFAULT_OIDC_SCOPES = ["openid", "profile", "email"]

const DEFAULT_STORED_OIDC_CONFIG: StoredOidcConfig = {
  enabled: false,
  autoProvisionEnabled: false,
  discoveryUrl: "",
  clientId: "",
  clientSecret: "",
  scopes: DEFAULT_OIDC_SCOPES,
  roleClaimPath: "groups",
  adminRoleValues: ["mindbuzz-admin"],
  managerRoleValues: ["mindbuzz-manager"],
}

const DEFAULT_AUTH_CONFIG: AuthConfig = {
  oidc: DEFAULT_STORED_OIDC_CONFIG,
}

class Config {
  static quizzDirectory() {
    return getPath("quizz")
  }

  static mediaDirectory() {
    return getMediaPath()
  }

  static authConfigPath() {
    return getPath("auth.json")
  }

  private static normalizeStringList(values: string[] | undefined, fallback: string[]) {
    const normalized = (values ?? [])
      .map((value) => value.trim())
      .filter(Boolean)

    return normalized.length > 0 ? [...new Set(normalized)] : [...fallback]
  }

  private static normalizeStoredOidcConfig(
    config: Partial<StoredOidcConfig> | undefined,
  ): StoredOidcConfig {
    return {
      enabled: config?.enabled === true,
      autoProvisionEnabled: config?.autoProvisionEnabled === true,
      discoveryUrl: config?.discoveryUrl?.trim() ?? "",
      clientId: config?.clientId?.trim() ?? "",
      clientSecret: config?.clientSecret?.trim() ?? "",
      scopes: Config.normalizeStringList(config?.scopes, DEFAULT_OIDC_SCOPES),
      roleClaimPath: config?.roleClaimPath?.trim() ?? "",
      adminRoleValues: Config.normalizeStringList(config?.adminRoleValues, []),
      managerRoleValues: Config.normalizeStringList(config?.managerRoleValues, []),
    }
  }

  private static authConfig(): AuthConfig {
    const authConfigPath = Config.authConfigPath()

    if (!fs.existsSync(authConfigPath)) {
      return DEFAULT_AUTH_CONFIG
    }

    try {
      const config = JSON.parse(
        fs.readFileSync(authConfigPath, "utf-8"),
      ) as Partial<AuthConfig>

      return {
        oidc: Config.normalizeStoredOidcConfig(config.oidc),
      }
    } catch (error) {
      console.error("Failed to read auth config:", error)
    }

    return DEFAULT_AUTH_CONFIG
  }

  private static writeAuthConfig(config: AuthConfig) {
    fs.writeFileSync(Config.authConfigPath(), JSON.stringify(config, null, 2))
  }

  static init() {
    const isConfigFolderExists = fs.existsSync(getPath())

    if (!isConfigFolderExists) {
      fs.mkdirSync(getPath(), { recursive: true })
    }

    const isGameConfigExists = fs.existsSync(getPath("game.json"))

    if (!isGameConfigExists) {
      fs.writeFileSync(
        getPath("game.json"),
        JSON.stringify(
          {
            managerPassword: "PASSWORD",
          },
          null,
          2,
        ),
      )
    }

    const isAuthConfigExists = fs.existsSync(Config.authConfigPath())

    if (!isAuthConfigExists) {
      Config.writeAuthConfig(DEFAULT_AUTH_CONFIG)
    }

    const isQuizzExists = fs.existsSync(getPath("quizz"))

    if (!isQuizzExists) {
      fs.mkdirSync(getPath("quizz"), { recursive: true })

      fs.writeFileSync(
        getPath("quizz/example.json"),
        JSON.stringify(
          {
            subject: "Example Quiz",
            questions: [
              {
                question: "What is the correct answer?",
                answers: ["No", "Good answer", "No", "No"],
                solutions: [1],
                cooldown: 5,
                time: 15,
              },
              {
                question: "What is the correct answer with an image?",
                answers: ["No", "No", "No", "Good answer"],
                image: "https://placehold.co/600x400.png",
                solutions: [3],
                cooldown: 5,
                time: 20,
              },
              {
                question: "Which answers are correct?",
                answers: ["Good answer", "No", "Another good answer"],
                image: "https://placehold.co/600x400.png",
                solutions: [0, 2],
                cooldown: 5,
                time: 20,
              },
            ],
          },
          null,
          2,
        ),
      )
    }

    if (!fs.existsSync(getMediaPath())) {
      fs.mkdirSync(getMediaPath(), { recursive: true })
    }
  }

  static game() {
    const isExists = fs.existsSync(getPath("game.json"))

    if (!isExists) {
      throw new Error("Game config not found")
    }

    try {
      const config = fs.readFileSync(getPath("game.json"), "utf-8")

      return JSON.parse(config)
    } catch (error) {
      console.error("Failed to read game config:", error)
    }

    return {}
  }

  static managerSettings(): ManagerSettings {
    const config = Config.game()

    return {
      defaultAudio: normalizeOptionalAsset(config.defaultAudio),
    }
  }

  static oidc(): OidcConfig {
    const config = Config.authConfig().oidc

    return {
      enabled: config.enabled,
      autoProvisionEnabled: config.autoProvisionEnabled,
      discoveryUrl: config.discoveryUrl,
      clientId: config.clientId,
      hasClientSecret: Boolean(config.clientSecret),
      scopes: [...config.scopes],
      roleClaimPath: config.roleClaimPath,
      adminRoleValues: [...config.adminRoleValues],
      managerRoleValues: [...config.managerRoleValues],
    }
  }

  static oidcSecret() {
    const clientSecret = Config.authConfig().oidc.clientSecret

    return clientSecret || undefined
  }

  static oidcStatus(): OidcStatus {
    const config = Config.authConfig().oidc
    const configured = Boolean(
      config.discoveryUrl &&
        config.clientId &&
        config.clientSecret &&
        config.roleClaimPath &&
        (config.adminRoleValues.length > 0 || config.managerRoleValues.length > 0),
    )

    return {
      enabled: config.enabled,
      configured,
    }
  }

  static quizz() {
    const isExists = fs.existsSync(getPath("quizz"))

    if (!isExists) {
      return []
    }

    try {
      const files = fs
        .readdirSync(getPath("quizz"))
        .filter((file) => file.endsWith(".json"))

      const quizz: QuizzWithId[] = files.map((file) => {
        const data = fs.readFileSync(getPath(`quizz/${file}`), "utf-8")
        const config = normalizeQuizz(JSON.parse(data) as RawQuizz)

        const id = file.replace(".json", "")

        return {
          id,
          ...config,
        }
      })

      return quizz || []
    } catch (error) {
      console.error("Failed to read quizz config:", error)

      return []
    }
  }

  static createQuizz(subject: string) {
    const normalizedSubject = subject.trim()

    if (!normalizedSubject) {
      throw new Error("Quiz subject is required")
    }

    const baseId = normalizedSubject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

    const safeBaseId = baseId || "quiz"
    let quizzId = safeBaseId
    let duplicateIndex = 1

    while (fs.existsSync(getPath(`quizz/${quizzId}.json`))) {
      duplicateIndex += 1
      quizzId = `${safeBaseId}-${duplicateIndex}`
    }

    const quizz = normalizeQuizz({
      subject: normalizedSubject,
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

    fs.writeFileSync(
      getPath(`quizz/${quizzId}.json`),
      JSON.stringify(quizz, null, 2),
    )

    return {
      id: quizzId,
      ...quizz,
    }
  }

  static deleteQuizz(quizzId: string) {
    const normalizedId = quizzId.trim()

    if (!normalizedId) {
      throw new Error("Quiz id is required")
    }

    const safeId = normalizedId.replace(/[^a-zA-Z0-9-_]/g, "")

    if (!safeId || safeId !== normalizedId) {
      throw new Error("Invalid quiz id")
    }

    const path = getPath(`quizz/${safeId}.json`)

    if (!fs.existsSync(path)) {
      throw new Error("Quiz not found")
    }

    fs.unlinkSync(path)
  }

  static updateQuizz(quizzId: string, quizz: Quizz) {
    const normalizedId = quizzId.trim()

    if (!normalizedId) {
      throw new Error("Quiz id is required")
    }

    const safeId = normalizedId.replace(/[^a-zA-Z0-9-_]/g, "")

    if (!safeId || safeId !== normalizedId) {
      throw new Error("Invalid quiz id")
    }

    const path = getPath(`quizz/${safeId}.json`)

    if (!fs.existsSync(path)) {
      throw new Error("Quiz not found")
    }

    const normalizedQuizz = normalizeQuizz(quizz)

    fs.writeFileSync(path, JSON.stringify(normalizedQuizz, null, 2))

    return {
      id: safeId,
      ...normalizedQuizz,
    }
  }

  static updateManagerSettings(settings: ManagerSettingsUpdate) {
    const currentConfig = Config.game()
    const nextConfig = { ...currentConfig }

    if (settings.password !== undefined) {
      const managerPassword = settings.password.trim()

      if (!managerPassword) {
        throw new Error("Manager password is required")
      }

      nextConfig.managerPassword = managerPassword
    }

    if (settings.defaultAudio === null) {
      delete nextConfig.defaultAudio
    } else if (settings.defaultAudio !== undefined) {
      const defaultAudio = normalizeOptionalAsset(settings.defaultAudio)

      if (defaultAudio) {
        nextConfig.defaultAudio = defaultAudio
      } else {
        delete nextConfig.defaultAudio
      }
    }

    fs.writeFileSync(getPath("game.json"), JSON.stringify(nextConfig, null, 2))

    return Config.managerSettings()
  }

  static updateOidc(settings: OidcConfigInput) {
    const currentConfig = Config.authConfig().oidc
    const nextClientSecret =
      settings.clearClientSecret === true
        ? ""
        : settings.clientSecret !== undefined
          ? settings.clientSecret.trim()
          : currentConfig.clientSecret
    const nextConfig: AuthConfig = {
      oidc: Config.normalizeStoredOidcConfig({
        ...currentConfig,
        enabled: settings.enabled,
        autoProvisionEnabled: settings.autoProvisionEnabled,
        discoveryUrl: settings.discoveryUrl,
        clientId: settings.clientId,
        clientSecret: nextClientSecret,
        scopes: settings.scopes,
        roleClaimPath: settings.roleClaimPath,
        adminRoleValues: settings.adminRoleValues,
        managerRoleValues: settings.managerRoleValues,
      }),
    }

    Config.writeAuthConfig(nextConfig)

    return Config.oidc()
  }

  static uploadMedia(filename: string, content: string) {
    const normalizedFilename = filename.trim()

    if (!normalizedFilename) {
      throw new Error("Filename is required")
    }

    const safeFilename = normalizedFilename
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")

    if (!safeFilename) {
      throw new Error("Invalid filename")
    }

    const targetPath = getMediaPath(safeFilename)
    const buffer = Buffer.from(content, "base64")

    if (!buffer.length) {
      throw new Error("Uploaded file is empty")
    }

    fs.mkdirSync(getMediaPath(), { recursive: true })
    fs.writeFileSync(targetPath, buffer)

    return `/media/${safeFilename}`
  }
}

export default Config

