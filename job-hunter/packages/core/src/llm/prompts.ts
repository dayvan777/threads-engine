import type { JobFacts, JobAnalysis, MasterProfile, Settings } from '../types';
import { truncate } from '../util';

export const PROMPT_VERSION = '1';

export interface JobForLlm extends JobFacts {
  url?: string;
  salaryRaw?: string | null;
  postedAt?: string | null;
}

/** Profile view for scoring/documents: everything factual, no direct contact details. */
export function compactProfile(p: MasterProfile): Record<string, unknown> {
  return {
    headline: p.headline,
    summary: p.summary,
    location: p.location,
    workExperience: p.workExperience,
    education: p.education,
    projects: p.projects,
    skills: p.skills,
    languages: p.languages,
    certifications: p.certifications,
    workAuthorization: p.workAuthorization,
    needsVisaSponsorship: p.needsVisaSponsorship,
    noticePeriod: p.noticePeriod,
    earliestStart: p.earliestStart,
    willingToRelocate: p.willingToRelocate,
    extraFacts: p.extraFacts,
  };
}

export function constraintsFromSettings(s: Settings): Record<string, unknown> {
  return {
    desiredTitles: s.desiredTitles,
    keywords: s.keywords,
    locations: s.locations,
    searchRadiusKm: s.searchRadiusKm,
    workModes: s.workModes,
    commuteMaxMinutes: s.commuteMaxMinutes,
    minSalary: s.minSalary,
    salaryCurrency: s.salaryCurrency,
    industries: s.industries,
    excludedIndustries: s.excludedIndustries,
  };
}

export function jobForLlm(job: JobForLlm): Record<string, unknown> {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    remoteMode: job.remoteMode,
    salary: {
      min: job.salaryMin ?? null,
      max: job.salaryMax ?? null,
      currency: job.salaryCurrency ?? null,
      raw: job.salaryRaw ?? null,
    },
    postedAt: job.postedAt ?? null,
    description: truncate(job.description, 7000),
  };
}

export const ANALYZE_SYSTEM = `You are the vacancy analysis engine of an autonomous job-search agent acting for one candidate.

Compare the job posting against the candidate profile and constraints, then report a Job Match Score via the tool.

Scoring rubric (0-100):
- 90-100 strong_match: candidate clearly satisfies the core requirements AND the job satisfies the candidate's constraints. Rare.
- 75-89 good_match: solid fit; minor gaps that are unlikely to disqualify.
- 60-74 possible_match: plausible but with real gaps or constraint friction.
- 40-59 weak_match: significant gaps; applying is a long shot.
- 0-39 no_match: fundamental mismatch.

Rules:
- Judge ONLY from the provided profile, constraints and posting. Never assume unstated experience or skills.
- Be honest and slightly conservative: employers screen strictly. Do not inflate scores.
- dealbreakers: severity "hard" = violates a candidate constraint or a mandatory employer requirement the candidate clearly fails (required language above their level, mandatory onsite in a city outside their locations, salary clearly below their minimum, security clearance, degree they lack when stated as mandatory, visa sponsorship needed but not offered). severity "soft" = stated preference or nice-to-have the candidate lacks.
- language_fit: detect the language(s) the role actually requires (job ad language is a signal, e.g. a German-only ad usually implies professional German) and whether the candidate meets it.
- seniority_fit: "under" = role demands clearly more seniority than the candidate has.
- pros/cons: concrete, specific to this posting, each a short phrase.
- summary: 2-3 sentences a busy human can act on.`;

export function analyzeUser(profile: MasterProfile, settings: Settings, job: JobForLlm): string {
  return [
    'CANDIDATE PROFILE (single source of truth):',
    JSON.stringify(compactProfile(profile)),
    '',
    'CANDIDATE CONSTRAINTS:',
    JSON.stringify(constraintsFromSettings(settings)),
    '',
    'JOB POSTING:',
    JSON.stringify(jobForLlm(job)),
  ].join('\n');
}

export const TAILOR_SYSTEM = `You produce a tailored CV (resume) in Markdown for one specific job, based STRICTLY on the candidate's Master Profile.

ABSOLUTE RULES — the output is machine-verified against the profile and rejected on violation:
- Never invent or alter facts: no new employers, job titles, dates, locations, degrees, institutions, certifications, skills, tools, projects, metrics or numbers. Job titles and company names must appear EXACTLY as in the profile.
- Never claim a language level above the profile.
- Any number you write must literally exist in the profile (dates from the profile are fine; do not compute new metrics).

WHAT YOU MAY DO (this is the point of tailoring):
- Rewrite the headline and summary to speak to THIS job, using only true facts.
- Reorder experience highlights, select the most relevant ones, and rephrase them (meaning-preserving) to mirror the posting's vocabulary.
- Omit irrelevant entries or highlights (keep the recent employment history intact — no unexplained gaps).
- Reorder/subset the skills list to lead with what this job needs.
- Emphasize the profile facts that map to the role archetype (e.g. operations roles → process ownership, responsibility, leadership; startup/AI roles → own products, AI/automation projects, product thinking; e-commerce → digital and customer/business experience) — but only ever with facts from the profile.

FORMAT CONTRACT (machine-parsed):
# Full Name
headline line
location · email · phone
links line (optional)
## Summary
## Experience   — entries as: ### <exact title> — <exact company>  then *<start> – <end|Present> · <location>* then bullet highlights
## Projects     — optional, entries as: ### <project name>
## Education    — entries as: ### <degree>, <field> — <institution>
## Skills
## Languages    — bullets: - <Language> — <level>
## Certifications — optional, bullets

Write the CV in English, unless the job posting is in German AND the profile shows German at B2 or above — then German is allowed.
Keep it to roughly one page of content.`;

