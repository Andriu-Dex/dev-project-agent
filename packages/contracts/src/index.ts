export const healthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'database', 'checkedAt'],
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded'] },
    database: { type: 'string', enum: ['available', 'unavailable'] },
    checkedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: 'available' | 'unavailable';
  checkedAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
}

export const agentRoles = ['executor', 'reviewer', 'approver'] as const;
export type AgentRole = (typeof agentRoles)[number];

export type ProjectRole = 'manager' | 'viewer';

export interface TrelloItem {
  id: string;
  name: string;
  listId: string;
  kind: 'activity' | 'milestone' | 'reference';
  state: 'pending' | 'in_progress' | 'completed' | 'unknown';
  labelNames: string[];
  start: string | null;
  due: string | null;
  dueComplete: boolean;
  archived: boolean;
  memberIds: string[];
  qualityIssues: string[];
  planning?: TrelloPlanning;
}
export interface TrelloPlanning {
  description: string;
  wbs: string | null;
  principal: string | null;
  dependencyDeclaration: 'none' | 'provided' | 'unavailable' | 'invalid';
  dependencies: { wbs: string; relation: 'finish_start' | 'start_start'; lagHours: number; itemId: string | null }[];
  checklists: { id: string; name: string; items: { id: string; name: string; completedDeclared: boolean }[] }[];
}
export interface TrelloSnapshot {
  board: { id: string; name: string };
  lists: { id: string; name: string; closed: boolean }[];
  members: { id: string; displayName: string; username: string }[];
  items: TrelloItem[];
}
export interface TrelloChange { itemId: string; itemName: string; field: string; before: unknown; after: unknown }
export interface TrelloOverview {
  connection: { boardId: string; apiConfigured: boolean };
  latest: null | { id: string; source: 'api' | 'export'; observedAt: string; importedAt: string; data: TrelloSnapshot; changes: TrelloChange[] };
  lastAttempt: null | { status: 'succeeded' | 'failed'; attemptedAt: string; errorCode: string | null };
}

export type AttentionLevel = 'immediate' | 'upcoming' | 'review' | 'none';
export interface TrackingPolicyResponse {
  priorityLabels?: Record<string, 'high' | 'medium' | 'low'>;
  blockedLabels?: string[];
  stateLabels?: Record<string, 'pending' | 'in_progress' | 'completed'>;
  version: number;
  dueSoonHours: number;
  staleAfterMinutes: number;
  confirmed: boolean;
  changedAt: string;
  changedBy: { id: string; displayName: string } | null;
}
export type ScheduleStatus = 'overdue' | 'due_soon' | 'scheduled' | 'completed_declared' | 'not_evaluable';
export type TrackingFindingCode = 'overdue' | 'due_soon' | 'blocked' | 'data_quality';
export interface TrackingFinding {
  id: string;
  itemId: string;
  itemName: string;
  kind: 'activity' | 'milestone';
  code: TrackingFindingCode;
  attention: AttentionLevel;
  message: string;
  evidence: { field: string; value: string | boolean | string[] | null }[];
  impact: 'not_assessed';
}
export interface ItemTracking {
  declaredState?: TrelloItem['state'];
  itemId: string;
  schedule: ScheduleStatus;
  attention: AttentionLevel;
  overdueHours: number | null;
  priority: 'high' | 'medium' | 'low' | null;
  blocked: boolean | null;
  qualityIssues: string[];
}
export type ProjectAlertFinding=Omit<TrackingFinding,'code'> & {code:TrackingFindingCode|'baseline_deviation'|'dependency_risk'};
export interface TrackingResponse {
  evaluatedAt: string;
  policy: { version: string; dueSoonHours: number; staleAfterMinutes: number; thresholdsConfirmed: boolean };
  source: null | { snapshotId: string; source: 'api' | 'export'; observedAt: string; ageMinutes: number;
    freshness: 'recent' | 'stale' | 'historical' | 'invalid'; lastAttemptFailed: boolean };
  summary: null | {
    activities: { total: number; pending: number; inProgress: number; completedDeclared: number; unknown: number;
      overdue: number; dueSoon: number; notEvaluable: number; blocked: number; blockingUnknown: number };
    milestones: { total: number; completedDeclared: number; overdue: number; dueSoon: number; notEvaluable: number };
    progress: { numerator: number; denominator: number; percent: number | null; basis: 'declared_completion' };
    affectedItems: number;
  };
  items: ItemTracking[];
  findings: TrackingFinding[];
  limitations: string[];
}

export interface ProjectAccess {
  id: string;
  name: string;
  timeZone: string;
  role: ProjectRole;
  canManageProject: boolean;
}

