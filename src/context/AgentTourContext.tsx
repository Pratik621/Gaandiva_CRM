"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { message } from "antd";
import { useAuth } from "@/context/AuthContext";
import {
  AGENT_TOUR_CLOSE_LEAD_DRAWER_EVENT,
  AGENT_TOUR_LEAD_DRAWER_CLOSED_EVENT,
  AGENT_TOUR_OPEN_LEAD_DRAWER_EVENT,
  AGENT_TOUR_TARGETS,
} from "@/lib/agent-tour/constants";
import { cleanupAntDrawerBodyLock, waitForDrawerClosed } from "@/lib/agent-tour/cleanup-drawer-layout";
import { scrollAgentLeadDrawerToTop } from "@/lib/agent-tour/drawer-scroll-sync";
import {
  getDefaultAgentTourPrefs,
  hydrateAgentTourPreferences,
  persistAgentTourPreferences,
  type AgentTourPrefsPatch,
} from "@/lib/agent-tour/persistence";
import { setAgentTourPreferences } from "@/lib/agent-tour/storage";
import { resolveTourCampaignId } from "@/lib/agent-tour/resolve-tour-campaign";
import { waitForTourTarget } from "@/lib/agent-tour/wait-for-target";
import {
  AgentJoyrideTour,
  ACTIONS,
  EVENTS,
  STATUS,
  type CallBackProps,
} from "@/components/Agent/tour/AgentJoyrideTour";
import { AgentTourWelcomeModal } from "@/components/Agent/tour/AgentTourWelcomeModal";
import { AgentTourCompletionModal } from "@/components/Agent/tour/AgentTourCompletionModal";
import "@/components/Agent/tour/agent-tour.css";

type AgentTourContextValue = {
  startTour: () => void;
  restartTour: () => void;
};

const AgentTourContext = createContext<AgentTourContextValue | null>(null);

export function useAgentTour(): AgentTourContextValue {
  const ctx = useContext(AgentTourContext);
  if (!ctx) {
    throw new Error("useAgentTour must be used within AgentTourProvider");
  }
  return ctx;
}

export function useAgentTourOptional(): AgentTourContextValue | null {
  return useContext(AgentTourContext);
}

type AgentTourProviderProps = {
  children: React.ReactNode;
};

