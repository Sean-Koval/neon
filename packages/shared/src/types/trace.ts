/**
 * Trace Types
 *
 * Core types for trace and span data used throughout the platform.
 */

/**
 * Trace status
 */
export type TraceStatus = "unset" | "ok" | "error";

/**
 * Span kind following OTel specification
 */
export type SpanKind =
  | "internal"
  | "server"
  | "client"
  | "producer"
  | "consumer";

/**
 * Extended span type for AI agent operations
 */
export type SpanType =
  | "span"
  | "generation"
  | "tool"
  | "retrieval"
  | "event";

/**
 * Component type for attribution in compound AI systems
 * Used to identify which component of the agent system a span belongs to
 */
export type ComponentType =
  | "prompt"      // Prompt construction and formatting
  | "retrieval"   // RAG/document retrieval operations
  | "tool"        // Tool selection and execution
  | "reasoning"   // Chain-of-thought, planning, or reasoning steps
  | "planning"    // High-level task decomposition and planning
  | "memory"      // Memory access and management
  | "routing"     // Agent routing and orchestration
  | "skill"       // Skill/capability selection and execution
  | "mcp"         // MCP server/tool operations
  | "other";      // Unclassified or custom components

/**
 * Skill category for grouping related skills/tools
 */
export type SkillCategory =
  | "code"        // Code generation, editing, analysis
  | "search"      // Web search, file search, knowledge retrieval
  | "file"        // File operations (read, write, edit)
  | "data"        // Data processing and transformation
  | "communication" // Messaging, notifications, API calls
  | "browser"     // Web browsing and interaction
  | "system"      // System operations, shell commands
  | "custom";     // User-defined skill category

/**
 * MCP transport type
 */
export type MCPTransport = "stdio" | "http" | "websocket";

/**
 * Skill selection context - captures why a skill was chosen
 */
export interface SkillSelectionContext {
  /** The skill/tool that was selected */
  selectedSkill: string;
  /** Category of the selected skill */
  skillCategory?: SkillCategory;
  /** Confidence score (0-1) in the selection */
  selectionConfidence?: number;
  /** Reasoning for why this skill was selected */
  selectionReason?: string;
  /** Other skills that were considered but not selected */
  alternativesConsidered?: string[];
  /** Scores for alternatives (parallel array with alternativesConsidered) */
  alternativeScores?: number[];
}

/**
 * MCP (Model Context Protocol) execution context
 */
export interface MCPContext {
  /** MCP server identifier */
  serverId: string;
  /** MCP server URL or path */
  serverUrl?: string;
  /** Tool identifier within the MCP server */
  toolId: string;
  /** MCP protocol version */
  protocolVersion?: string;
  /** Transport mechanism used */
  transport?: MCPTransport;
  /** Capabilities exposed by the server */
  capabilities?: string[];
  /** MCP-specific error code if failed */
  errorCode?: string;
}

/**
 * Retrieval chunk for structured RAG context
 */
export interface RetrievalChunk {
  /** The retrieved text content */
  content: string;
  /** Source identifier (document path, URL, collection name, etc.) */
  source: string;
  /** Relevance/similarity score from the retrieval system (0-1) */
  relevance_score?: number;
  /** Position/rank in the result set (0-indexed) */
  position?: number;
  /** Optional metadata about the chunk */
  metadata?: Record<string, string>;
}

/**
 * Decision metadata for span execution
 */
export interface DecisionMetadata {
  /** Whether this action was explicitly requested by the user */
  wasUserInitiated?: boolean;
  /** Whether this is a fallback action after a failure */
  isFallback?: boolean;
  /** Number of retry attempts for this operation */
  retryCount?: number;
  /** ID of the original span this is retrying (if isFallback) */
  originalSpanId?: string;
  /** Whether approval was required for this action */
  requiredApproval?: boolean;
  /** Whether approval was granted (if requiredApproval) */
  approvalGranted?: boolean;
}

/**
 * Session and conversation lineage for traces and spans.
 */
export interface SessionContext {
  /** Stable session identifier for grouping related traces. */
  sessionId: string;
  /** Conversation or thread identifier within the session. */
  conversationId?: string;
  /** User identifier when available. */
  userId?: string;
  /** Thread identifier for multi-threaded workflows. */
  threadId?: string;
}

/**
 * Structured content part within a message.
 */
export interface MessageContentPart {
  type: "text" | "image" | "audio" | "tool_call" | "tool_result" | "json" | "other";
  text?: string;
  mimeType?: string;
  data?: string;
  metadata?: Record<string, string>;
}

/**
 * Structured tool call metadata associated with a message.
 */
