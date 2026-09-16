import {
  MasterProfileSchema,
  SettingsSchema,
  type MasterProfile,
  type Settings,
} from '@jobhunter/core';
import { nowIso, profile as profileTable, profileAnswers, settings as settingsTable, sources, type Db } from '@jobhunter/db';
import { eq } from 'drizzle-orm';

/** Typed access to the single-row JSON documents + small lookup tables. */
export class Store {
  private settingsCache: Settings | null = null;
  private profileCache: MasterProfile | null = null;

  constructor(private readonly db: Db) {}

  getSettings(): Settings {
    if (this.settingsCache) return this.settingsCache;
    const row = this.db.select().from(settingsTable).where(eq(settingsTable.id, 1)).get();
    const parsed = SettingsSchema.safeParse(row?.data ?? {});
    this.settingsCache = parsed.success ? parsed.data : SettingsSchema.parse({});
    if (!row) this.saveSettings(this.settingsCache);
    return this.settingsCache;
  }

  saveSettings(patch: Partial<Settings>): Settings {
    const merged = SettingsSchema.parse({ ...this.getSettingsRaw(), ...patch });
    this.db
      .insert(settingsTable)
      .values({ id: 1, data: merged, updatedAt: nowIso() })
      .onConflictDoUpdate({ target: settingsTable.id, set: { data: merged, updatedAt: nowIso() } })
      .run();
    this.settingsCache = merged;
    return merged;
  }

  private getSettingsRaw(): Settings {
    if (this.settingsCache) return this.settingsCache;
    const row = this.db.select().from(settingsTable).where(eq(settingsTable.id, 1)).get();
    const parsed = SettingsSchema.safeParse(row?.data ?? {});
    return parsed.success ? parsed.data : SettingsSchema.parse({});
  }

  getProfile(): MasterProfile {
    if (this.profileCache) return this.profileCache;
    const row = this.db.select().from(profileTable).where(eq(profileTable.id, 1)).get();
    const parsed = MasterProfileSchema.safeParse(row?.data ?? {});
    this.profileCache = parsed.success ? parsed.data : MasterProfileSchema.parse({});
    return this.profileCache;
  }

  saveProfile(data: unknown): MasterProfile {
    const parsed = MasterProfileSchema.parse(data);
    this.db
      .insert(profileTable)
      .values({ id: 1, data: parsed, updatedAt: nowIso() })
      .onConflictDoUpdate({ target: profileTable.id, set: { data: parsed, updatedAt: nowIso() } })
      .run();
    this.profileCache = parsed;
    return parsed;
  }

  getSavedAnswers(): Array<{ question: string; answer: string }> {
    return this.db
      .select({ question: profileAnswers.question, answer: profileAnswers.answer })
      .from(profileAnswers)
      .all();
  }

  addSavedAnswer(question: string, answer: string, sourceApplicationId?: number): void {
    this.db
      .insert(profileAnswers)
      .values({ question, answer, sourceApplicationId: sourceApplicationId ?? null, createdAt: nowIso() })
      .run();
  }

  /** Seed the default (free, keyless) job sources on first boot. */
  seedDefaultSources(): void {
    const existing = this.db.select({ id: sources.id }).from(sources).all();
    if (existing.length > 0) return;
    const now = nowIso();
    this.db
      .insert(sources)
      .values([
        { kind: 'arbeitnow', name: 'Arbeitnow (Germany/EU)', config: {}, enabled: true, createdAt: now },
        { kind: 'remotive', name: 'Remotive (remote)', config: {}, enabled: true, createdAt: now },
        { kind: 'remoteok', name: 'RemoteOK (remote)', config: {}, enabled: false, createdAt: now },
      ])
      .run();
  }
}
