"use client";

import React from "react";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

type LoginBeamInputProps = {
  children: React.ReactNode;
  className?: string;
  beamDelay?: number;
};

/** Wraps login inputs with animated border beam. */
export default function LoginBeamInput({
  children,
  className,
  beamDelay = 0,
}: LoginBeamInputProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl",
        className
      )}
    >
      <BorderBeam
        size={72}
        duration={7}
        delay={beamDelay}
        borderWidth={1.5}
        colorFrom="#cbd5e1"
        colorTo="#475569"
      />
      {children}
    </div>
  );
}
