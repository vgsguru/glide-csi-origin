## Scope

Five connected features. I'll ship them in one migration + one batch of files.

## 1. Database migration

New tables (all with GRANTs + RLS):
- `question_bank` — recruiter-owned reusable questions: `text`, `tags[]`, `expected_signal`, `difficulty`, `owner_id`, `company_id`
- `interview_templates` — `name`, `company_id`, `owner_id`, `description`, `rubric jsonb`
- `interview_template_questions` — join table with `position`
- `notifications` — in-app bell items: `user_id`, `kind`, `title`, `body`, `link`, `read_at`
- `message_templates` — recruiter saved email templates: `name`, `subject`, `body_md`, `kind` (invite/reject/next_steps/custom), `owner_id`, `company_id`
- `application_messages` — audit of bulk emails sent: `application_id`, `sent_by`, `template_id`, `subject`, `channel`(email|inapp), `status`

New columns on `applications`:
- `expected_resume` removed (already on jobs as `ideal_profile`); add `resume_match jsonb` (parsed-vs-expected diff + similarity)
- `interview_mode text default 'async'` (`'async'|'live'`)

New columns on `jobs`:
- `interview_template_id uuid` nullable

New columns on `interviews`:
- `mode text default 'async'`, `answers jsonb default '[]'` (array of `{question_id, question, video_url, transcript, duration_s, started_at}`)

Seed three default `message_templates` (interview invite, rejection, next steps) — inserted lazily per recruiter on first visit via server fn, not in migration.

## 2. Server functions (`src/lib/`)

- `templates.functions.ts`
  - `createTemplate`, `updateTemplate`, `deleteTemplate`, `attachQuestion`, `detachQuestion`, `reorderQuestion`
  - `listMyTemplates`, `getTemplate`
  - `cloneTemplateToJob(jobId, templateId)` — copies questions+rubric into the job
- `questionbank.functions.ts`
  - `createQuestion`, `updateQuestion`, `deleteQuestion`, `listMyQuestions` (filter by tag/search)
- `messaging.functions.ts`
  - `listMessageTemplates`, `upsertMessageTemplate`, `deleteMessageTemplate`
  - `bulkNotify({ applicationIds, templateId, channel, customSubject?, customBody? })` — server-side render with `{{candidate_name}} {{job_title}} {{company_name}}` placeholders. For email channel: loop apps, render, POST to Resend connector gateway; insert `application_messages` rows and `notifications` rows for each applicant. Rate-limited via per-recruiter recent-send count (max 100/hour).
  - `markNotificationRead`, `markAllRead`, `listMyNotifications` (paginated)
- `asyncinterview.functions.ts`
  - `getOrCreateAsyncInterview(applicationId)` — returns `{interview_id, questions[]}` from job's template
  - `submitAnswer({interviewId, questionIndex, videoBase64, mime})` — uploads to `interview-videos` bucket, calls transcribe, stores into `interviews.answers`
  - `finalizeAsyncInterview(interviewId)` — concatenates transcripts, runs existing rubric-scoring AI with evidence, updates `applications.score`/`ai_summary`/`score_evidence`
- `scoring.functions.ts`
  - `computeResumeMatch(applicationId)` — embeds applicant resume + job `ideal_profile`, computes cosine; LLM diff produces `{ matched_skills[], gaps[], extras[], overall_pct }`; stored in `applications.resume_match`. Called from finalize + on resume upload.

## 3. Routes

- `src/routes/_authenticated/recruiter_.question-bank.tsx` — list/search/create/edit questions (chip tags)
- `src/routes/_authenticated/recruiter_.templates.tsx` — list of templates
- `src/routes/_authenticated/recruiter_.templates.$id.tsx` — edit template: name, description, rubric editor, drag-add questions from bank or inline-create
- `src/routes/_authenticated/recruiter_.message-templates.tsx` — recruiter email templates editor with live preview
- `src/routes/_authenticated/recruiter_.jobs.$jobId.compare.tsx` — pick up to 4 applicants → side-by-side: avatar, name, score, rubric heatmap (criterion×candidate cells colored by score), strengths/concerns, resume link, "open application" button
- `src/routes/_authenticated/me.notifications.tsx` — applicant+recruiter notifications list
- `src/routes/_authenticated/apply.$jobId.interview.tsx` — async interview flow:
  1. List of questions (numbered, with hints)
  2. Per-question: countdown, MediaRecorder webcam, record/re-record/upload, transcribe preview
  3. Submit-all → calls `finalizeAsyncInterview`
- `src/routes/_authenticated/me.applications.$id.scoring.tsx` — applicant breakdown: overall score, rubric heatmap, resume-vs-expected diff (matched/gap/extra chips), ranking position (`my percentile`)
- `src/routes/_authenticated/recruiter_.applications.$id.scoring.tsx` — recruiter version: same data plus side-by-side resume diff with the role's `ideal_profile`, raw rubric evidence quotes

## 4. UI changes to existing pages

- `recruiter_.jobs.$jobId.pipeline.tsx` — add to bulk bar:
  - "Email selected" → opens dialog: choose template / customize / preview → confirm → bulkNotify(channel=email)
  - "Notify in-app" → bulkNotify(channel=inapp)
  - "Compare selected" → navigates to compare page with `?ids=` (cap at 4, toast otherwise)
- `recruiter_.jobs.new.tsx` and `recruiter_.jobs.$jobId.edit.tsx` — add "Interview template" dropdown + "Mode: live / async" radio
- `site-nav.tsx` — add bell with unread count (subscribe via realtime), "Question bank" + "Templates" links for recruiters, "Notifications" link for everyone
- `apply.$jobId.tsx` — branch: live → existing flow; async → navigate to new async interview page
- `me.applications.tsx` — link to scoring page for each
- `recruiter_.applications.$applicationId.tsx` — link to scoring page; "Send message" button using message templates

## 5. Email (Resend connector)

Use existing Resend connector. `bulkNotify` POSTs to `https://connector-gateway.lovable.dev/resend/emails` per recipient with `from = 'Lumen <onboarding@resend.dev>'` (note user this requires a verified domain later). Rendered HTML via small in-repo template wrapper (no React Email — keep dependencies tight).

## 6. Realtime

Subscribe to `notifications` filtered by `user_id=eq.<me>` in `site-nav` for live unread count + a small toast on new arrivals.

## 7. Acceptance

- Recruiter can: build a question bank, save it as a template, attach to a job, create a job that uses async interviews.
- Applicant applies → records video per question → AI auto-transcribes, scores, computes resume diff.
- Recruiter pipeline → multi-select → "Email selected" with template → recipients get email + in-app notification.
- Recruiter pipeline → multi-select up to 4 → "Compare" → heatmap.
- Both sides have a scoring breakdown page with rubric heatmap + resume diff + percentile.

## Out of scope (call out, don't build)

- Brand-domain email verification (still using `onboarding@resend.dev`)
- WebRTC live signaling between recruiter+candidate (the existing live AI interview stays as-is)
- Push notifications (only in-app + email)

Approving this will run the migration and ship all the files in one go. It's a large change — estimated ~12 new files, ~5 edits, 1 migration.