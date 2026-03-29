import type { ManagerSession } from "@mindbuzz/common/types/game"
import { Server, Socket } from "@mindbuzz/common/types/game/socket"
import { inviteCodeValidator } from "@mindbuzz/common/validators/auth"
import AccountStore from "@mindbuzz/socket/services/accountStore"
import Config from "@mindbuzz/socket/services/config"
import Game from "@mindbuzz/socket/services/game"
import History from "@mindbuzz/socket/services/history"
import OidcAuth from "@mindbuzz/socket/services/oidcAuth"
import Registry from "@mindbuzz/socket/services/registry"
import { withGame } from "@mindbuzz/socket/utils/game"
import fs from "fs"
import { createServer, type IncomingMessage, type ServerResponse } from "http"
import { extname, relative, resolve } from "path"
import { Server as ServerIO } from "socket.io"

const WS_PORT = 3001

const mimeTypes: Record<string, string> = {
  ".aac": "audio/aac",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
}

const getMimeType = (filename: string) =>
  mimeTypes[extname(filename).toLowerCase()] ?? "application/octet-stream"

const sendJson = (
  res: ServerResponse<IncomingMessage>,
  statusCode: number,
  body: unknown,
) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(body))
}

const getForwardedHeaderValue = (value: string | string[] | undefined) => {
  const rawValue = Array.isArray(value) ? value[0] : value

  return rawValue?.split(",")[0]?.trim() ?? ""
}

const normalizeRequestProtocol = (value: string) =>
  value.toLowerCase() === "https" ? "https" : "http"

const normalizeRequestHost = (value: string) =>
  value && !/[\s/\\]/.test(value) ? value : "localhost"

const getRequestOrigin = (req: IncomingMessage) => {
  const protocol = normalizeRequestProtocol(
    getForwardedHeaderValue(req.headers["x-forwarded-proto"]) || "http",
  )
  const host = normalizeRequestHost(
    getForwardedHeaderValue(req.headers["x-forwarded-host"]) ||
      getForwardedHeaderValue(req.headers.host) ||
      "localhost",
  )

  try {
    return new URL(`${protocol}://${host}`).origin
  } catch {
    return "http://localhost"
  }
}

const normalizeManagerReturnPath = (returnTo: string | undefined) => {
  const normalizedPath = returnTo?.trim() ?? ""

  if (!normalizedPath.startsWith("/") || normalizedPath.startsWith("//")) {
    return "/manager"
  }

  return normalizedPath
}

const buildManagerRedirect = (
  origin: string,
  returnTo: string | undefined,
  params: Record<string, string>,
) => {
  const redirectTarget = new URL(normalizeManagerReturnPath(returnTo), origin)

  Object.entries(params).forEach(([key, value]) => {
    redirectTarget.searchParams.set(key, value)
  })

  return redirectTarget.toString()
}