export interface MessageToolCall {
  id: string;
  name: string;
  arguments?: string;
}

/**
 * Structured input/output message representation.
 */
export interface TraceMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer" | "other";
  content: string;
  messageId?: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: MessageToolCall[];
  parts?: MessageContentPart[];
  metadata?: Record<string, string>;
}

/**
 * Agent handoff and delegation metadata for graph reconstruction.
 */
export interface HandoffMetadata {
  handoffType: "handoff" | "delegation" | "routing";
  fromAgentId?: string;
  toAgentId: string;
  fromSpanId?: string;
  toSpanId?: string;
  reason?: string;
  taskDescription?: string;
  contextSummary?: string;
  messageId?: string;
  metadata?: Record<string, string>;
}

/**
 * Reference to a durable artifact associated with a trace or span.
 */
export interface ArtifactReference {
  artifactId?: string;
  name: string;
  kind: "file" | "document" | "image" | "audio" | "json" | "url" | "other";
  uri?: string;
  mimeType?: string;
  contentHash?: string;
  sizeBytes?: number;
  metadata?: Record<string, string>;
}

/**
 * Reference to a captured state snapshot.
 */
export interface StateSnapshotReference {
  snapshotId: string;
  name?: string;
  stateType?: string;
  uri?: string;
  contentHash?: string;
  artifactIds?: string[];
  metadata?: Record<string, string>;
}

/**
 * Eval or review metadata attached directly to traces or spans.
 */
export interface EvalAnnotation {
  annotationId?: string;
  name: string;
  evaluatorType?: "human" | "llm_judge" | "rule" | "dataset" | "system";
  status?: "expected" | "observed" | "pass" | "fail" | "note";
  value?: string;
  score?: number;
  comment?: string;
  referenceSpanId?: string;
  metadata?: Record<string, string>;
}

/**
 * Span status
 */
export type SpanStatus = "unset" | "ok" | "error";

/**
 * Trace represents a complete agent execution
 */
export interface Trace {
  traceId: string;
  projectId: string;
  name: string;
  timestamp: Date;
  endTime?: Date;
  durationMs: number;
  status: TraceStatus;
  metadata: Record<string, string>;
  // Agent context
  agentId?: string;
  agentVersion?: string;
  workflowId?: string;
  workflowRunId?: string;
  session?: SessionContext;
  inputMessages?: TraceMessage[];
  outputMessages?: TraceMessage[];
  handoffs?: HandoffMetadata[];
  stateSnapshots?: StateSnapshotReference[];
  artifacts?: ArtifactReference[];
  evalAnnotations?: EvalAnnotation[];
  // Aggregated stats
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd?: number;
  toolCallCount: number;
  llmCallCount: number;
}

/**
 * Span represents an individual operation within a trace
 */
export interface Span {
  spanId: string;
  traceId: string;
  projectId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  spanType: SpanType;
  componentType?: ComponentType;  // Component attribution for compound AI systems
  timestamp: Date;
  endTime?: Date;
  durationMs: number;
  status: SpanStatus;
  statusMessage?: string;
  // LLM generation fields
  model?: string;
  modelParameters?: Record<string, string>;
  input?: string;
  output?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  // Tool fields
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  session?: SessionContext;
  inputMessages?: TraceMessage[];
  outputMessages?: TraceMessage[];
  handoff?: HandoffMetadata;
  stateSnapshots?: StateSnapshotReference[];
  artifacts?: ArtifactReference[];
  evalAnnotations?: EvalAnnotation[];
  // Skill selection context (for debugging "did we pick the right skill?")
  skillSelection?: SkillSelectionContext;
  // MCP execution context (for MCP tool calls)
  mcpContext?: MCPContext;
  // Decision metadata (for understanding execution decisions)
  decisionMetadata?: DecisionMetadata;
  // Attributes
  attributes: Record<string, string>;
}

/**
 * Span with children for tree rendering
 */
export interface SpanWithChildren extends Span {
  children: SpanWithChildren[];
}

/**
 * Trace with all spans
 */
export interface TraceWithSpans {
  trace: Trace;
  spans: SpanWithChildren[];
}

/**
 * Trace summary for list views
 */
export interface TraceSummary {
  traceId: string;
  name: string;
  timestamp: Date;
  durationMs: number;
  status: TraceStatus;
  totalTokens: number;
  toolCalls: number;
  llmCalls: number;
  agentId?: string;
  agentVersion?: string;
}

/**
 * Filters for trace queries
 */
export interface TraceFilters {
  projectId: string;
  status?: TraceStatus;
  startDate?: Date;
  endDate?: Date;
  agentId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