export interface GitHubSnapshot {
  repository: { owner: string; name: string; defaultBranch: string };
  branch: string;
  head: string;
  base: string | null;
  branches: { name: string; sha: string }[];
  commits: { sha: string; message: string; author: string | null; committedAt: string | null }[];
  files: { path: string; previousPath: string | null; status: string; additions: number; deletions: number; hunks: { startLine: number; lineCount: number }[] }[];
  comparison: 'initial_commit' | 'unchanged' | 'ahead' | 'behind' | 'diverged';
  limitations: string[];
}
export interface GitHubOverview {
  connection: { owner: string; repository: string; branch: string } | null;
  latest: { id: string; observedAt: string; data: GitHubSnapshot } | null;
  lastAttempt: { status: 'succeeded' | 'failed'; attemptedAt: string; errorCode: string | null } | null;
}
export interface BaselineVersion {
  version: number; snapshotId: string; confirmedAt: string; confirmedBy: { id: string; displayName: string };
}
export type SupervisionJobKind = 'trello_sync' | 'github_sync' | 'analysis' | 'full';
export interface SupervisionJob {
  id: string; kind: SupervisionJobKind; status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';
  createdAt: string; startedAt: string | null; finishedAt: string | null; attempt: number; errorCode: string | null; runId: string | null;
}
export interface DependencyFinding {
  itemId: string; itemName: string; predecessorId: string | null; predecessorWbs: string | null;
  code: 'unavailable' | 'invalid' | 'unresolved' | 'cycle' | 'planned_conflict' | 'declared_conflict' | 'predecessor_overdue';
  message: string; evidence: string[];
}
export interface BaselineDeviation {
  itemId: string; itemName: string; field: string; before: unknown; after: unknown; hoursShift: number | null;
}
export interface SupervisionResult {
  analysisVersion: string; evaluatedAt: string; trelloSnapshotId: string | null; githubSnapshotId: string | null; baselineVersion: number | null;
  tracking: TrackingResponse | null; dependencies: DependencyFinding[]; deviations: BaselineDeviation[];
  code: GitHubSnapshot | null; limitations: string[];
}
export interface SupervisionRun {
  id: string; jobId: string; createdAt: string; status: 'complete' | 'partial'; result: SupervisionResult;
}
export interface SupervisionOverview {
  jobs: SupervisionJob[]; runs: { id: string; jobId: string; createdAt: string; status: 'complete' | 'partial' }[];
  latestRun: SupervisionRun | null;
}

export interface ProviderConnection {
  renewable?:boolean;retryAt?:string|null;lastRefreshedAt?:string|null;
  status:'disconnected'|'pending'|'connected'|'expired'|'failed';
  expiresAt:string|null; errorCode:string|null;
  models:{slug:string;displayName:string;reasoningEfforts?:ReasoningEffort[]}[];
}
export type ReasoningEffort='low'|'medium'|'high'|'xhigh'|'max';
export interface ProviderCaseOutput {
  caseId:string;classification:'overdue'|'completed'|'on_schedule'|'insufficient_data';
  evidenceIds:string[];requiresHumanApproval:boolean;recommendation:string;unknowns:string[];
}
export interface ProviderCaseResult {
  caseId:string;title:string;passed:boolean;checks:{code:string;passed:boolean}[];
  durationMs:number;usage:Record<string,number>|null;output:ProviderCaseOutput|null;errorCode:string|null;
}
export interface ProviderEvaluation {
  provider?:'chatgpt'|'ollama';
  reasoningEffort:ReasoningEffort|null;
  id:string;model:string;suiteVersion:string;status:'running'|'passed'|'failed'|'interrupted';
  createdAt:string;finishedAt:string|null;errorCode:string|null;
  result:{cases:ProviderCaseResult[];passed:number;total:number;requiresHumanReview:true;productionReady:false}|null;
}
export interface ProviderOverview {connection:ProviderConnection;evaluations:ProviderEvaluation[]}

export interface OllamaModel {
  digest?:string;
  name: string;
  size: number;
  modifiedAt: string;
  details?: {
    format?: string | undefined;
    family?: string | undefined;
    parameterSize?: string | undefined;
    quantizationLevel?: string | undefined;
  } | undefined;
}

export interface OllamaConnection {
  status: 'connected' | 'unavailable';
  baseUrl: string;
  models: OllamaModel[];
  errorCode: string | null;
}

export interface OllamaOverview {
  connection: OllamaConnection;
  evaluations: ProviderEvaluation[];
}

export type ProposalState='draft'|'pending_review'|'in_review'|'pending_policy_check'|'in_policy_check'|'pending_human_approval'|'authorized'|'changes_requested'|'rejected'|'invalidated'|'executing'|'executed'|'execution_failed'|'reconciliation_required';
export type AgentStage='executor'|'reviewer'|'approver';
export type TrelloAction =
  | {type:'trello_due_change';cardId:string;expectedDue:string|null;proposedDue:string}
  | {type:'trello_dates_change';cardId:string;expectedStart:string|null;expectedDue:string|null;proposedStart:string;proposedDue:string}
  | {type:'trello_members_change';cardId:string;expectedMembers:string[];proposedMembers:string[]}
  | {type:'trello_priority_change'|'trello_state_change';cardId:string;expectedLabels:string[];proposedLabels:string[];expectedDueComplete:boolean;proposedDueComplete:boolean};