const httpServer = createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 404
    res.end("Not found")

    return
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host ?? "localhost"}`)

  if (requestUrl.pathname.startsWith("/ws")) {
    return
  }

  if (req.method === "GET" && requestUrl.pathname === "/auth/oidc/status") {
    sendJson(res, 200, OidcAuth.status())

    return
  }

  if (req.method === "GET" && requestUrl.pathname === "/auth/oidc/login") {
    const clientId = requestUrl.searchParams.get("clientId")?.trim() ?? ""
    const returnTo = normalizeManagerReturnPath(
      requestUrl.searchParams.get("returnTo") ?? "/manager",
    )

    if (!clientId) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" })
      res.end("clientId is required")

      return
    }

    const redirectUri = new URL("/auth/oidc/callback", getRequestOrigin(req)).toString()

    OidcAuth.buildAuthorizationUrl({
      clientId,
      returnTo,
      redirectUri,
    })
      .then((authorizationUrl) => {
        res.writeHead(302, {
          Location: authorizationUrl,
          "Cache-Control": "no-store",
        })
        res.end()
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Failed to start SSO login"
        const redirectUrl = buildManagerRedirect(getRequestOrigin(req), returnTo, {
          oidc: "error",
          message,
        })

        res.writeHead(302, {
          Location: redirectUrl,
          "Cache-Control": "no-store",
        })
        res.end()
      })

    return
  }

  if (req.method === "GET" && requestUrl.pathname === "/auth/oidc/callback") {
    const code = requestUrl.searchParams.get("code")
    const state = requestUrl.searchParams.get("state")
    const redirectUri = new URL("/auth/oidc/callback", getRequestOrigin(req)).toString()

    if (!code || !state) {
      const redirectUrl = buildManagerRedirect(getRequestOrigin(req), "/manager", {
        oidc: "error",
        message: "Missing OIDC callback parameters",
      })

      res.writeHead(302, {
        Location: redirectUrl,
        "Cache-Control": "no-store",
      })
      res.end()

      return
    }

    OidcAuth.handleCallback({
      code,
      state,
      redirectUri,
    })
      .then((returnTo) => {
        const redirectUrl = buildManagerRedirect(getRequestOrigin(req), returnTo, {
          oidc: "success",
        })

        res.writeHead(302, {
          Location: redirectUrl,
          "Cache-Control": "no-store",
        })
        res.end()
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Failed to complete SSO login"
        const redirectUrl = buildManagerRedirect(getRequestOrigin(req), "/manager", {
          oidc: "error",
          message,
        })

        res.writeHead(302, {
          Location: redirectUrl,
          "Cache-Control": "no-store",
        })
        res.end()
      })

    return
  }

  if (req.method !== "GET" || !requestUrl.pathname.startsWith("/media/")) {
    res.statusCode = 404
    res.end("Not found")

    return
  }

  const mediaDirectory = Config.mediaDirectory()
  const relativePath = decodeURIComponent(
    requestUrl.pathname.slice("/media/".length),
  )
  const filePath = resolve(mediaDirectory, relativePath)
  const pathFromMediaRoot = relative(mediaDirectory, filePath)

  if (
    !relativePath ||
    pathFromMediaRoot.startsWith("..") ||
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
    res.statusCode = 404
    res.end("Not found")

    return
  }

  res.writeHead(200, {
    "Content-Type": getMimeType(filePath),
    "Cache-Control": "public, max-age=3600",
  })
  fs.createReadStream(filePath).pipe(res)
})

const io: Server = new ServerIO(httpServer, {
  path: "/ws",
  maxHttpBufferSize: 25 * 1024 * 1024,
})

Config.init()
AccountStore.init()
History.init()

const registry = Registry.getInstance()
const authenticatedManagers = new Map<string, ManagerSession>()

const getSocketClientId = (socket: { handshake: { auth: { clientId?: string } } }) =>
  socket.handshake.auth.clientId ?? ""

const getAuthenticatedManager = (socket: {
  handshake: { auth: { clientId?: string } }
}) => authenticatedManagers.get(getSocketClientId(socket)) ?? null

const requireAuthenticatedManager = (socket: Socket) => {
  const manager = getAuthenticatedManager(socket)

  if (!manager) {
    socket.emit("manager:errorMessage", "Manager authentication required")
  }

  return manager
}

const requireAdminManager = (socket: Socket) => {
  const manager = requireAuthenticatedManager(socket)

  if (!manager) {
    return null
  }

  if (manager.role !== "admin") {
    socket.emit("manager:errorMessage", "Admin access required")

    return null
  }

  return manager
}

const emitBootstrapState = (socket: Socket) => {
  socket.emit("manager:bootstrapState", {
    requiresSetup: AccountStore.isBootstrapRequired(),
  })
}

const emitManagerDashboard = (socket: Socket, manager: ManagerSession) => {
  const clientId = getSocketClientId(socket)
  const activeGame = registry.getGameByManagerAccountId(manager.id)

  socket.emit("manager:authSuccess", { manager })
  socket.emit("manager:quizzList", AccountStore.listQuizzes(manager.id))
  socket.emit("manager:historyList", History.listRuns(manager.id))
  socket.emit("manager:settings", AccountStore.getManagerSettings(manager.id))
  socket.emit(
    "manager:activeGame",
    activeGame ? activeGame.getActiveManagerGame(clientId) : null,
  )

  if (manager.role === "admin") {
    socket.emit("manager:managersList", AccountStore.listManagers())
  } else {
    socket.emit("manager:managersList", [])
  }
}

const revokeControlledGameForClient = (clientId: string, reason: string) => {
  const game = registry
    .getAllGames()
    .find((item) => item.manager.clientId === clientId)

  if (!game) {
    return
  }

  if (!game.started) {
    game.abortCooldown()
    game.clearPendingPlayerRemovals()
    io.to(game.gameId).emit("game:reset", reason)
    registry.removeGame(game.gameId)

    return
  }

  game.revokeManagerControl(reason)
  registry.markGameAsEmpty(game)
}

const revokeManagerAccountAccess = (managerId: string, reason: string) => {
  authenticatedManagers.forEach((manager, clientId) => {
    if (manager.id === managerId) {
      authenticatedManagers.delete(clientId)
    }
  })

  const activeGame = registry.getGameByManagerAccountId(managerId)

  if (!activeGame) {
    return
  }

  if (!activeGame.started) {
    activeGame.abortCooldown()
    activeGame.clearPendingPlayerRemovals()
    io.to(activeGame.gameId).emit("game:reset", reason)
    registry.removeGame(activeGame.gameId)

    return
  }

  activeGame.terminate(reason)
}

console.log(`Socket server running on port ${WS_PORT}`)
httpServer.listen(WS_PORT)

io.on("connection", (socket) => {
  console.log(
    `A user connected: socketId: ${socket.id}, clientId: ${socket.handshake.auth.clientId}`,
  )

  socket.on("manager:getBootstrapState", () => {
    emitBootstrapState(socket)
  })

  socket.on("manager:createInitialAdmin", ({ username, password }) => {
    try {
      const manager = AccountStore.createInitialAdmin(username, password)

      authenticatedManagers.set(getSocketClientId(socket), manager)
      emitBootstrapState(socket)
      emitManagerDashboard(socket, manager)
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error
          ? error.message
          : "Failed to create the initial admin account",
      )
    }
  })

  socket.on("manager:auth", ({ username, password }) => {
    try {
      const result = AccountStore.authenticateManager(username, password)

      if (!result.ok) {
        socket.emit(
          "manager:errorMessage",
          result.reason === "disabled" ? "Account is disabled" : "Invalid credentials",
        )

        return
      }

      authenticatedManagers.set(getSocketClientId(socket), result.manager)
      emitManagerDashboard(socket, result.manager)
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to sign in",
      )
    }
  })

  socket.on("manager:completeOidcLogin", () => {
    const clientId = getSocketClientId(socket)
    const handoff = OidcAuth.consumeLoginHandoff(clientId)

    if (!handoff) {
      socket.emit("manager:errorMessage", "No pending SSO login was found")

      return
    }

    authenticatedManagers.set(clientId, handoff.manager)
    emitManagerDashboard(socket, handoff.manager)
  })

  socket.on("manager:getDashboard", () => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    emitManagerDashboard(socket, manager)
  })

  socket.on("manager:logout", () => {
    const clientId = getSocketClientId(socket)

    authenticatedManagers.delete(clientId)
    revokeControlledGameForClient(clientId, "Manager logged out")
  })

  socket.on("manager:listManagers", () => {
    const manager = requireAdminManager(socket)

    if (!manager) {
      return
    }

    socket.emit("manager:managersList", AccountStore.listManagers())
  })

  socket.on("manager:createManager", ({ username, password }) => {
    const manager = requireAdminManager(socket)

    if (!manager) {
      return
    }

    try {
      const createdManager = AccountStore.createManager(username, password)

      socket.emit("manager:managerCreated", createdManager)
      socket.emit("manager:managersList", AccountStore.listManagers())
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to create manager",
      )
    }
  })

  socket.on("manager:resetManagerPassword", ({ managerId, password }) => {
    const manager = requireAdminManager(socket)

    if (!manager) {
      return
    }

    try {
      const updatedManager = AccountStore.resetManagerPassword(managerId, password)

      socket.emit("manager:managerUpdated", updatedManager)
      socket.emit("manager:managersList", AccountStore.listManagers())
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to reset password",
      )
    }
  })

  socket.on("manager:setManagerDisabled", ({ managerId, disabled }) => {
    const manager = requireAdminManager(socket)

    if (!manager) {
      return
    }

    if (manager.id === managerId) {
      socket.emit("manager:errorMessage", "You cannot disable your own account")

      return
    }

    try {
      const updatedManager = AccountStore.setManagerDisabled(managerId, disabled)

      if (disabled) {
        revokeManagerAccountAccess(managerId, "Your account has been disabled")
      }

      socket.emit("manager:managerUpdated", updatedManager)
      socket.emit("manager:managersList", AccountStore.listManagers())
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to update manager",
      )
    }
  })

  socket.on("game:create", (quizzId) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    const activeGame = registry.getGameByManagerAccountId(manager.id)

    if (activeGame) {
      socket.emit("manager:errorMessage", "You already have an active game")
      socket.emit(
        "manager:activeGame",
        activeGame.getActiveManagerGame(getSocketClientId(socket)),
      )

      return
    }

    const quizz = AccountStore.getQuizz(manager.id, quizzId)

    if (!quizz) {
      socket.emit("game:errorMessage", "Quiz not found")

      return
    }

    const game = new Game(
      io,
      socket,
      manager,
      quizz,
      AccountStore.getManagerSettings(manager.id),
    )

    registry.addGame(game)
    socket.emit(
      "manager:activeGame",
      game.getActiveManagerGame(getSocketClientId(socket)),
    )
  })

  socket.on("manager:createQuizz", ({ subject }) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    try {
      const quizz = AccountStore.createQuizz(manager.id, subject)
      socket.emit("manager:quizzCreated", quizz)
      socket.emit("manager:quizzList", AccountStore.listQuizzes(manager.id))
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to create quiz",
      )
    }
  })

  socket.on("manager:updateQuizz", ({ quizzId, quizz }) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    try {
      const updatedQuizz = AccountStore.updateQuizz(manager.id, quizzId, quizz)
      socket.emit("manager:quizzUpdated", updatedQuizz)
      socket.emit("manager:quizzList", AccountStore.listQuizzes(manager.id))
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to update quiz",
      )
    }
  })

  socket.on("manager:deleteQuizz", ({ quizzId }) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    try {
      AccountStore.deleteQuizz(manager.id, quizzId)
      socket.emit("manager:quizzDeleted", quizzId)
      socket.emit("manager:quizzList", AccountStore.listQuizzes(manager.id))
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to delete quiz",
      )
    }
  })

  socket.on("manager:updateSettings", (settings) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    try {
      const nextSettings = AccountStore.updateManagerSettings(manager.id, settings)
      socket.emit("manager:settings", nextSettings)
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to update settings",
      )
    }
  })

  socket.on("manager:uploadMedia", ({ filename, content }) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    try {
      const url = Config.uploadMedia(filename, content)
      socket.emit("manager:mediaUploaded", { url })
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to upload audio file",
      )
    }
  })

  socket.on("manager:downloadHistory", ({ runId }) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    try {
      socket.emit(
        "manager:historyExportReady",
        History.exportCsv(manager.id, runId),
      )
    } catch (error) {
      socket.emit(
        "manager:errorMessage",
        error instanceof Error ? error.message : "Failed to export history",
      )
    }
  })

  socket.on("manager:reconnect", ({ gameId }) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      socket.emit("game:reset", "Manager authentication required")

      return
    }

    const game = registry.getGameById(gameId)

    if (!game || !game.isOwnedByManager(manager.id)) {
      socket.emit("game:reset", "Game expired")

      return
    }

    game.reconnect(socket)
  })

  socket.on("manager:takeOverGame", ({ gameId }) => {
    const manager = requireAuthenticatedManager(socket)

    if (!manager) {
      return
    }

    const game = registry.getGameById(gameId)

    if (!game || !game.isOwnedByManager(manager.id)) {
      socket.emit("manager:errorMessage", "Game not found")

      return
    }

    game.takeOverManager(socket)
    socket.emit(
      "manager:activeGame",
      game.getActiveManagerGame(getSocketClientId(socket)),
    )
  })

  socket.on("player:reconnect", ({ gameId }) => {
    const game = registry.getPlayerGame(gameId, socket.handshake.auth.clientId)

    if (game) {
      game.reconnect(socket)

      return
    }

    socket.emit("game:reset", "Game not found")
  })

  socket.on("player:join", (inviteCode) => {
    const result = inviteCodeValidator.safeParse(inviteCode)

    if (!result.success) {
      socket.emit("game:errorMessage", result.error.issues[0].message)

      return
    }

    const game = registry.getGameByInviteCode(inviteCode)

    if (!game) {
      socket.emit("game:errorMessage", "Game not found")

      return
    }

    socket.emit("game:successRoom", game.gameId)
  })

  socket.on("player:login", ({ gameId, data }) =>
    withGame(gameId, socket, (game) => game.join(socket, data.username)),
  )

  socket.on("manager:kickPlayer", ({ gameId, playerId }) =>
    withGame(gameId, socket, (game) => game.kickPlayer(socket, playerId)),
  )

  socket.on("manager:startGame", ({ gameId }) =>
    withGame(gameId, socket, (game) => game.start(socket)),
  )

  socket.on("player:selectedAnswer", ({ gameId, data }) =>
    withGame(gameId, socket, (game) =>
      game.selectAnswer(socket, data.answerKey),
    ),
  )

  socket.on("manager:abortQuiz", ({ gameId }) =>
    withGame(gameId, socket, (game) => game.abortRound(socket)),
  )

  socket.on("manager:nextQuestion", ({ gameId }) =>
    withGame(gameId, socket, (game) => game.nextRound(socket)),
  )

  socket.on("manager:showLeaderboard", ({ gameId }) =>
    withGame(gameId, socket, (game) => game.showLeaderboard()),
  )

  socket.on("manager:endGame", ({ gameId }) =>
    withGame(gameId, socket, (game) => {
      game.endGame(socket)

      const manager = getAuthenticatedManager(socket)

      if (manager) {
        socket.emit("manager:activeGame", null)
      }
    }),
  )

  socket.on("disconnect", () => {
    console.log(`A user disconnected : ${socket.id}`)

    const managerGame = registry.getGameByManagerSocketId(socket.id)

    if (managerGame) {
      managerGame.manager.connected = false
      registry.markGameAsEmpty(managerGame)

      if (!managerGame.started) {
        console.log("Reset game (manager disconnected)")
        managerGame.abortCooldown()
        managerGame.clearPendingPlayerRemovals()
        io.to(managerGame.gameId).emit("game:reset", "Manager disconnected")
        registry.removeGame(managerGame.gameId)

        return
      }
    }

    const game = registry.getGameByPlayerSocketId(socket.id)

    if (!game) {
      return
    }

    const player = game.players.find((item) => item.id === socket.id)

    if (!player) {
      return
    }

    if (!game.started) {
      player.connected = false
      game.schedulePlayerRemoval(player.id)
      io.to(game.gameId).emit("game:totalPlayers", game.players.length)

      console.log(
        `Marked player ${player.username} as disconnected in game ${game.gameId}`,
      )

      return
    }

    player.connected = false
    io.to(game.gameId).emit("game:totalPlayers", game.players.length)
  })
})

process.on("SIGINT", () => {
  Registry.getInstance().cleanup()
  process.exit(0)
})

process.on("SIGTERM", () => {
  Registry.getInstance().cleanup()
  process.exit(0)
})
