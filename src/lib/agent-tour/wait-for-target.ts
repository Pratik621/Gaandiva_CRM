export function waitForTourTarget(
  selector: string,
  timeoutMs = 8000,
  intervalMs = 80
): Promise<Element | null> {
  if (typeof document === "undefined") {
    return Promise.resolve(null);
  }

  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        window.clearInterval(timer);
        resolve(el);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, intervalMs);
  });
}
