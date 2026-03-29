export const LOCAL_MEDIA_PREFIX = "/media/"

const ALLOWED_REMOTE_AUDIO_PROTOCOLS = new Set(["http:", "https:"])

export const normalizeAudioUrl = (value?: string | null) => {
  const trimmed = value?.trim()

  if (!trimmed) {
    return undefined
  }

  if (trimmed.startsWith(LOCAL_MEDIA_PREFIX)) {
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)

    return ALLOWED_REMOTE_AUDIO_PROTOCOLS.has(parsed.protocol)
      ? trimmed
      : undefined
  } catch {
    return undefined
  }
}

export const isAudioUrlAllowed = (value?: string | null) =>
  normalizeAudioUrl(value) !== undefined
