-- Private bucket for lead file uploads (used by /api/sales/leads/[id]/attachments).
INSERT INTO storage.buckets (id, name, public)
VALUES ('sales-lead-attachments', 'sales-lead-attachments', false)
ON CONFLICT (id) DO NOTHING;
