CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scan_at TEXT,
  last_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER,
  source_kind TEXT NOT NULL,
  external_id TEXT,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  dedupe_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_url TEXT,
  location TEXT,
  remote_mode TEXT NOT NULL DEFAULT 'unknown',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  salary_raw TEXT,
  description TEXT NOT NULL DEFAULT '',
  lang TEXT,
  posted_at TEXT,
  discovered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'found',
  skip_reason TEXT,
  raw TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_canonical_url_uq ON jobs (canonical_url);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_hash_uq ON jobs (dedupe_hash);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_discovered_idx ON jobs (discovered_at);

CREATE TABLE IF NOT EXISTS job_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  data TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_analyses_job_idx ON job_analyses (job_id);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  method TEXT,
  autonomy_at_creation TEXT NOT NULL,
  intent TEXT NOT NULL,
  cv_document_id INTEGER,
  cover_letter_document_id INTEGER,
  answers TEXT,
  decision TEXT,
  submitted_at TEXT,
  failure_reason TEXT,
  artifacts_dir TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS applications_job_uq ON applications (job_id);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications (status);

CREATE TABLE IF NOT EXISTS application_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS application_events_app_idx ON application_events (application_id);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  job_id INTEGER,
  application_id INTEGER,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  pdf_path TEXT,
  meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_kind_idx ON documents (kind);
CREATE INDEX IF NOT EXISTS documents_app_idx ON documents (application_id);

CREATE TABLE IF NOT EXISTS pending_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  field_key TEXT,
  field_type TEXT,
  options TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  save_to_profile INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  answered_at TEXT
);
CREATE INDEX IF NOT EXISTS pending_questions_app_idx ON pending_questions (application_id);
CREATE INDEX IF NOT EXISTS pending_questions_status_idx ON pending_questions (status);

CREATE TABLE IF NOT EXISTS profile_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_application_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  job_id INTEGER,
  application_id INTEGER,
  data TEXT
);
CREATE INDEX IF NOT EXISTS activity_log_ts_idx ON activity_log (ts);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  stats TEXT
);
