/** Ant Design Drawer can leave body scroll-lock behind; breaks Joyride spotlight positioning. */
export function cleanupAntDrawerBodyLock(): void {
  if (typeof document === "undefined") return;
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.body.classList.remove("ant-scrolling-effect");
}

export async function waitForDrawerClosed(timeoutMs = 600): Promise<void> {
  if (typeof document === "undefined") return;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const openDrawer = document.querySelector(".ant-drawer-open");
    if (!openDrawer) break;
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }

  await new Promise((resolve) => window.setTimeout(resolve, 180));
  cleanupAntDrawerBodyLock();
}
