/**
 * Input validation for user-supplied URLs.
 *
 * We only shorten http/https URLs. Rejecting other schemes (javascript:,
 * data:, file:, …) keeps the redirect endpoint from becoming an open
 * gadget for client-side attacks.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_URL_LENGTH = 2048;

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}

/**
 * Validate and normalize a URL string.
 * @throws {InvalidUrlError} when the input is not an acceptable http(s) URL.
 */
export function normalizeUrl(input: unknown): string {
  if (typeof input !== "string") {
    throw new InvalidUrlError("url must be a string");
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new InvalidUrlError("url must not be empty");
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new InvalidUrlError(`url must be at most ${MAX_URL_LENGTH} characters`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvalidUrlError("url is not a valid absolute URL");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new InvalidUrlError("url must use http or https");
  }
  // Normalize to the canonical serialization for stable de-duplication.
  return parsed.toString();
}
