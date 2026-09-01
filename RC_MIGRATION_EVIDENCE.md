# Release Candidate Migration Evidence

## Workflow persistence migration

The current Workflow persistence envelope is versioned. Before a lower-version
state is normalized, the original envelope is written to a recoverable backup;
an invalid migration throws before replacing the source. Unknown plugin node
data is preserved, while invalid selections and broken connections are removed
from the normalized projection.

`tests/workflowMigration.test.ts` covers:

- legacy project normalization and unknown plugin preservation;
- missing optional collections and broken-edge filtering;
- backup-before-failure and source preservation when backup fails;
- store rehydration and current persistence-version writeback.

## Persistence soak

`tests/releaseCandidatePersistence.test.ts` covers:

- 30 persist/rehydrate restart cycles with a stable project hash;
- 100 revisioned mutations with one connection and 100 unique mutation receipts;
- exact state equality after rehydrate, including nodes, edges, revisions and
  change history.

The focused migration/persistence suite is the deterministic RC evidence for
the data layer. An interrupted real desktop process kill and production-version
upgrade still require a disposable packaged-install certification run; no
production data was touched during this RC run.

```text
npx vitest run tests/workflowMigration.test.ts tests/releaseCandidatePersistence.test.ts --reporter=dot
```