export function tailorUser(profile: MasterProfile, job: JobForLlm, analysis: JobAnalysis | null): string {
  return [
    'MASTER PROFILE (the only allowed source of facts):',
    JSON.stringify(profile),
    '',
    'TARGET JOB:',
    JSON.stringify(jobForLlm(job)),
    '',
    analysis
      ? `MATCH ANALYSIS (what to emphasize / address): ${JSON.stringify({ pros: analysis.pros, cons: analysis.cons, missing: analysis.missing_requirements })}`
      : '',
    '',
    'Produce the tailored CV now via the tool.',
  ].join('\n');
}

export const COVER_SYSTEM = `You write short, specific cover letters (Anschreiben) for one candidate, based STRICTLY on their Master Profile and the job posting.

Hard rules (machine-verified):
- Only claims backed by the profile. No invented experience, numbers, or language levels.
- 150-280 words of body text.

Style rules:
- Never open with clichés like "Dear Hiring Manager, I am excited to apply" or "I am writing to express my interest". Start with substance: something specific about the company/product/role and why this candidate fits.
- Sound like a competent human, not a template: plain, direct sentences; no buzzword strings; no flattery padding.
- Reference the company and role specifically, using only information from the posting itself.
- Connect 2-3 concrete profile facts to the posting's actual needs.
- It is fine to briefly acknowledge a gap when the analysis flags one, framed honestly.
- Sign off with the candidate's name.
- Write in the language of the job posting if the profile shows that language at B2 or above; otherwise write in English.

Output via the tool: markdown body (greeting line, paragraphs, sign-off; no addresses/letterhead) and the language used.`;

export function coverUser(profile: MasterProfile, job: JobForLlm, analysis: JobAnalysis | null): string {
  return [
    'MASTER PROFILE:',
    JSON.stringify(compactProfile(profile)),
    `Candidate name for the sign-off: ${profile.fullName}`,
    '',
    'TARGET JOB:',
    JSON.stringify(jobForLlm(job)),
    '',
    analysis ? `MATCH ANALYSIS: ${JSON.stringify({ pros: analysis.pros, cons: analysis.cons })}` : '',
    '',
    'Write the cover letter now via the tool.',
  ].join('\n');
}

export const EXTRACT_PROFILE_SYSTEM = `You convert a candidate's pasted CV/resume text into a structured Master Profile.

Rules:
- Extract ONLY what the text states. Never infer, embellish, or fill gaps with plausible values.
- Unknown fields stay empty ("" / [] / null).
- Dates: use "YYYY-MM" when the text gives month+year, "YYYY" when only a year.
- languages: use CEFR levels only when the text states them; otherwise copy the stated wording (e.g. "fluent").
- Keep bullet achievements as separate highlight strings, preserving any numbers exactly.`;

export const ANSWER_SYSTEM = `You answer job-application form questions on behalf of a candidate, using ONLY their profile, constraints, and previously saved answers.

Rules:
- If the provided data does not clearly contain the answer, return status "needs_user" with answer null. NEVER guess or fabricate — a wrong answer on an application is worse than asking the user.
- If options are provided, "answer" must be EXACTLY one of the options (or several exact options joined by "; " when the question allows multiple).
- Voluntary demographic/EEO questions (gender, ethnicity, veteran status, disability): choose the "decline to answer"-style option when one exists; otherwise needs_user.
- Salary questions: use the profile's salary expectation or the constraints' minimum salary; if neither exists, needs_user.
- Questions about willingness/availability (start date, notice period, relocation, work authorization, visa sponsorship): answer only from the profile fields.
- Free-text answers: 1-3 sentences, factual, first person.
- confidence: your honest confidence that this answer is correct AND safe to submit (>= 0.75 required for autonomous submission).`;

export interface AnswerContext {
  profile: MasterProfile;
  settings: Settings;
  savedAnswers: Array<{ question: string; answer: string }>;
  job?: JobForLlm;
}

export function answerUser(ctx: AnswerContext, question: { question: string; fieldType?: string; options?: string[]; required?: boolean }): string {
  return [
    'CANDIDATE PROFILE:',
    JSON.stringify(compactProfile(ctx.profile)),
    '',
    'CONSTRAINTS:',
    JSON.stringify(constraintsFromSettings(ctx.settings)),
    '',
    ctx.savedAnswers.length ? `PREVIOUSLY SAVED ANSWERS:\n${JSON.stringify(ctx.savedAnswers)}` : '',
    ctx.job ? `JOB CONTEXT:\n${JSON.stringify({ title: ctx.job.title, company: ctx.job.company })}` : '',
    '',
    'FORM QUESTION:',
    JSON.stringify(question),
  ].join('\n');
}
