"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type BorderBeamProps = {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
};

/** Animated beam traveling along the border (Magic UI–style). Styles in globals.css. */
export function BorderBeam({
  className,
  size = 80,
  duration = 8,
  delay = 0,
  colorFrom = "#94a3b8",
  colorTo = "#334155",
  borderWidth = 1,
}: BorderBeamProps) {
  return (
    <span
      aria-hidden
      className={cn("border-beam", className)}
      style={
        {
          "--size": size,
          "--beam-round": `${size}px`,
          "--duration": `${duration}s`,
          "--delay": delay ? `-${delay}s` : "0s",
          "--border-width": borderWidth,
          "--color-from": colorFrom,
          "--color-to": colorTo,
        } as CSSProperties
      }
    />
  );
}
