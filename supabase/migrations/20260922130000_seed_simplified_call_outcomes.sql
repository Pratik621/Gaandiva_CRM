-- Ensure every existing organization has the default call outcomes.
-- The original feature migration seeds these rows, but this is also safe to
-- run when that migration was applied before organizations were created.
INSERT INTO public.simplified_call_outcomes
  (organization_id, simplified_campaign_id, code, label, category, resulting_status, requires_callback_at, is_terminal, sort_order)
SELECT o.id, NULL, d.code, d.label, d.category, d.resulting_status, d.requires_callback_at, d.is_terminal, d.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('interested', 'Interested', 'contact_progress', 'in_progress', false, false, 10),
  ('contacted', 'Contacted', 'contact_progress', 'in_progress', false, false, 11),
  ('not_interested', 'Not Interested', 'contact_progress', 'closed', false, true, 20),
  ('follow_up', 'Follow Up', 'contact_progress', 'follow_up', true, false, 30),
  ('callback', 'Call Back', 'contact_progress', 'follow_up', true, false, 40),
  ('send_details', 'Send Details / WhatsApp', 'contact_progress', 'in_progress', false, false, 50),
  ('demo_scheduled', 'DEMO SCHEDULED', 'contact_progress', 'in_progress', true, false, 60),
  ('demo_completed', 'Demo Completed', 'contact_progress', 'in_progress', false, false, 70),
  ('demo_done', 'DEMO DONE', 'contact_progress', 'in_progress', false, false, 71),
  ('existing_client', 'Existing Client', 'contact_progress', 'closed', false, true, 80),
  ('not_answering', 'Not Answering', 'unreachable', 'follow_up', false, false, 90),
  ('follow_ups_not_answering', 'FOLLOW UPS, NOT ANSWERING', 'unreachable', 'follow_up', false, false, 91),
  ('voicemail', 'Voicemail', 'unreachable', 'follow_up', false, false, 92),
  ('call_dropped', 'Call Dropped', 'unreachable', 'follow_up', false, false, 93),
  ('number_not_reachable', 'Number Not Reachable', 'unreachable', 'follow_up', false, false, 94),
  ('number_busy', 'Number Busy', 'unreachable', 'follow_up', false, false, 100),
  ('phone_switched_off', 'Phone Switched Off', 'unreachable', 'follow_up', false, false, 110),
  ('incoming_not_available', 'Incoming Not Available', 'unreachable', 'follow_up', false, false, 120),
  ('unable_to_connect', 'Unable to Connect', 'unreachable', 'follow_up', false, false, 130),
  ('invalid_number', 'Invalid Number', 'invalid_closed', 'closed', false, true, 140),
  ('wrong_number', 'Wrong Number', 'invalid_closed', 'closed', false, true, 150),
  ('lost', 'LOST', 'invalid_closed', 'closed', false, true, 151),
  ('wrong_no', 'WRONG NO', 'invalid_closed', 'closed', false, true, 152),
  ('lost_wrong_no_not_interested', 'LOST, WRONG NO, NOT INTERESTED', 'invalid_closed', 'closed', false, true, 153),
  ('dead_contact', 'Dead Contact', 'invalid_closed', 'closed', false, true, 154),
  ('gatekeeper_declined', 'Gatekeeper Declined', 'invalid_closed', 'closed', false, true, 155),
  ('closed_won', 'Closed Won', 'contact_progress', 'closed', false, true, 156),
  ('closed_lost', 'Closed Lost', 'invalid_closed', 'closed', false, true, 157),
  ('follow_up_scheduled', 'Follow-up Scheduled', 'contact_progress', 'follow_up', true, false, 158),
  ('not_in_this_business', 'Not in This Business', 'invalid_closed', 'closed', false, true, 160),
  ('false_lead', 'False Lead', 'invalid_closed', 'closed', false, true, 170),
  ('dnd', 'DND', 'invalid_closed', 'closed', false, true, 180),
  ('not_relevant', 'Not Relevant', 'invalid_closed', 'closed', false, true, 190)
) AS d(code, label, category, resulting_status, requires_callback_at, is_terminal, sort_order)
ON CONFLICT DO NOTHING;