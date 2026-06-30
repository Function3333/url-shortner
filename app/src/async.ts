/**
 * Race a promise against a timeout, resolving to a fallback value if it does
 * not settle in time. Used to bound the /readyz dependency checks so the
 * readiness probe always answers quickly — a hung dependency must read as
 * "not ready", never as a hung request (which a k8s probe would interpret as
 * a timeout/failure but only after its own, longer, deadline).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
