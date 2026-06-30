import { config } from "./config";

/**
 * The build identity. BUILD_SHA is injected by the Docker build (ARG → ENV),
 * so /version is the ground truth for "which image is actually serving" —
 * the signal the rollback demo watches flip back after `kubectl rollout undo`.
 */
export function getVersion(): { sha: string } {
  return { sha: config.buildSha };
}
