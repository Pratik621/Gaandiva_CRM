import type { TooltipRenderProps } from "react-joyride";
import { AGENT_TOUR_STEP_COUNT } from "@/lib/agent-tour/constants";
import "./agent-tour.css";

export function AgentTourTooltip({
  backProps,
  closeProps,
  continuous,
  index,
  isLastStep,
  primaryProps,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <div {...tooltipProps} className="agent-tour-tooltip">
      <div className="agent-tour-tooltip__progress">
        Step {index + 1} of {AGENT_TOUR_STEP_COUNT}
      </div>
      {step.title ? <h4 className="agent-tour-tooltip__title">{step.title}</h4> : null}
      <div className="agent-tour-tooltip__content">{step.content}</div>
      <div className="agent-tour-tooltip__actions">
        {index > 0 ? (
          <button type="button" className="agent-tour-tooltip__btn agent-tour-tooltip__btn--ghost" {...backProps}>
            Back
          </button>
        ) : (
          <span />
        )}
        <div className="agent-tour-tooltip__actions-right">
          <button type="button" className="agent-tour-tooltip__btn agent-tour-tooltip__btn--ghost" {...skipProps}>
            Skip tour
          </button>
          {continuous ? (
            <button type="button" className="agent-tour-tooltip__btn agent-tour-tooltip__btn--primary" {...primaryProps}>
              {isLastStep ? "Finish" : "Next"}
            </button>
          ) : (
            <button type="button" className="agent-tour-tooltip__btn agent-tour-tooltip__btn--primary" {...closeProps}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
