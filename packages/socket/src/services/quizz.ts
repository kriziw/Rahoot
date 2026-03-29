import type { Quizz, QuizzQuestion } from "@mindbuzz/common/types/game"

export type RawQuizzQuestion = Omit<QuizzQuestion, "solutions"> & {
  solution?: number
  solutions?: number[]
}

export type RawQuizz = {
  subject: string
  questions: RawQuizzQuestion[]
}

export const normalizeOptionalAsset = (value?: string) => {
  const trimmed = value?.trim()

  return trimmed ? trimmed : undefined
}

export const normalizeSolutions = (
  question: RawQuizzQuestion,
  answers: string[],
  questionIndex: number,
) => {
  const candidateSolutions = Array.isArray(question.solutions)
    ? question.solutions
    : Number.isInteger(question.solution)
      ? [question.solution]
      : []
  const normalizedSolutions = [...new Set(candidateSolutions)].sort((a, b) => a - b)

  if (normalizedSolutions.length === 0) {
    throw new Error(`Question ${questionIndex + 1} must have at least one correct answer`)
  }

  if (
    normalizedSolutions.some(
      (solution) =>
        !Number.isInteger(solution) || solution < 0 || solution >= answers.length,
    )
  ) {
    throw new Error(`Question ${questionIndex + 1} has an invalid correct answer`)
  }

  return normalizedSolutions
}

export const normalizeQuizz = (quizz: RawQuizz): Quizz => {
  const subject = quizz.subject.trim()

  if (!subject) {
    throw new Error("Quiz subject is required")
  }

  if (!Array.isArray(quizz.questions) || quizz.questions.length === 0) {
    throw new Error("Quiz must contain at least one question")
  }

  return {
    subject,
    questions: quizz.questions.map((question, index) => {
      const normalizedQuestion = question.question.trim()
      const answers = question.answers.map((answer) => answer.trim())

      if (!normalizedQuestion) {
        throw new Error(`Question ${index + 1} must have text`)
      }

      if (answers.length < 2 || answers.length > 4) {
        throw new Error(`Question ${index + 1} must have between 2 and 4 answers`)
      }

      if (answers.some((answer) => !answer)) {
        throw new Error(`Question ${index + 1} contains an empty answer`)
      }

      if (!Number.isInteger(question.cooldown) || question.cooldown < 0) {
        throw new Error(`Question ${index + 1} has an invalid cooldown`)
      }

      if (!Number.isInteger(question.time) || question.time <= 0) {
        throw new Error(`Question ${index + 1} has an invalid answer time`)
      }

      return {
        question: normalizedQuestion,
        answers,
        solutions: normalizeSolutions(question, answers, index),
        cooldown: question.cooldown,
        time: question.time,
        image: normalizeOptionalAsset(question.image),
        video: normalizeOptionalAsset(question.video),
        audio: normalizeOptionalAsset(question.audio),
      }
    }),
  }
}
