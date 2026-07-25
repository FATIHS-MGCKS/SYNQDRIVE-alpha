export const WORKFLOW_CONDITION_LIMITS = {
  /** Maximum nesting depth for condition groups (root = depth 1). */
  maxTreeDepth: parseInt(process.env.WORKFLOW_CONDITION_MAX_TREE_DEPTH ?? '5', 10),
  /** Maximum leaf clauses per workflow version. */
  maxClauseCount: parseInt(process.env.WORKFLOW_CONDITION_MAX_CLAUSE_COUNT ?? '50', 10),
  /** Maximum total nodes (groups + clauses) in a condition tree payload. */
  maxNodeCount: parseInt(process.env.WORKFLOW_CONDITION_MAX_NODE_COUNT ?? '100', 10),
  /** Maximum serialized JSON bytes for a condition tree DTO. */
  maxPayloadBytes: parseInt(process.env.WORKFLOW_CONDITION_MAX_PAYLOAD_BYTES ?? '65536', 10),
} as const;