export type RequestedTrelloChange = {family:'dates';start:string;due:string}|{family:'members';memberIds:string[]}|{family:'priority'|'state';label:string};
export interface ProposalContent {
  objective:string;justification:string;alternatives:string[];impact:string;risks:string[];verificationPlan:string;recoveryPlan:string;unresolvedQuestions:string[];evidenceIds:string[];
  actions:TrelloAction[];
}
export interface AgentVerdict {
  contentHash:string;
  verdict:'validated'|'human_required'|'changes_requested'|'rejected';summary:string;issues:string[];
  checks:{code:string;status:'pass'|'fail'|'not_checked';reason:string}[];
}
export interface ProposalVersionView {
  proposalId:string;version:number;purpose:'demonstration'|'live';state:ProposalState;createdAt:string;goal:string;requestedDue:string|null;sourceRunId:string;
  context:{schemaVersion:1;card:{id:string;name:string;state:string;due:string|null;start:string|null;wbs:string|null};[key:string]:unknown};
  content:ProposalContent|null;contentHash:string|null;
  messages:{id:string;jobId:string;stage:AgentStage;status:'succeeded'|'failed';input:unknown;output:unknown;errorCode:string|null;durationMs:number|null;usage:Record<string,number>|null;createdAt:string}[];
  decisions:{id:string;actorId:string;decision:'approved'|'rejected'|'changes_requested';reason:string;createdAt:string}[];
}
export interface AgentJobView {id:string;proposalId:string;version:number;model:string;reasoningEffort:ReasoningEffort|null;status:'running'|'succeeded'|'failed'|'interrupted';errorCode:string|null;createdAt:string}
export interface ProposalOverview {proposals:{id:string;version:number;purpose:'demonstration'|'live';state:ProposalState;goal:string;cardName:string;createdAt:string}[];jobs:AgentJobView[]}

export type SessionResponse =
  | { authenticated: false; csrfToken: string }
  | {
    authenticated: true;
    csrfToken: string;
    user: { id: string; login: string; displayName: string };
    project: ProjectAccess | null;
  };

export type ExecutionStatus='queued'|'running'|'succeeded'|'blocked'|'failed'|'reconciliation_required';
export interface ExecutionJobView {id:string;proposalId:string;version:number;contentHash:string;status:ExecutionStatus;errorCode:string|null;createdAt:string;writeStartedAt:string|null;finishedAt:string|null}
export interface ExecutionEventView {id:string;stage:'request'|'preflight'|'write'|'verification'|'reconciliation'|'recovery';outcome:'requested'|'started'|'succeeded'|'failed'|'uncertain';errorCode:string|null;evidence:{cardId:string;boardId:string;due:string|null;observedAt:string;fingerprint:string}|null;createdAt:string}
export interface ExecutionOverview {writesEnabled:boolean;credentialsConfigured:boolean;jobs:ExecutionJobView[]}


