"use client";

import { useEffect, useState } from "react";
import Joyride, { ACTIONS, EVENTS, STATUS, type CallBackProps } from "react-joyride";
import { AGENT_TOUR_STEPS } from "@/lib/agent-tour/steps";
import { bindAgentTourDrawerScrollSync } from "@/lib/agent-tour/drawer-scroll-sync";
import { AgentTourTooltip } from "@/components/Agent/tour/AgentTourTooltip";

/** Lead-form steps run inside the scrollable Ant Design drawer body. */
const DRAWER_STEP_INDEX_MIN = 3;
const DRAWER_STEP_INDEX_MAX = 5;

type AgentJoyrideTourProps = {
  run: boolean;
  stepIndex: number;
  remountKey: number;
  onCallback: (data: CallBackProps) => void;
};

export function AgentJoyrideTour({
  run,
  stepIndex,
  remountKey,
  onCallback,
}: AgentJoyrideTourProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDrawerStep =
    run && stepIndex >= DRAWER_STEP_INDEX_MIN && stepIndex <= DRAWER_STEP_INDEX_MAX;

  useEffect(() => {
    if (!isDrawerStep) return;
    return bindAgentTourDrawerScrollSync();
  }, [isDrawerStep, remountKey]);

  if (!mounted) {
    return null;
  }

  return (
    <Joyride
      key={`agent-tour-${remountKey}`}
      steps={AGENT_TOUR_STEPS}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress={false}
      showSkipButton
      disableOverlayClose
      disableCloseOnEsc={false}
      scrollToFirstStep
      scrollOffset={96}
      spotlightPadding={8}
      callback={onCallback}
      tooltipComponent={AgentTourTooltip}
      styles={{
        options: {
          zIndex: 10050,
          primaryColor: "#4f46e5",
          arrowColor: "#ffffff",
          backgroundColor: "#ffffff",
          textColor: "#1f2937",
        },
        overlay: {
          backgroundColor: "rgba(15, 23, 42, 0.58)",
        },
        spotlight: {
          borderRadius: 10,
        },
      }}
      floaterProps={{
        disableAnimation: false,
        styles: {
          floater: {
            zIndex: 10060,
          },
        },
      }}
    />
  );
}

export { ACTIONS, EVENTS, STATUS };
export type { CallBackProps };
