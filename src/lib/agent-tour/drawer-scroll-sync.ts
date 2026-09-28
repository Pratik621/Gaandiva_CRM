/** Joyride does not listen to Ant Design Drawer body scroll by default. */
export function bindAgentTourDrawerScrollSync(): () => void {
  if (typeof window === "undefined") return () => {};

  const drawerBody = document.querySelector(".ant-drawer-open .ant-drawer-body");
  if (!drawerBody) return () => {};

  let raf = 0;
  const notify = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  };

  drawerBody.addEventListener("scroll", notify, { passive: true });
  window.addEventListener("resize", notify);

  return () => {
    drawerBody.removeEventListener("scroll", notify);
    window.removeEventListener("resize", notify);
    cancelAnimationFrame(raf);
  };
}

export function scrollAgentLeadDrawerToTop(): void {
  if (typeof document === "undefined") return;
  const drawerBody = document.querySelector(".ant-drawer-open .ant-drawer-body");
  if (drawerBody instanceof HTMLElement) {
    drawerBody.scrollTop = 0;
  }
}
