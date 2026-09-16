import { arbeitnow } from './arbeitnow';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { remoteok } from './remoteok';
import { remotive } from './remotive';
import type { Connector, SourceKind } from './types';

export * from './types';
export { arbeitnow, greenhouse, lever, remoteok, remotive };

export const CONNECTORS: Record<Exclude<SourceKind, 'manual'>, Connector> = {
  arbeitnow,
  remoteok,
  remotive,
  greenhouse,
  lever,
};

export function getConnector(kind: string): Connector | null {
  return (CONNECTORS as Record<string, Connector>)[kind] ?? null;
}
