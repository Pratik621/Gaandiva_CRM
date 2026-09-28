"use client";

import { useEffect, useState } from "react";
import { Button, Upload, Typography, message } from "antd";
import { DeleteOutlined, LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { MAX_CLIENT_LOGOS } from "@/lib/admin/client-logos";

type ClientLogoUploadProps = {
  clientId: string | null | undefined;
  disabled?: boolean;
  onLogoChange?: (urls: string[]) => void;
};

export default function ClientLogoUpload({
  clientId,
  disabled,
  onLogoChange,
}: ClientLogoUploadProps) {
  const [logoUrls, setLogoUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!clientId) {
      setLogoUrls([]);
      onLogoChange?.([]);
      return;
    }

    let cancelled = false;
    setFetching(true);
    fetch(`/api/admin/clients/${clientId}/logo`, { credentials: "include" })
      .then((res) => res.json())
      .then((data: { logo_urls?: string[] | null; logo_url?: string | null; error?: string }) => {
        if (cancelled) return;
        const urls =
          Array.isArray(data.logo_urls) && data.logo_urls.length > 0
            ? data.logo_urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
            : data.logo_url
              ? [data.logo_url]
              : [];
        setLogoUrls(urls);
        onLogoChange?.(urls);
      })
      .catch(() => {
        if (!cancelled) setLogoUrls([]);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when client changes
  }, [clientId]);

  const canAddMore = logoUrls.length < MAX_CLIENT_LOGOS;

  const uploadProps: UploadProps = {
    name: "file",
    listType: "picture-card",
    showUploadList: false,
    disabled: disabled || !clientId || loading || !canAddMore,
    accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
    beforeUpload: (file) => {
      if (!clientId) {
        message.warning("Select a client first");
        return Upload.LIST_IGNORE;
      }
      if (!canAddMore) {
        message.warning(`Maximum ${MAX_CLIENT_LOGOS} logos allowed`);
        return Upload.LIST_IGNORE;
      }
      if (!file.type.startsWith("image/")) {
        message.error("Please upload an image file");
        return Upload.LIST_IGNORE;
      }
      if (file.size > 2 * 1024 * 1024) {
        message.error("Logo must be 2MB or smaller");
        return Upload.LIST_IGNORE;
      }

      void (async () => {
        setLoading(true);
        try {
          const body = new FormData();
          body.append("file", file);
          const res = await fetch(`/api/admin/clients/${clientId}/logo`, {
            method: "POST",
            body,
            credentials: "include",
          });
          const json = (await res.json()) as {
            logo_urls?: string[];
            logo_url?: string;
            error?: string;
          };
          if (!res.ok) throw new Error(json.error || "Upload failed");
          const urls =
            Array.isArray(json.logo_urls) && json.logo_urls.length > 0
              ? json.logo_urls
              : json.logo_url
                ? [json.logo_url]
                : [];
          setLogoUrls(urls);
          onLogoChange?.(urls);
          message.success("Client logo uploaded");
        } catch (err) {
          message.error(err instanceof Error ? err.message : "Failed to upload logo");
        } finally {
          setLoading(false);
        }
      })();

      return false;
    },
  };

  const handleRemove = async (index: number) => {
    if (!clientId || disabled) return;
    setRemovingIndex(index);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/logo`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const json = (await res.json()) as {
        logo_urls?: string[];
        logo_url?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to remove logo");
      const urls = Array.isArray(json.logo_urls) ? json.logo_urls : [];
      setLogoUrls(urls);
      onLogoChange?.(urls);
      message.success("Logo removed");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setRemovingIndex(null);
    }
  };

  if (!clientId) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
        Client logos
      </Typography.Text>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 13 }}>
        Shown side-by-side in the user&apos;s dashboard header (left of notifications). Up to{" "}
        {MAX_CLIENT_LOGOS} logos.
      </Typography.Text>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        {logoUrls.map((url, index) => (
          <div
            key={`${url}-${index}`}
            style={{
              width: 104,
              height: 104,
              border: "1px solid #f0f0f0",
              borderRadius: 8,
              background: "#fafafa",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
            }}
          >
            <img
              src={url}
              alt={`Client logo ${index + 1}`}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={disabled || removingIndex === index}
              loading={removingIndex === index}
              onClick={() => void handleRemove(index)}
              aria-label={`Remove logo ${index + 1}`}
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                background: "rgba(255,255,255,0.9)",
              }}
            />
          </div>
        ))}

        {canAddMore && (
          <Upload {...uploadProps}>
            <div>
              {loading || fetching ? <LoadingOutlined /> : <PlusOutlined />}
              <div style={{ marginTop: 8 }}>
                {fetching ? "Loading…" : logoUrls.length === 0 ? "Upload logo" : "Add logo"}
              </div>
            </div>
          </Upload>
        )}
      </div>
    </div>
  );
}