export function AgentTourProvider({ children }: AgentTourProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isInitialized } = useAuth();

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [dontShowAgainDraft, setDontShowAgainDraft] = useState(false);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [tourRemountKey, setTourRemountKey] = useState(0);
  const [tourCampaignId, setTourCampaignId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(getDefaultAgentTourPrefs);
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  const navigatingRef = useRef(false);
  const welcomeCheckedRef = useRef(false);
  const runRef = useRef(false);
  const stepIndexRef = useRef(0);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  const bumpTourRemount = useCallback(() => {
    setTourRemountKey((k) => k + 1);
  }, []);

  const resumeTour = useCallback(
    (nextIndex: number, delayMs = 280) => {
      setStepIndex(nextIndex);
      bumpTourRemount();
      window.setTimeout(() => {
        cleanupAntDrawerBodyLock();
        setRun(true);
      }, delayMs);
    },
    [bumpTourRemount]
  );

  useEffect(() => {
    if (!user?.id) {
      setPrefs(getDefaultAgentTourPrefs());
      setPrefsHydrated(false);
      welcomeCheckedRef.current = false;
      return;
    }

    let cancelled = false;
    setPrefsHydrated(false);
    welcomeCheckedRef.current = false;

    void hydrateAgentTourPreferences(user.id).then((loaded) => {
      if (cancelled) return;
      setPrefs(loaded);
      setPrefsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!isInitialized || !user?.id || !prefsHydrated) return;
    if (welcomeCheckedRef.current) return;
    if (pathname !== "/agent/dashboard") return;
    if (prefs.tour_completed || prefs.tour_dismissed) return;

    welcomeCheckedRef.current = true;
    setWelcomeOpen(true);
  }, [
    isInitialized,
    pathname,
    prefs.tour_completed,
    prefs.tour_dismissed,
    prefsHydrated,
    user?.id,
  ]);

  const persistPrefs = useCallback(
    (patch: AgentTourPrefsPatch) => {
      if (!user?.id) return;
      setPrefs(setAgentTourPreferences(user.id, patch));
      void persistAgentTourPreferences(user.id, patch);
    },
    [user?.id]
  );

  const dispatchTourEvent = useCallback((name: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(name));
  }, []);

  const prepareStep = useCallback(
    async (index: number): Promise<boolean> => {
      if (index === 1) {
        if (pathname !== "/agent/campaigns") {
          router.push("/agent/campaigns");
        }
        const el = await waitForTourTarget(AGENT_TOUR_TARGETS.campaignName);
        if (!el) {
          message.warning("Campaign list is not ready yet. Try again from Help → Product Tour.");
          return false;
        }
        return true;
      }

      if (index === 2) {
        let campaignId = tourCampaignId;
        if (!campaignId) {
          campaignId = await resolveTourCampaignId();
          if (!campaignId) {
            message.warning("No assigned campaigns found. Ask your Team Leader to assign you first.");
            return false;
          }
          setTourCampaignId(campaignId);
        }
        const targetPath = `/agent/campaigns/${campaignId}`;
        if (pathname !== targetPath) {
          router.push(targetPath);
        }
        const el = await waitForTourTarget(AGENT_TOUR_TARGETS.addLead);
        if (!el) {
          message.warning("Campaign page is not ready yet.");
          return false;
        }
        return true;
      }

      if (index === 3) {
        dispatchTourEvent(AGENT_TOUR_OPEN_LEAD_DRAWER_EVENT);
        scrollAgentLeadDrawerToTop();
        const el = await waitForTourTarget(AGENT_TOUR_TARGETS.leadRequired);
        if (!el) {
          message.warning("Lead form is not ready yet.");
          return false;
        }
        scrollAgentLeadDrawerToTop();
        el.scrollIntoView({ block: "nearest", behavior: "auto" });
        return true;
      }

      if (index === 4 || index === 5) {
        dispatchTourEvent(AGENT_TOUR_OPEN_LEAD_DRAWER_EVENT);
        const target =
          index === 4 ? AGENT_TOUR_TARGETS.lhoPdf : AGENT_TOUR_TARGETS.saveLead;
        const el = await waitForTourTarget(target);
        if (!el) {
          message.warning("Lead form actions are not visible yet.");
          return false;
        }
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      }

      if (index === 6) {
        dispatchTourEvent(AGENT_TOUR_CLOSE_LEAD_DRAWER_EVENT);
        await waitForDrawerClosed();
        cleanupAntDrawerBodyLock();
        const el = await waitForTourTarget(AGENT_TOUR_TARGETS.bulkUpload);
        if (!el) {
          message.warning("Bulk upload controls are not visible yet.");
          return false;
        }
        el.scrollIntoView({ block: "center", behavior: "auto" });
        return true;
      }

      return true;
    },
    [dispatchTourEvent, pathname, router, tourCampaignId]
  );

  useEffect(() => {
    const onDrawerClosed = () => {
      cleanupAntDrawerBodyLock();
      if (!runRef.current) return;
      const currentStep = stepIndexRef.current;
      if (currentStep < 3 || currentStep > 5) return;

      setRun(false);
      void (async () => {
        await waitForDrawerClosed();
        const el = await waitForTourTarget(AGENT_TOUR_TARGETS.bulkUpload);
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: "auto" });
        resumeTour(6, 320);
      })();
    };

    window.addEventListener(AGENT_TOUR_LEAD_DRAWER_CLOSED_EVENT, onDrawerClosed);
    return () => {
      window.removeEventListener(AGENT_TOUR_LEAD_DRAWER_CLOSED_EVENT, onDrawerClosed);
    };
  }, [resumeTour]);

  const beginTour = useCallback(async () => {
    setCompletionOpen(false);
    setWelcomeOpen(false);
    setStepIndex(0);
    setRun(false);

    if (pathname !== "/agent/dashboard" && pathname !== "/agent/campaigns") {
      router.push("/agent/dashboard");
      await waitForTourTarget(AGENT_TOUR_TARGETS.sidebarCampaigns);
    }

    const ready = await waitForTourTarget(AGENT_TOUR_TARGETS.sidebarCampaigns);
    if (!ready) {
      message.warning("Tour could not start. Refresh the page and try again.");
      return;
    }

    setStepIndex(0);
    bumpTourRemount();
    setRun(true);
  }, [bumpTourRemount, pathname, router]);

  const finishTour = useCallback(() => {
    setRun(false);
    setCompletionOpen(true);
    persistPrefs({ tour_completed: true });
  }, [persistPrefs]);

  const handleJoyrideCallback = useCallback(
    async (data: CallBackProps) => {
      const { action, index, status, type } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setRun(false);
        if (status === STATUS.FINISHED) {
          finishTour();
        }
        return;
      }

      if (type !== EVENTS.STEP_AFTER || navigatingRef.current) return;

      if (action === ACTIONS.NEXT) {
        const nextIndex = index + 1;
        if (nextIndex >= 7) {
          setRun(false);
          finishTour();
          return;
        }

        navigatingRef.current = true;
        setRun(false);
        const ok = await prepareStep(nextIndex);
        navigatingRef.current = false;
        if (!ok) return;

        const delayMs = nextIndex === 6 ? 380 : 220;
        resumeTour(nextIndex, delayMs);
        return;
      }

      if (action === ACTIONS.PREV && index > 0) {
        const prevIndex = index - 1;
        navigatingRef.current = true;
        setRun(false);
        const ok = await prepareStep(prevIndex);
        navigatingRef.current = false;
        if (!ok) {
          setRun(true);
          return;
        }
        resumeTour(prevIndex, 220);
      }
    },
    [finishTour, prepareStep, resumeTour]
  );

  const startTour = useCallback(() => {
    void beginTour();
  }, [beginTour]);

  const restartTour = useCallback(() => {
    setCompletionOpen(false);
    setTourCampaignId(null);
    void beginTour();
  }, [beginTour]);

  const handleWelcomeStart = useCallback(() => {
    setWelcomeOpen(false);
    if (dontShowAgainDraft) {
      persistPrefs({ tour_dismissed: true });
    }
    void beginTour();
  }, [beginTour, dontShowAgainDraft, persistPrefs]);

  const handleWelcomeSkip = useCallback(() => {
    setWelcomeOpen(false);
    if (dontShowAgainDraft) {
      persistPrefs({ tour_dismissed: true });
    }
  }, [dontShowAgainDraft, persistPrefs]);

  const contextValue = useMemo(
    () => ({
      startTour,
      restartTour,
    }),
    [restartTour, startTour]
  );

  return (
    <AgentTourContext.Provider value={contextValue}>
      {children}
      <AgentTourWelcomeModal
        open={welcomeOpen}
        dontShowAgain={dontShowAgainDraft}
        onDontShowAgainChange={setDontShowAgainDraft}
        onStart={handleWelcomeStart}
        onSkip={handleWelcomeSkip}
      />
      <AgentJoyrideTour
        run={run}
        stepIndex={stepIndex}
        remountKey={tourRemountKey}
        onCallback={handleJoyrideCallback}
      />
      <AgentTourCompletionModal
        open={completionOpen}
        tourCampaignId={tourCampaignId}
        onStartWorking={() => setCompletionOpen(false)}
        onRestart={restartTour}
      />
    </AgentTourContext.Provider>
  );
}
