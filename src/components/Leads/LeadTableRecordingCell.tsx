"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spin, Tooltip, message } from "antd";
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { VoiceRecording } from "@/lib/voice-recordings";
import { MAX_VOICE_RECORDINGS_PER_LEAD } from "@/lib/voice-recordings";
import {
  fetchLeadRecordingsBatched,
  getCachedLeadRecordings,
  invalidateLeadRecordingsCache,
  setCachedLeadRecordings,
} from "@/lib/voice-recordings-client";

type LeadTableRecordingCellProps = {
  leadId: string;
  leadEmail?: string | null;
  initialRecordings?: VoiceRecording[];
  onRecordingsChange?: () => void;
};

export function LeadTableRecordingCell({
  leadId,
  leadEmail,
  initialRecordings,
  onRecordingsChange,
}: LeadTableRecordingCellProps) {
  const playTooltip = leadEmail?.trim() || "No email";
  const cachedOnMount = getCachedLeadRecordings(leadId);
  const [recordings, setRecordings] = useState<VoiceRecording[]>(
    initialRecordings ?? cachedOnMount ?? []
  );
  const [loading, setLoading] = useState(
    initialRecordings === undefined && cachedOnMount === null
  );
  const [uploading, setUploading] = useState(false);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fetchStartedRef = useRef(false);

  const refreshRecordings = useCallback(async () => {
    invalidateLeadRecordingsCache(leadId);
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/leads/${leadId}/voice-lock`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(json?.error || "Failed to load recordings");
        return;
      }
      const next = (json.recordings ?? []) as VoiceRecording[];
      setCachedLeadRecordings(leadId, next);
      setRecordings(next);
    } catch {
      message.error("Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (initialRecordings !== undefined) {
      setRecordings(initialRecordings);
      setCachedLeadRecordings(leadId, initialRecordings);
      setLoading(false);
    }
  }, [initialRecordings, leadId]);

  useEffect(() => {
    if (initialRecordings !== undefined) return;

    const cached = getCachedLeadRecordings(leadId);
    if (cached !== null) {
      setRecordings(cached);
      setLoading(false);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const loadRecordings = () => {
      if (fetchStartedRef.current || cancelled) return;
      fetchStartedRef.current = true;
      setLoading(true);
      fetchLeadRecordingsBatched(leadId)
        .then((recs) => {
          if (!cancelled) setRecordings(recs);
        })
        .catch(() => {
          if (!cancelled) setRecordings([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    if (typeof IntersectionObserver === "undefined") {
      loadRecordings();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          loadRecordings();
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [leadId, initialRecordings]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingPath(null);
  };

  const togglePlay = (rec: VoiceRecording) => {
    if (!rec.url) {
      message.warning("Playback unavailable for this file");
      return;
    }

    if (playingPath === rec.path) {
      stopPlayback();
      return;
    }

    stopPlayback();
    const audio = new Audio(rec.url);
    audioRef.current = audio;
    audio.onended = () => setPlayingPath(null);
    audio.onerror = () => {
      message.error("Could not play recording");
      setPlayingPath(null);
    };
    void audio.play().then(() => setPlayingPath(rec.path)).catch(() => {
      message.error("Could not play recording");
      setPlayingPath(null);
    });
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    if (recordings.length >= MAX_VOICE_RECORDINGS_PER_LEAD) {
      message.warning(`Maximum ${MAX_VOICE_RECORDINGS_PER_LEAD} recordings per lead`);
      return;
    }

    setUploading(true);
    try {
      const presignRes = await fetch(`/api/agent/leads/${leadId}/voice-lock/presign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "audio/mpeg",
        }),
      });
      const presignJson = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) {
        message.error(presignJson?.error || "Failed to prepare upload");
        return;
      }

      const { signedUrl, path } = presignJson as { signedUrl: string; path?: string };
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "audio/mpeg" },
        body: file,
      });
      if (!uploadRes.ok) {
        message.error("Upload failed");
        return;
      }

      if (path) {
        const registerRes = await fetch(`/api/agent/leads/${leadId}/voice-lock/register`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path,
            fileName: file.name,
            mimeType: file.type || "audio/mpeg",
            fileSize: file.size,
          }),
        });
        if (!registerRes.ok) {
          const regJson = await registerRes.json().catch(() => ({}));
          message.warning(
            (regJson as { error?: string })?.error ||
              "Uploaded but catalog sync failed. Refresh if recording is missing."
          );
        }
      }

      message.success("Recording uploaded");
      await refreshRecordings();
      onRecordingsChange?.();
    } catch {
      message.error("Failed to upload recording");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const canUpload = recordings.length < MAX_VOICE_RECORDINGS_PER_LEAD;

  const iconBtnStyle = { width: 24, height: 24, padding: 0, minWidth: 24 } as const;

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        maxWidth: "100%",
        minHeight: 24,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          void handleUpload(file);
        }}
      />

      {loading && recordings.length === 0 ? (
        <Spin size="small" />
      ) : recordings.length === 0 ? (
        <Tooltip title="Upload recording">
          <Button
            type="dashed"
            size="small"
            icon={<UploadOutlined />}
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={iconBtnStyle}
            aria-label="Upload recording"
          />
        </Tooltip>
      ) : (
        <>
          {recordings.map((rec) => {
            const isPlaying = playingPath === rec.path;
            return (
              <Tooltip key={rec.path} title={playTooltip}>
                <Button
                  type="text"
                  size="small"
                  icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={() => togglePlay(rec)}
                  style={{
                    ...iconBtnStyle,
                    color: isPlaying ? "#4f46e5" : undefined,
                  }}
                  aria-label={isPlaying ? `Pause ${playTooltip}` : `Play ${playTooltip}`}
                />
              </Tooltip>
            );
          })}
          {canUpload && (
            <Tooltip title="Add recording">
              <Button
                type="dashed"
                size="small"
                icon={<UploadOutlined />}
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
                style={iconBtnStyle}
                aria-label="Upload recording"
              />
            </Tooltip>
          )}
        </>
      )}
    </div>
  );
}
