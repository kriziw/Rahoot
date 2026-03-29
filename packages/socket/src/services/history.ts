import type {
  QuizRunHistoryDetail,
  QuizRunHistorySummary,
} from "@mindbuzz/common/types/game"
import Database from "@mindbuzz/socket/services/database"

const escapeCsv = (value: string | number | null) => {
  const normalized = value === null ? "" : String(value)

  return `"${normalized.replace(/"/g, '""')}"`
}

type LegacyQuizRunQuestion = QuizRunHistoryDetail["questions"][number] & {
  correctAnswer?: number
  correctAnswerText?: string
}

type LegacyQuizRunHistoryDetail = Omit<QuizRunHistoryDetail, "questions"> & {
  questions: LegacyQuizRunQuestion[]
}

const normalizeRun = (
  run: LegacyQuizRunHistoryDetail,
): QuizRunHistoryDetail => ({
  ...run,
  questions: run.questions.map((question) => ({
    ...question,
    correctAnswers:
      question.correctAnswers ??
      (question.correctAnswer !== undefined ? [question.correctAnswer] : []),
    correctAnswerTexts:
      question.correctAnswerTexts ??
      (question.correctAnswerText ? [question.correctAnswerText] : []),
  })),
})

class History {
  static init() {
    Database.init()
  }

  static addRun(managerId: string, run: QuizRunHistoryDetail) {
    const db = Database.getDb()
    const statement = db.prepare(`
      INSERT OR REPLACE INTO quiz_runs (
        id,
        manager_id,
        game_id,
        quizz_id,
        subject,
        started_at,
        ended_at,
        total_players,
        question_count,
        winner,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    statement.run(
      run.id,
      managerId,
      run.gameId,
      run.quizzId,
      run.subject,
      run.startedAt,
      run.endedAt,
      run.totalPlayers,
      run.questionCount,
      run.winner,
      JSON.stringify(run),
    )
  }

  static listRuns(managerId: string): QuizRunHistorySummary[] {
    const db = Database.getDb()
    const statement = db.prepare(`
      SELECT
        id,
        game_id AS gameId,
        quizz_id AS quizzId,
        subject,
        started_at AS startedAt,
        ended_at AS endedAt,
        total_players AS totalPlayers,
        question_count AS questionCount,
        winner
      FROM quiz_runs
      WHERE manager_id = ?
      ORDER BY ended_at DESC
    `)

    return statement.all(managerId) as QuizRunHistorySummary[]
  }

  static claimLegacyRuns(managerId: string) {
    const db = Database.getDb()
    const statement = db.prepare(`
      UPDATE quiz_runs
      SET manager_id = ?
      WHERE manager_id IS NULL
    `)

    statement.run(managerId)
  }

  static getRun(managerId: string, runId: string) {
    const db = Database.getDb()
    const statement = db.prepare(`
      SELECT payload_json AS payloadJson
      FROM quiz_runs
      WHERE id = ?
        AND manager_id = ?
    `)
    const result = statement.get(runId, managerId) as
      | { payloadJson: string }
      | undefined

    if (!result) {
      return null
    }

    return normalizeRun(
      JSON.parse(result.payloadJson) as LegacyQuizRunHistoryDetail,
    )
  }

  static exportCsv(managerId: string, runId: string) {
    const run = History.getRun(managerId, runId)

    if (!run) {
      throw new Error("History entry not found")
    }

    const lines = [
      [
        "Quiz",
        "Started At",
        "Ended At",
        "Question Number",
        "Question",
        "Player",
        "Answer Id",
        "Answer Text",
        "Correct Answer Ids",
        "Correct Answer Texts",
        "Is Correct",
        "Points Earned",
        "Total Points",
        "Final Rank",
      ]
        .map(escapeCsv)
        .join(","),
    ]

    run.questions.forEach((question) => {
      question.responses.forEach((response) => {
        const leaderboardEntry = run.leaderboard.find(
          (entry) => entry.playerId === response.playerId,
        )

        lines.push(
          [
            run.subject,
            run.startedAt,
            run.endedAt,
            question.questionNumber,
            question.question,
            response.username,
            response.answerId,
            response.answerText,
            question.correctAnswers.join("; "),
            question.correctAnswerTexts.join(" | "),
            response.isCorrect ? "yes" : "no",
            response.points,
            response.totalPoints,
            leaderboardEntry?.rank ?? "",
          ]
            .map(escapeCsv)
            .join(","),
        )
      })
    })

    const safeSubject = run.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-")

    return {
      filename: `${safeSubject || "quiz"}-${run.id}.csv`,
      content: lines.join("\n"),
    }
  }
}

export default History

