const CLIENT_VIEWER_CAMPAIGN_ALERT_TO = [
  "developer@b2bindemand.com",
  "saurabh@b2bindemand.com",
  "shubham@b2bindemand.com",
  "sanket@b2bindemand.com",
] as const;

const RESEND_API_URL = "https://api.resend.com/emails";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatCampaignAlertTimestamp(
  value: string | null | undefined
): string {
  if (!value) {
    return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  }
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://app.gaandiva.com";
}

function plainTextPreview(content: string, maxLen = 240): string {
  const text = content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "(No text — attachment or lead reference only)";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

async function sendResendAlertEmail(args: {
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CAMPAIGN_ALERT_EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn(
      "[campaign-alert-email] Missing RESEND_API_KEY or CAMPAIGN_ALERT_EMAIL_FROM; skipping email."
    );
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [...CLIENT_VIEWER_CAMPAIGN_ALERT_TO],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[campaign-alert-email] Failed to send email", {
      status: res.status,
      body,
    });
  }
}

export async function sendClientViewerCampaignAlertEmail(args: {
  campaignName: string;
  campaignId: string;
  clientName: string;
  createdAt: string;
  creatorName: string;
  creatorEmail: string;
}): Promise<void> {
  try {
    const safeCampaignName = escapeHtml(args.campaignName);
    const safeCampaignId = escapeHtml(args.campaignId);
    const safeClientName = escapeHtml(args.clientName);
    const safeCreatedAt = escapeHtml(args.createdAt);
    const safeCreatorName = escapeHtml(args.creatorName);
    const safeCreatorEmail = escapeHtml(args.creatorEmail);

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45;color:#111827;">
        <p style="margin:0 0 10px 0;"><strong>New campaign created by Client Viewer</strong></p>
        <table style="border-collapse:collapse;">
          <tr><td style="padding:2px 10px 2px 0;"><strong>Campaign</strong></td><td style="padding:2px 0;">${safeCampaignName}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;"><strong>Campaign ID</strong></td><td style="padding:2px 0;">${safeCampaignId}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;"><strong>Client</strong></td><td style="padding:2px 0;">${safeClientName}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;"><strong>Created At</strong></td><td style="padding:2px 0;">${safeCreatedAt}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;"><strong>Created By</strong></td><td style="padding:2px 0;">${safeCreatorName} (${safeCreatorEmail})</td></tr>
        </table>
      </div>
    `;

    const text =
      `New campaign created by Client Viewer\n` +
      `Campaign: ${args.campaignName}\n` +
      `Campaign ID: ${args.campaignId}\n` +
      `Client: ${args.clientName}\n` +
      `Created At: ${args.createdAt}\n` +
      `Created By: ${args.creatorName} (${args.creatorEmail})`;

    await sendResendAlertEmail({
      subject: "Client Viewer created a campaign",
      html,
      text,
    });
  } catch (error) {
    console.error("[campaign-alert-email] Unexpected error while sending email", error);
  }
}

export async function sendClientViewerFeedPostAlertEmail(args: {
  campaignUuid: string;
  campaignName: string;
  campaignCode: string;
  clientName: string;
  postedAt: string;
  posterName: string;
  posterEmail: string;
  postPreview: string;
}): Promise<void> {
  try {
    const feedUrl = `${getAppBaseUrl()}/dashboard/campaigns/${args.campaignUuid}?tab=feed`;
    const safeCampaignName = escapeHtml(args.campaignName);
    const safeCampaignCode = escapeHtml(args.campaignCode);
    const safeClientName = escapeHtml(args.clientName);
    const safePostedAt = escapeHtml(args.postedAt);
    const safePosterName = escapeHtml(args.posterName);
    const safePosterEmail = escapeHtml(args.posterEmail);
    const safePreview = escapeHtml(args.postPreview);
    const safeFeedUrl = escapeHtml(feedUrl);

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.45;color:#111827;">
        <p style="margin:0 0 10px 0;"><strong>New post in Campaign Workspace by Client Viewer</strong></p>
        <table style="border-collapse:collapse;">
          <tr><td style="padding:2px 10px 2px 0;"><strong>Campaign</strong></td><td style="padding:2px 0;">${safeCampaignName}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;"><strong>Campaign ID</strong></td><td style="padding:2px 0;">${safeCampaignCode}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;"><strong>Client</strong></td><td style="padding:2px 0;">${safeClientName}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;"><strong>Posted At</strong></td><td style="padding:2px 0;">${safePostedAt}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;"><strong>Posted By</strong></td><td style="padding:2px 0;">${safePosterName} (${safePosterEmail})</td></tr>
          <tr><td style="padding:2px 10px 2px 0;vertical-align:top;"><strong>Message</strong></td><td style="padding:2px 0;">${safePreview}</td></tr>
        </table>
        <p style="margin:16px 0 0 0;">
          <a href="${safeFeedUrl}" style="color:#4f46e5;">Open Campaign Workspace</a>
        </p>
      </div>
    `;

    const text =
      `New post in Campaign Workspace by Client Viewer\n` +
      `Campaign: ${args.campaignName}\n` +
      `Campaign ID: ${args.campaignCode}\n` +
      `Client: ${args.clientName}\n` +
      `Posted At: ${args.postedAt}\n` +
      `Posted By: ${args.posterName} (${args.posterEmail})\n` +
      `Message: ${args.postPreview}\n` +
      `Open feed: ${feedUrl}`;

    await sendResendAlertEmail({
      subject: `Client Viewer posted in Campaign Workspace — ${args.campaignName}`,
      html,
      text,
    });
  } catch (error) {
    console.error("[feed-alert-email] Unexpected error while sending email", error);
  }
}

export function buildFeedPostPreview(content: string): string {
  return plainTextPreview(content);
}