export interface CodeFile {path:string;blobSha:string;mode:string;size:number;content:string}
export interface CodeInventoryEntry {path:string;type:'blob'|'commit';mode:string;sha:string;size:number|null}
export interface CodeCatalog {connection:{owner:string;repository:string;branch:string};head:string;treeSha:string;observedAt:string;files:Omit<CodeFile,'content'>[];inventory:CodeInventoryEntry[];limits:{files:number;fileBytes:number;totalBytes:number;treeEntries:number}}
export interface CodeSource {schemaVersion:1;connection:CodeCatalog['connection'];head:string;treeSha:string;observedAt:string;mode:'files'|'comparison';baseSha:string|null;files:CodeFile[];inventory:CodeInventoryEntry[]}
export interface CodeFinding {id:string;path:string;startLine:number;endLine:number;category:'correctness'|'security'|'duplication'|'maintainability'|'complexity'|'performance';severity:'high'|'medium'|'low';confidence:'confirmed'|'hypothesis';origin:'deterministic'|'model';title:string;explanation:string;evidence:string;recommendation:string}
export interface CodeCheck {path:string;code:string;status:'pass'|'fail'|'not_checked';message:string}
export interface CodeAnalysisResult {summary:string;findings:CodeFinding[];checks:CodeCheck[];limitations:string[]}
export interface CodeAnalysisView {id:string;status:'queued'|'running'|'ready'|'failed'|'interrupted';errorCode:string|null;createdAt:string;finishedAt:string|null;model:string|null;reasoningEffort:ReasoningEffort|null;source:CodeSource|null;result:CodeAnalysisResult|null}
export interface CodeEdit {path:string;expectedBlob:string;startLine:number;endLine:number;before:string;after:string}
export interface CodeCorrection {objective:string;justification:string;impact:string;risks:string[];verificationPlan:string;recoveryPlan:string;unresolvedQuestions:string[];findingIds:string[];edits:CodeEdit[]}
export interface CodeCandidate {correction:CodeCorrection;files:CodeFile[];patch:string;checks:CodeCheck[]}
export interface CodeMessage {id:string;jobId:string;stage:AgentStage;status:'succeeded'|'failed';output:CodeCorrection|AgentVerdict|null;errorCode:string|null;durationMs:number|null;usage:Record<string,number>|null;createdAt:string;model:string;reasoningEffort:ReasoningEffort|null}
export interface CodeProposalView {id:string;version:number;latestVersion:number;purpose:'demonstration'|'live';state:ProposalState;analysisId:string;goal:string;findingIds:string[];createdAt:string;candidate:CodeCandidate|null;contentHash:string|null;messages:CodeMessage[];decisions:{id:string;decision:'approved'|'rejected'|'changes_requested';reason:string;createdAt:string}[]}
export interface CodePublicationView {id:string;proposalId:string;version:number;status:'simulated'|'queued'|'running'|'succeeded'|'blocked'|'failed'|'reconciliation_required';errorCode:string|null;branch:string;commitSha:string|null;pullNumber:number|null;pullUrl:string|null;createdAt:string;finishedAt:string|null;integrationStatus:'not_requested'|'pending_human';plan?:{repository:string;baseBranch:string;baseSha:string;branch:string;contentHash:string;title:string;body:string;files:{path:string;beforeBlob:string;afterBlob:string}[]};events:{stage:string;outcome:string;errorCode:string|null;createdAt:string}[]}
export interface CodeOverview {analyses:Omit<CodeAnalysisView,'source'|'result'>[];proposals:{id:string;version:number;purpose:'demonstration'|'live';state:ProposalState;goal:string;createdAt:string}[];jobs:{id:string;proposalId:string;version:number;status:'running'|'succeeded'|'failed'|'interrupted';errorCode:string|null}[];publications:CodePublicationView[];writesEnabled:boolean;writeCredentialsConfigured:boolean}

export interface ReportSchedule {version:number;enabled:boolean;weekday:number;hour:number;minute:number;timeZone:'America/Guayaquil';changedAt:string|null;nextCutoff:string|null;errorCode?:string|null}
export interface ReportSummary {id:string;version:number;kind:'scheduled'|'manual';status:'queued'|'published'|'draft'|'failed';periodStart:string;cutoff:string;createdAt:string;finishedAt:string|null;errorCode:string|null}
export interface WeeklyReport {
  riskAssessments?:{itemId:string;name:string;causeStatus:string;cause:string;impact:string;alternatives:{title:string;goal:string;eligible:boolean}[]}[];
  schemaVersion:1;project:{id:string;name:string};responsible:{id:string;name:string};periodStart:string;cutoff:string;generatedAt:string;partialPeriod:boolean;late:boolean;
  policyVersion:number|null;scheduleVersion:number|null;baselineVersion:number|null;
  executiveSummary:string;tracking:TrackingResponse|null;progressChangePoints:number|null;comparisonNote:string;
  activities:{id:string;name:string;kind:string;state:string;due:string|null;principal:string|null;responsibles:string[];schedule:ScheduleStatus|null;overdueHours:number|null;blocked:boolean|null}[];
  dependencies:DependencyFinding[];deviations:BaselineDeviation[];
  code:{id:string;commit:string;observedAt:string;finishedAt:string;files:string[];result:CodeAnalysisResult}|null;
  events:{id:string;action:string;outcome:string;actor:string|null;resourceId:string;createdAt:string}[];
  actions:{id:string;proposalId:string;version:number;purpose:'demonstration'|'live';target:'trello'|'code';action:string;outcome:string;actor:string|null;createdAt:string}[];
  recommendations:string[];nextWeek:{id:string;name:string;kind:string;due:string}[];
  sources:{kind:'trello'|'github';id:string;observedAt:string;timing:'before_cutoff'|'after_cutoff';ageMinutes:number|null;commit?:string;branch?:string}[];
  limitations:string[];activityUniverse:string[];
  stages:{stage:AgentStage;engine:'deterministic';outcome:'pass'|'fail';checkedAt:string;checks:{code:string;passed:boolean;message:string}[]}[];
}
export interface ReportDetail extends ReportSummary {contentHash:string|null;data:WeeklyReport|null}
export interface ReportsOverview {schedule:ReportSchedule;reports:ReportSummary[]}
