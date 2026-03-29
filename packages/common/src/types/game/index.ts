export type Player = {
  id: string
  clientId: string
  connected: boolean
  username: string
  points: number
}

export type Answer = {
  playerId: string
  answerId: number
  points: number
}

export type QuizzQuestion = {
  question: string
  image?: string
  video?: string
  audio?: string
  answers: string[]
  solutions: number[]
  cooldown: number
  time: number
}

export type Quizz = {
  subject: string
  questions: QuizzQuestion[]
}

export type QuizzWithId = Quizz & { id: string }

export type ManagerRole = "admin" | "manager"

export type ManagerAccount = {
  id: string
  username: string
  role: ManagerRole
  disabledAt: string | null
  createdAt: string
  updatedAt: string
}

export type ManagerSession = Pick<ManagerAccount, "id" | "username" | "role">

export type ActiveManagerGame = {
  gameId: string
  inviteCode: string
  subject: string
  started: boolean
  controlledByCurrentSession: boolean
}

export type ManagerSettings = {
  defaultAudio?: string
}

export type OidcConfig = {
  enabled: boolean
  autoProvisionEnabled: boolean
  discoveryUrl: string
  clientId: string
  hasClientSecret: boolean
  scopes: string[]
  roleClaimPath: string
  adminRoleValues: string[]
  managerRoleValues: string[]
}

export type OidcConfigInput = {
  enabled: boolean
  autoProvisionEnabled: boolean
  discoveryUrl: string
  clientId: string
  clientSecret?: string
  clearClientSecret?: boolean
  scopes: string[]
  roleClaimPath: string
  adminRoleValues: string[]
  managerRoleValues: string[]
}

export type OidcStatus = {
  enabled: boolean
  configured: boolean
}

export type ManagerOidcIdentity = {
  id: string
  managerId: string
  issuer: string
  subject: string
  email: string | null
  usernameClaim: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export type ManagerSettingsUpdate = {
  password?: string
  defaultAudio?: string | null
}

export type GameUpdateQuestion = {
  current: number
  total: number
}

export type QuizRunLeaderboardEntry = {
  playerId: string
  rank: number
  username: string
  points: number
}

export type QuizRunQuestionResponse = {
  playerId: string
  username: string
  answerId: number | null
  answerText: string | null
  isCorrect: boolean
  points: number
  totalPoints: number
}

export type QuizRunQuestion = {
  questionNumber: number
  question: string
  answers: string[]
  correctAnswers: number[]
  correctAnswerTexts: string[]
  responses: QuizRunQuestionResponse[]
}

export type QuizRunHistorySummary = {
  id: string
  gameId: string
  quizzId: string
  subject: string
  startedAt: string
  endedAt: string
  totalPlayers: number
  questionCount: number
  winner: string | null
}

export type QuizRunHistoryDetail = QuizRunHistorySummary & {
  leaderboard: QuizRunLeaderboardEntry[]
  questions: QuizRunQuestion[]
}
