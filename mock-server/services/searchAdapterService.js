// Compatibility facade: Search adapter responsibilities have been split into
// registry / evidence / policy / summary / trace services.

export {
  collectSearchEvidenceCandidates,
  dedupeSearchEvidenceCandidates,
  sortSearchEvidenceCandidates,
  summarizeSearchEvidenceSources,
  buildSearchConnectorRegistrySummary,
  resolveSearchConnectorRegistry,
} from './searchAdapterRegistry.js';

