import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Single-row JSON documents whose shape is owned by @jobhunter/core (zod-validated). */
export const profile = sqliteTable('profile', {
  id: integer('id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  data: text('data', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(), // arbeitnow | remoteok | remotive | greenhouse | lever | manual
  name: text('name').notNull(),
  config: text('config', { mode: 'json' }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastScanAt: text('last_scan_at'),
  lastStatus: text('last_status'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
});

export const jobs = sqliteTable(
  'jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: integer('source_id'),
    sourceKind: text('source_kind').notNull(),
    externalId: text('external_id'),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    dedupeHash: text('dedupe_hash').notNull(),
    title: text('title').notNull(),
    company: text('company').notNull(),
    companyUrl: text('company_url'),
    location: text('location'),
    remoteMode: text('remote_mode').notNull().default('unknown'), // remote | hybrid | onsite | unknown
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    salaryCurrency: text('salary_currency'),
    salaryRaw: text('salary_raw'),
    description: text('description').notNull().default(''),
    lang: text('lang'),
    postedAt: text('posted_at'),
    discoveredAt: text('discovered_at').notNull(),
    // found | skipped_prefilter | analyzed | qualified | archived
    status: text('status').notNull().default('found'),
    skipReason: text('skip_reason'),
    raw: text('raw', { mode: 'json' }),
  },
  (t) => [
    uniqueIndex('jobs_canonical_url_uq').on(t.canonicalUrl),
    uniqueIndex('jobs_dedupe_hash_uq').on(t.dedupeHash),
    index('jobs_status_idx').on(t.status),
    index('jobs_discovered_idx').on(t.discoveredAt),
  ],
);

export const jobAnalyses = sqliteTable(
  'job_analyses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id').notNull(),
    score: integer('score').notNull(),
    verdict: text('verdict').notNull(),
    data: text('data', { mode: 'json' }).notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('job_analyses_job_idx').on(t.jobId)],
);

export const applications = sqliteTable(
  'applications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id').notNull(),
    // queued | preparing | ready_for_review | approved | applying | needs_input |
    // needs_action | submitted | response | interview | offer | rejected |
    // withdrawn | discarded | failed
    status: text('status').notNull().default('queued'),
    method: text('method'), // auto_greenhouse | auto_lever | manual
    autonomyAtCreation: text('autonomy_at_creation').notNull(),
    intent: text('intent').notNull(), // auto_apply | review
    cvDocumentId: integer('cv_document_id'),
    coverLetterDocumentId: integer('cover_letter_document_id'),
    answers: text('answers', { mode: 'json' }),
    decision: text('decision', { mode: 'json' }),
    submittedAt: text('submitted_at'),
    failureReason: text('failure_reason'),
    artifactsDir: text('artifacts_dir'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('applications_job_uq').on(t.jobId),
    index('applications_status_idx').on(t.status),
  ],
);

export const applicationEvents = sqliteTable(
  'application_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    applicationId: integer('application_id').notNull(),
    type: text('type').notNull(),
    message: text('message').notNull(),
    data: text('data', { mode: 'json' }),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('application_events_app_idx').on(t.applicationId)],
);

export const documents = sqliteTable(
  'documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(), // cv_master | cv_tailored | cover_letter
    jobId: integer('job_id'),
    applicationId: integer('application_id'),
    title: text('title').notNull(),
    contentMd: text('content_md').notNull(),
    pdfPath: text('pdf_path'),
    meta: text('meta', { mode: 'json' }),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('documents_kind_idx').on(t.kind),
    index('documents_app_idx').on(t.applicationId),
  ],
);

export const pendingQuestions = sqliteTable(
  'pending_questions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    applicationId: integer('application_id').notNull(),
    question: text('question').notNull(),
    fieldKey: text('field_key'),
    fieldType: text('field_type'), // text | textarea | select | radio | checkbox | file
    options: text('options', { mode: 'json' }),
    required: integer('required', { mode: 'boolean' }).notNull().default(true),
    status: text('status').notNull().default('open'), // open | answered | dismissed
    answer: text('answer'),
    saveToProfile: integer('save_to_profile', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    answeredAt: text('answered_at'),
  },
  (t) => [
    index('pending_questions_app_idx').on(t.applicationId),
    index('pending_questions_status_idx').on(t.status),
  ],
);

export const profileAnswers = sqliteTable('profile_answers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  sourceApplicationId: integer('source_application_id'),
  createdAt: text('created_at').notNull(),
});

export const activityLog = sqliteTable(
  'activity_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: text('ts').notNull(),
    actor: text('actor').notNull(), // agent | user | system
    type: text('type').notNull(),
    message: text('message').notNull(),
    jobId: integer('job_id'),
    applicationId: integer('application_id'),
    data: text('data', { mode: 'json' }),
  },
  (t) => [index('activity_log_ts_idx').on(t.ts)],
);

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(), // cycle | scan | analyze | decide | prepare | apply
  status: text('status').notNull().default('running'), // running | ok | error
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  stats: text('stats', { mode: 'json' }),
});
