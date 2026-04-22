# Workflow Platform Contract

## Contract Scope

Freeze and keep backward compatibility for:

- `ConnectorSpec` (`connector-spec/v1`)
- `PluginSpec` (`plugin-spec/v1`)
- `WorkflowNodeSpec` (`workflow-node-spec/v1`)
- `EventSchema` (`event-schema/v1`)
- `TraceSchema` (`trace-schema/v1`)
- `PluginReleaseSpec` (`plugin-release-spec/v1`)

Implementation entry:

- contract validators: `mock-server/contracts/platformContracts.js`
- plugin registry: `mock-server/services/pluginRegistryService.js`
- node registry: `mock-server/services/workflowNodeRegistry.js`
- manifests: `mock-server/plugins/manifests/*.json`
- custom node modules: `mock-server/plugins/nodes/*.js`
- reusable templates: `mock-server/plugins/templates/*.json`

## Manifest Contract Mapping

1. `PluginSpec`
- `specVersion`, `pluginId`, `displayName`, `kind`, `route`, `enabled`, `defaultPlugin`, `order`

2. `WorkflowNodeSpec`
- `workflow.specVersion`, `workflow.entryNodeId`, `workflow.nodes[]`
- each node: `id`, `type`, `module`, `operation`, `inputMode`, `timeoutMs`, `continueOnError`, `inputOverrides`
- custom node extension: `handler.modulePath`, `handler.exportName`

3. `PluginReleaseSpec`
- `release.specVersion`, `release.stage`, `release.trafficPercent`, `release.stablePluginId`, `release.rollbackOnError`, `release.bucketBy`

4. `ConnectorSpec`
- `connectors[]` with `id`, `connectorType`, `adapterType`, `settingsPath`, `whitelistKeys`, `limitsKeys`

5. `EventSchema`
- `eventSchema.specVersion`, `eventTypes`, `requiredFields`

6. `TraceSchema`
- `traceSchema.specVersion`, `requiredSections`, `compatibility`

## Canary And Rollback Rules

- If `requestedPluginId` is passed, route directly to that plugin.
- If no `requestedPluginId`, plugin registry resolves by:
1. stable plugin (`defaultPlugin=true` or lowest `order`)
2. canary plugin (`release.stage=canary`, `trafficPercent>0`)
3. deterministic bucket split by `release.bucketBy` (default: `sessionId`)
- If canary fails and `rollbackOnError=true`, automatically execute `stablePluginId` (or resolved stable plugin).
- Rollback result is surfaced in `meta.pluginRuntimeSummary.rollback` and `meta.pluginTrace.rollback`.
- Runtime release strategy can be overridden by Settings:
  - `settings.workflowRelease.routes["<kind>:<route>"]`
  - fields: `stablePluginId`, `canaryPluginId`, `trafficPercent`, `rollbackOnError`, `bucketBy`, `enabled`

## Acceptance Standard

### Requirement

Add one new custom node by configuration and support canary publish/rollback.

### Built-in Example In This Repo

- canary plugin manifest:
`mock-server/plugins/manifests/output-canary-custom-node.json`
- custom node module:
`mock-server/plugins/nodes/outputCanaryAnnotatorNode.js`

### Industry Multi-Node Examples

- `mock-server/plugins/manifests/analyze-legal-compliance.json`
- `mock-server/plugins/manifests/search-manufacturing-fusion.json`
- `mock-server/plugins/manifests/output-healthcare-compliance.json`
- shared industry node handlers:
`mock-server/plugins/nodes/industryWorkflowNodes.js`

### Verify

1. Start mock server:
- `npm run dev:mock`

2. Call output route without `pluginId` (automatic grayscale):
- `POST /api/agent/generate-script`
- body should contain a stable `sessionId`

3. Confirm response `meta` includes:
- `platformContract`
- `pluginRuntimeSummary` (contains `resolution` and `rollback`)
- `pluginTrace` (contains node events and rollback info)
- `pluginRegistrySummary`

4. Rollback drill:
- send request body with `forceCanaryNodeFailure=true`
- when request is bucketed to canary, runtime should rollback automatically to stable plugin

If step 1-4 passes without changing runtime routes, acceptance passes.

## Automated Regression

- Single run:
  - `npm run test:workflow:release`
- Continuous run:
  - `npm run test:workflow:release -- --loop --interval-ms=30000`
- Report output:
  - `mock-server/test-results/workflow-release-regression-*.json`
