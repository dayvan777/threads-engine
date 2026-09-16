import { z } from 'zod';

// ---------------------------------------------------------------------------
// Work modes / shared enums
// ---------------------------------------------------------------------------

export const WorkModeSchema = z.enum(['remote', 'hybrid', 'onsite']);
export type WorkMode = z.infer<typeof WorkModeSchema>;
export type RemoteMode = WorkMode | 'unknown';

export const AutonomyModeSchema = z.enum(['manual', 'assisted', 'autonomous']);
export type AutonomyMode = z.infer<typeof AutonomyModeSchema>;

// ---------------------------------------------------------------------------
// Master Candidate Profile — the single source of truth about the user.
// The agent may never claim anything not present here.
// ---------------------------------------------------------------------------

export const LanguageSkillSchema = z.object({
  language: z.string(),
  level: z.string(), // CEFR (A1..C2) or "native"
});
export type LanguageSkill = z.infer<typeof LanguageSkillSchema>;

export const WorkExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string().default(''),
  start: z.string().default(''), // "YYYY-MM" preferred, free text tolerated
  end: z.string().default(''), // empty while current
  current: z.boolean().default(false),
  summary: z.string().default(''),
  highlights: z.array(z.string()).default([]),
});
export type WorkExperience = z.infer<typeof WorkExperienceSchema>;

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string().default(''),
  field: z.string().default(''),
  start: z.string().default(''),
  end: z.string().default(''),
  notes: z.string().default(''),
});
export type Education = z.infer<typeof EducationSchema>;

export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  url: z.string().default(''),
  technologies: z.array(z.string()).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export const MasterProfileSchema = z.object({
  fullName: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  headline: z.string().default(''),
  summary: z.string().default(''),
  links: z
    .object({
      linkedin: z.string().default(''),
      github: z.string().default(''),
      portfolio: z.string().default(''),
      other: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    })
    .default(() => ({ linkedin: '', github: '', portfolio: '', other: [] as { label: string; url: string }[] })),
  workExperience: z.array(WorkExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  skills: z.array(z.string()).default([]),
  languages: z.array(LanguageSkillSchema).default([]),
  certifications: z.array(z.string()).default([]),
  workAuthorization: z.string().default(''), // e.g. "EU citizen", "German residence + work permit"
  needsVisaSponsorship: z.boolean().nullable().default(null),
  noticePeriod: z.string().default(''),
  earliestStart: z.string().default(''),
  salaryExpectation: z.string().default(''),
  willingToRelocate: z.boolean().nullable().default(null),
  /** Free-form additional true facts the agent may rely on (added by the user). */
  extraFacts: z.array(z.string()).default([]),
});
export type MasterProfile = z.infer<typeof MasterProfileSchema>;

export function emptyProfile(): MasterProfile {
  return MasterProfileSchema.parse({});
}

// ---------------------------------------------------------------------------
// Settings — search criteria, thresholds, autonomy
// ---------------------------------------------------------------------------

export const SettingsSchema = z.object({
  desiredTitles: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  excludedKeywords: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  searchRadiusKm: z.number().default(50),
  workModes: z.array(WorkModeSchema).default(['remote', 'hybrid', 'onsite']),
  commuteMaxMinutes: z.number().nullable().default(null),
  minSalary: z.number().nullable().default(null),
  salaryCurrency: z.string().default('EUR'),
  industries: z.array(z.string()).default([]),
  excludedIndustries: z.array(z.string()).default([]),
  blacklistCompanies: z.array(z.string()).default([]),
  whitelistCompanies: z.array(z.string()).default([]),
  autoApplyThreshold: z.number().int().min(0).max(100).default(90),
  reviewThreshold: z.number().int().min(0).max(100).default(75),
  maxApplicationsPerDay: z.number().int().min(0).default(10),
  maxAnalysesPerCycle: z.number().int().min(1).default(25),
  autonomy: AutonomyModeSchema.default('assisted'),
  paused: z.boolean().default(false),
  /** Skip LLM analysis for jobs with zero overlap with desired titles/keywords. */
  strictKeywordGate: z.boolean().default(true),
  scanIntervalHours: z.number().default(4),
  coverLetterEnabled: z.boolean().default(true),
});
export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/** A job posting normalized from any source into a common shape. */
export interface NormalizedJob {
  sourceKind: string;
  externalId?: string;
  url: string;
  title: string;
  company: string;
  companyUrl?: string;
  location?: string;
  remoteMode: RemoteMode;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryRaw?: string;
  description: string;
  lang?: string;
  postedAt?: string;
  raw?: unknown;
}

/** The subset of job fields the deterministic pipeline needs. */
export interface JobFacts {
  title: string;
  company: string;
  location?: string | null;
  remoteMode: string;
  description: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
}

// ---------------------------------------------------------------------------
// LLM analysis output
// ---------------------------------------------------------------------------

export const DealbreakerSchema = z.object({
  kind: z.string().describe('short machine tag, e.g. language_requirement, salary, seniority, location'),
  detail: z.string(),
  severity: z.enum(['hard', 'soft']),
});
export type Dealbreaker = z.infer<typeof DealbreakerSchema>;

export const JobAnalysisSchema = z.object({
  match_score: z.number().int().min(0).max(100),
  verdict: z.enum(['strong_match', 'good_match', 'possible_match', 'weak_match', 'no_match']),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  dealbreakers: z.array(DealbreakerSchema).default([]),
  missing_requirements: z.array(z.string()).default([]),
  language_fit: z.object({
    required: z.string().nullable(),
    meets: z.boolean().nullable(),
    note: z.string().default(''),
  }),
  salary_fit: z.enum(['above', 'within', 'below', 'unknown']),
  location_fit: z.enum(['good', 'acceptable', 'bad', 'unknown']),
  seniority_fit: z.enum(['under', 'match', 'over', 'unknown']),
  summary: z.string(),
});
export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type DecisionAction = 'auto_apply' | 'review' | 'skip' | 'defer';
export interface Decision {
  action: DecisionAction;
  reason: string;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const TailoredCvSchema = z.object({
  markdown: z.string(),
  emphasis: z.array(z.string()).default([]),
});
export type TailoredCv = z.infer<typeof TailoredCvSchema>;

export const CoverLetterSchema = z.object({
  markdown: z.string(),
  language: z.string().default('en'),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

export interface FactViolation {
  type: string;
  detail: string;
}
export interface FactGuardReport {
  ok: boolean;
  violations: FactViolation[];
}

// ---------------------------------------------------------------------------
// Screener questions (application forms)
// ---------------------------------------------------------------------------

export interface ScreenerQuestion {
  question: string;
  fieldKey?: string;
  fieldType?: string; // text | textarea | select | radio | checkbox
  options?: string[];
  required?: boolean;
}

export const ScreenerAnswerSchema = z.object({
  status: z.enum(['answered', 'needs_user']),
  answer: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().default(''),
});
export type ScreenerAnswer = z.infer<typeof ScreenerAnswerSchema>;
