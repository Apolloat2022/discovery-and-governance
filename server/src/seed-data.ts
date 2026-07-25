import type { ArtifactType, Role, SecurityScope } from "./types.js";

export interface SeedTeam {
  id: string;
  name: string;
  objective: string;
}

export interface SeedUser {
  id: string;
  name: string;
  role: Role;
  teamId: string;
  title: string;
}

export interface SeedTask {
  id: string;
  title: string;
  description: string;
  teamId: string;
  assignees: string[];
  /** Artifacts this task is known to relate to. */
  artifacts: string[];
}

export interface SeedArtifact {
  id: string;
  name: string;
  type: ArtifactType;
  ownerId: string;
  teamId: string;
  scope: SecurityScope;
  certified?: boolean;
  description: string;
  content: string;
  inputs: string[];
  outputs: string[];
  tags: string[];
  /** Present for forks; the lineage root is derived from it. */
  parentId?: string;
  createdDaysAgo: number;
  /** Number of execution events to synthesise. */
  runs: number;
  successRate: number;
  /** Days-ago window the events fall inside, newest bound first. */
  window: [number, number];
  ratings: number[];
}

export const TEAMS: SeedTeam[] = [
  {
    id: "team_revops",
    name: "Revenue Operations",
    objective:
      "Shorten enterprise sales cycles with AI-assisted outreach, qualification, and pipeline forecasting.",
  },
  {
    id: "team_support",
    name: "Customer Support",
    objective:
      "Resolve customer issues faster through automated ticket triage, summarisation, and knowledge retrieval.",
  },
  {
    id: "team_platform",
    name: "Platform Engineering",
    objective:
      "Ship reliable services faster with automated code review, incident response, and data pipeline tooling.",
  },
];

export const USERS: SeedUser[] = [
  { id: "u_amara", name: "Amara Osei", role: "admin", teamId: "team_platform", title: "Director of AI Enablement" },
  { id: "u_dilan", name: "Dilan Reyes", role: "lead", teamId: "team_revops", title: "Head of Revenue Operations" },
  { id: "u_kenji", name: "Kenji Watanabe", role: "member", teamId: "team_revops", title: "Sales Enablement Manager" },
  { id: "u_priya", name: "Priya Raman", role: "member", teamId: "team_revops", title: "Enterprise Account Executive" },
  { id: "u_marco", name: "Marco Bianchi", role: "lead", teamId: "team_support", title: "Support Operations Lead" },
  { id: "u_hana", name: "Hana Lindqvist", role: "member", teamId: "team_support", title: "Senior Support Engineer" },
  { id: "u_tomas", name: "Tomas Novak", role: "lead", teamId: "team_platform", title: "Staff Platform Engineer" },
  { id: "u_selin", name: "Selin Aydin", role: "member", teamId: "team_platform", title: "Data Engineer" },
];

export const TASKS: SeedTask[] = [
  {
    id: "task_q3_outbound",
    title: "Q3 outbound expansion into manufacturing",
    description: "Build an outbound motion for manufacturing accounts, including messaging and qualification.",
    teamId: "team_revops",
    assignees: ["u_kenji", "u_priya"],
    artifacts: ["art_outreach_email", "art_discovery_qs", "art_lead_scoring"],
  },
  {
    id: "task_ticket_backlog",
    title: "Cut first-response time on the ticket backlog",
    description: "Automate triage and drafting so first response drops below one hour.",
    teamId: "team_support",
    assignees: ["u_marco", "u_hana"],
    artifacts: ["art_ticket_triage", "art_macro_reply", "art_escalation_wf"],
  },
  {
    id: "task_review_latency",
    title: "Reduce pull request review latency",
    description: "Use automated review and test generation to shorten the code review cycle.",
    teamId: "team_platform",
    assignees: ["u_tomas", "u_selin"],
    artifacts: ["art_code_review", "art_test_gen"],
  },
  {
    id: "task_warehouse_migration",
    title: "Warehouse migration readiness",
    description: "Document schemas and harden the data pipelines before the warehouse migration.",
    teamId: "team_platform",
    assignees: ["u_selin", "u_amara"],
    artifacts: ["art_schema_doc", "art_etl_repair", "art_sql_optimizer"],
  },
];

/**
 * Forty capabilities across three teams. The set is deliberately shaped so the
 * governance engine has something to find: two-to-three level fork chains,
 * near-identical artifacts created independently by different teams, several
 * abandoned workflows, and one agent that fails more often than it succeeds.
 */
export const ARTIFACTS: SeedArtifact[] = [
  // ---- Revenue Operations -------------------------------------------------
  {
    id: "art_outreach_email",
    name: "Enterprise Outreach Email Writer",
    type: "prompt",
    ownerId: "u_kenji",
    teamId: "team_revops",
    scope: "public",
    certified: true,
    description:
      "Drafts a personalised cold outreach email to an enterprise prospect using their industry, role, and a recent trigger event.",
    content:
      "You are an enterprise sales writer. Draft a short outreach email to {{prospect_name}}, a {{role}} at {{company}} in the {{industry}} industry.\nReference the trigger event {{trigger}} in the opening line.\nKeep it under 120 words, lead with the business outcome, avoid superlatives, and end with a single specific call to action.",
    inputs: ["prospect_name", "role", "company", "industry", "trigger"],
    outputs: ["subject_line", "email_body"],
    tags: ["sales", "outreach", "email", "prospecting"],
    createdDaysAgo: 210,
    runs: 96,
    successRate: 0.96,
    window: [0, 88],
    ratings: [5, 5, 4, 5, 4],
  },
  {
    id: "art_discovery_qs",
    name: "Discovery Call Question Generator",
    type: "prompt",
    ownerId: "u_priya",
    teamId: "team_revops",
    scope: "public",
    description:
      "Produces a tailored discovery question set for a first sales call, grouped by pain, process, and decision authority.",
    content:
      "Given the account brief {{account_brief}} and the buying persona {{persona}}, produce twelve discovery questions.\nGroup them under pain, current process, decision authority, and success criteria.\nEach question must be open-ended and must not mention our product.",
    inputs: ["account_brief", "persona"],
    outputs: ["question_set"],
    tags: ["sales", "discovery", "qualification"],
    createdDaysAgo: 165,
    runs: 44,
    successRate: 0.93,
    window: [1, 85],
    ratings: [4, 5, 4],
  },
  {
    id: "art_lead_scoring",
    name: "Lead Qualification Scoring Agent",
    type: "agent",
    ownerId: "u_dilan",
    teamId: "team_revops",
    scope: "team",
    description:
      "Scores inbound leads against the ideal customer profile and writes the rationale back to the CRM record.",
    content:
      "Tools: crm.read_lead, enrichment.lookup_company, crm.write_score.\nScore each inbound lead from 0-100 against the ICP definition {{icp}}.\nWeight firmographic fit 40%, engagement recency 35%, and buying-committee coverage 25%.\nWrite the score and a two-sentence rationale back to the CRM lead record.",
    inputs: ["lead_id", "icp"],
    outputs: ["score", "rationale"],
    tags: ["sales", "scoring", "crm", "qualification"],
    createdDaysAgo: 140,
    runs: 71,
    successRate: 0.91,
    window: [0, 89],
    ratings: [4, 4, 5],
  },
  {
    id: "art_forecast_roll",
    name: "Pipeline Forecast Rollup Workflow",
    type: "workflow",
    ownerId: "u_dilan",
    teamId: "team_revops",
    scope: "team",
    description:
      "Weekly workflow that rolls opportunity-level commits into a regional forecast and highlights deals that slipped.",
    content:
      "Step 1: pull all open opportunities closing this quarter from the CRM.\nStep 2: normalise stage names and commit categories per region.\nStep 3: compare against last week's snapshot and list every deal whose close date slipped.\nStep 4: publish the regional rollup to the revenue channel with a variance commentary.",
    inputs: ["quarter", "region"],
    outputs: ["forecast_rollup", "slipped_deals"],
    tags: ["forecasting", "pipeline", "reporting"],
    createdDaysAgo: 155,
    runs: 26,
    successRate: 0.88,
    window: [2, 86],
    ratings: [4, 3],
  },
  {
    id: "art_battlecard",
    name: "Competitor Battlecard Builder",
    type: "skill",
    ownerId: "u_kenji",
    teamId: "team_revops",
    scope: "public",
    description:
      "Assembles a one-page competitor battlecard covering positioning, pricing posture, and objection handling.",
    content:
      "Research the competitor {{competitor}} using the supplied win/loss notes and public material.\nProduce a one-page battlecard: their positioning, where they win, where they lose, pricing posture, and three objection-handling responses.\nCite the win/loss record for every claim.",
    inputs: ["competitor", "win_loss_notes"],
    outputs: ["battlecard"],
    tags: ["sales", "competitive", "enablement"],
    createdDaysAgo: 120,
    runs: 33,
    successRate: 0.94,
    window: [3, 80],
    ratings: [5, 4, 4],
  },
  {
    id: "art_renewal_brief",
    name: "Renewal Risk Briefing Agent",
    type: "agent",
    ownerId: "u_priya",
    teamId: "team_revops",
    scope: "team",
    description:
      "Compiles a renewal risk briefing from product usage, support history, and the last three executive touchpoints.",
    content:
      "Tools: usage.query, support.history, crm.read_account.\nFor account {{account_id}}, assemble a renewal risk briefing 45 days before the renewal date.\nCall out usage decline, unresolved escalations, champion turnover, and the last three executive touchpoints.\nEnd with a single risk verdict: green, amber, or red.",
    inputs: ["account_id"],
    outputs: ["risk_briefing", "verdict"],
    tags: ["renewal", "churn", "customer-success"],
    createdDaysAgo: 98,
    runs: 38,
    successRate: 0.92,
    window: [0, 82],
    ratings: [5, 4],
  },
  {
    id: "art_call_notes",
    name: "Sales Call Notes Summarizer",
    type: "prompt",
    ownerId: "u_kenji",
    teamId: "team_revops",
    scope: "public",
    description:
      "Turns a raw sales call transcript into structured notes: attendees, pains raised, next steps, and owner.",
    content:
      "Summarise the sales call transcript {{transcript}}.\nReturn attendees with their roles, the pains they raised in their own words, agreed next steps with an owner and date, and any competitor mentioned.\nFlag anything the seller promised that needs internal approval.",
    inputs: ["transcript"],
    outputs: ["structured_notes", "next_steps"],
    tags: ["sales", "summarization", "calls", "notes"],
    createdDaysAgo: 175,
    runs: 84,
    successRate: 0.95,
    window: [0, 90],
    ratings: [5, 5, 4, 4],
  },
  {
    id: "art_pricing_approval",
    name: "Pricing Exception Approval Workflow",
    type: "workflow",
    ownerId: "u_dilan",
    teamId: "team_revops",
    scope: "restricted",
    description:
      "Routes non-standard discount requests through finance and legal approval with a full decision audit trail.",
    content:
      "Step 1: validate the requested discount against the approved discount matrix.\nStep 2: if the discount exceeds the threshold, route to finance, then to legal for any non-standard term.\nStep 3: record every approver, timestamp, and justification in the deal audit log.\nStep 4: notify the deal desk of the final decision.",
    inputs: ["opportunity_id", "requested_discount"],
    outputs: ["decision", "audit_trail"],
    tags: ["pricing", "approval", "finance", "confidential"],
    createdDaysAgo: 130,
    runs: 19,
    successRate: 0.95,
    window: [1, 78],
    ratings: [4],
  },

  // ---- Customer Support ---------------------------------------------------
  {
    id: "art_ticket_triage",
    name: "Support Ticket Triage Agent",
    type: "agent",
    ownerId: "u_marco",
    teamId: "team_support",
    scope: "public",
    certified: true,
    description:
      "Classifies an inbound support ticket by product area, severity, and routing queue, then applies the labels.",
    content:
      "Tools: ticket.read, ticket.label, queue.assign.\nClassify inbound ticket {{ticket_id}} by product area, severity, and destination queue.\nUse severity one only for total loss of service or a security incident.\nApply the labels and assign the queue, then leave an internal note explaining the classification.",
    inputs: ["ticket_id"],
    outputs: ["product_area", "severity", "queue"],
    tags: ["support", "triage", "routing", "classification"],
    createdDaysAgo: 195,
    runs: 118,
    successRate: 0.97,
    window: [0, 90],
    ratings: [5, 5, 5, 4],
  },
  {
    id: "art_macro_reply",
    name: "Support Macro Reply Drafter",
    type: "prompt",
    ownerId: "u_hana",
    teamId: "team_support",
    scope: "public",
    description:
      "Drafts a first-response reply to a customer ticket in the house tone, grounded in the linked help article.",
    content:
      "Draft a first response to ticket {{ticket_id}}.\nGround every factual claim in the linked help article {{article}}; if the article does not cover it, say so and escalate instead of guessing.\nUse plain language, acknowledge the impact in the first sentence, and give a concrete next step.",
    inputs: ["ticket_id", "article"],
    outputs: ["reply_draft"],
    tags: ["support", "reply", "writing", "first-response"],
    createdDaysAgo: 150,
    runs: 92,
    successRate: 0.94,
    window: [0, 89],
    ratings: [5, 4, 4, 5],
  },
  {
    id: "art_escalation_wf",
    name: "Escalation Handoff Workflow",
    type: "workflow",
    ownerId: "u_marco",
    teamId: "team_support",
    scope: "team",
    description:
      "Packages an escalating ticket for engineering with reproduction steps, impact, and customer commitments.",
    content:
      "Step 1: confirm the ticket meets the escalation bar (severity, customer tier, reproducibility).\nStep 2: assemble the handoff packet: reproduction steps, affected versions, business impact, and any commitment made to the customer.\nStep 3: open the engineering issue and link it to the ticket.\nStep 4: set the customer-facing update cadence.",
    inputs: ["ticket_id"],
    outputs: ["handoff_packet", "issue_link"],
    tags: ["escalation", "handoff", "engineering"],
    createdDaysAgo: 128,
    runs: 41,
    successRate: 0.9,
    window: [0, 84],
    ratings: [4, 4],
  },
  {
    id: "art_kb_gap",
    name: "Knowledge Base Gap Finder",
    type: "skill",
    ownerId: "u_hana",
    teamId: "team_support",
    scope: "public",
    description:
      "Clusters recent tickets against the help centre to find the topics customers ask about but nobody documented.",
    content:
      "Cluster the last {{window_days}} days of tickets by intent.\nMatch each cluster against the help centre index.\nReturn the clusters with no adequate article, ranked by ticket volume and average handling time, with a suggested article title for each.",
    inputs: ["window_days"],
    outputs: ["gap_report"],
    tags: ["knowledge", "documentation", "analysis"],
    createdDaysAgo: 112,
    runs: 22,
    successRate: 0.91,
    window: [4, 80],
    ratings: [4, 5],
  },
  {
    id: "art_sentiment_watch",
    name: "Customer Sentiment Watchdog",
    type: "agent",
    ownerId: "u_hana",
    teamId: "team_support",
    scope: "team",
    description:
      "Monitors open conversations for frustration signals and alerts the owning agent before the customer churns.",
    content:
      "Tools: conversation.stream, alert.send.\nWatch open conversations for frustration signals: repeated follow-ups, escalation language, and long silences after a promise.\nWhen the signal crosses the threshold, alert the owning agent with the specific quotes that triggered it.",
    inputs: ["queue_id"],
    outputs: ["alerts"],
    tags: ["sentiment", "csat", "monitoring"],
    createdDaysAgo: 88,
    runs: 29,
    successRate: 0.86,
    window: [1, 80],
    ratings: [4, 3],
  },
  {
    id: "art_rca_writer",
    name: "Incident RCA Draft Writer",
    type: "prompt",
    ownerId: "u_marco",
    teamId: "team_support",
    scope: "public",
    description:
      "Writes a customer-ready root cause analysis from the incident timeline, avoiding internal jargon and blame.",
    content:
      "Using the incident timeline {{timeline}}, write a customer-facing root cause analysis.\nCover impact window, what happened, why it happened, and what changes prevent a recurrence.\nNo internal service names, no blame, no speculation beyond the evidence in the timeline.",
    inputs: ["timeline"],
    outputs: ["rca_document"],
    tags: ["incident", "rca", "writing", "postmortem"],
    createdDaysAgo: 102,
    runs: 24,
    successRate: 0.93,
    window: [2, 76],
    ratings: [5, 4],
  },
  {
    id: "art_refund_policy",
    name: "Refund Eligibility Checker",
    type: "skill",
    ownerId: "u_marco",
    teamId: "team_support",
    scope: "restricted",
    description:
      "Evaluates a refund request against contract terms and the goodwill budget, returning an auditable decision.",
    content:
      "Evaluate refund request {{request_id}} against the contract terms, the published refund policy, and the remaining goodwill budget for the account.\nReturn approve, deny, or escalate, with the specific clause that decided it.\nNever approve beyond the remaining goodwill budget.",
    inputs: ["request_id"],
    outputs: ["decision", "clause_reference"],
    tags: ["refund", "policy", "finance", "confidential"],
    createdDaysAgo: 118,
    runs: 17,
    successRate: 0.94,
    window: [3, 74],
    ratings: [4],
  },

  // ---- Platform Engineering ----------------------------------------------
  {
    id: "art_code_review",
    name: "Pull Request Review Agent",
    type: "agent",
    ownerId: "u_tomas",
    teamId: "team_platform",
    scope: "public",
    certified: true,
    description:
      "Reviews a pull request diff for correctness, security, and test coverage, then posts inline review comments.",
    content:
      "Tools: git.read_diff, github.post_review_comment.\nReview the pull request diff for correctness bugs, security issues, and missing test coverage.\nPost inline comments only where the change is genuinely wrong or risky; do not comment on style the formatter already handles.\nFinish with a short summary verdict.",
    inputs: ["pull_request_url"],
    outputs: ["review_comments", "verdict"],
    tags: ["code", "review", "github", "quality"],
    createdDaysAgo: 220,
    runs: 134,
    successRate: 0.95,
    window: [0, 90],
    ratings: [5, 5, 5, 4, 5],
  },
  {
    id: "art_test_gen",
    name: "Unit Test Generator",
    type: "skill",
    ownerId: "u_tomas",
    teamId: "team_platform",
    scope: "public",
    description:
      "Generates unit tests for a changed function, covering the happy path, boundaries, and documented failure modes.",
    content:
      "For the function {{function_name}} in {{file_path}}, generate unit tests in the project's existing test framework.\nCover the happy path, boundary values, and every documented failure mode.\nUse the fixtures already present in the test directory rather than inventing new ones.",
    inputs: ["function_name", "file_path"],
    outputs: ["test_file"],
    tags: ["code", "testing", "quality"],
    createdDaysAgo: 168,
    runs: 77,
    successRate: 0.9,
    window: [0, 88],
    ratings: [4, 5, 4],
  },
  {
    id: "art_etl_repair",
    name: "ETL Failure Diagnosis Workflow",
    type: "workflow",
    ownerId: "u_selin",
    teamId: "team_platform",
    scope: "team",
    description:
      "Diagnoses a failed nightly ETL run, isolates the offending partition, and proposes a safe backfill plan.",
    content:
      "Step 1: fetch the failed run's logs and the upstream freshness checks.\nStep 2: isolate the offending partition and classify the failure as schema drift, late data, or resource exhaustion.\nStep 3: propose a backfill plan with the blast radius stated explicitly.\nStep 4: never execute the backfill without human approval.",
    inputs: ["run_id"],
    outputs: ["diagnosis", "backfill_plan"],
    tags: ["etl", "data", "pipeline", "operations"],
    createdDaysAgo: 145,
    runs: 48,
    successRate: 0.87,
    window: [0, 86],
    ratings: [4, 4, 5],
  },
  {
    id: "art_schema_doc",
    name: "Warehouse Schema Documenter",
    type: "skill",
    ownerId: "u_selin",
    teamId: "team_platform",
    scope: "public",
    description:
      "Documents warehouse tables from DDL and query history, inferring column meaning and ownership.",
    content:
      "For the warehouse schema {{schema}}, read the DDL and the last 30 days of query history.\nDocument every table: its grain, the meaning of each column, the most common join keys, and the team that queries it most.\nMark any column that looks like personal data.",
    inputs: ["schema"],
    outputs: ["schema_docs"],
    tags: ["data", "documentation", "warehouse", "schema"],
    createdDaysAgo: 133,
    runs: 31,
    successRate: 0.92,
    window: [2, 82],
    ratings: [5, 4],
  },
  {
    id: "art_incident_cmd",
    name: "Incident Commander Agent",
    type: "agent",
    ownerId: "u_tomas",
    teamId: "team_platform",
    scope: "team",
    description:
      "Runs the mechanics of an active incident: opens the channel, tracks the timeline, and drives status updates.",
    content:
      "Tools: pager.read, chat.create_channel, status.publish.\nOn a new page, open the incident channel, post the current severity and impact, and start the timeline.\nPrompt for a status update every 20 minutes until resolution.\nNever change production state; you coordinate humans, you do not remediate.",
    inputs: ["incident_id"],
    outputs: ["timeline", "status_updates"],
    tags: ["incident", "oncall", "operations", "coordination"],
    createdDaysAgo: 115,
    runs: 36,
    successRate: 0.89,
    window: [0, 84],
    ratings: [5, 4, 4],
  },
  {
    id: "art_migration_plan",
    name: "Service Migration Planner",
    type: "workflow",
    ownerId: "u_amara",
    teamId: "team_platform",
    scope: "team",
    description:
      "Produces a phased migration plan for moving a service between environments, with rollback at every phase.",
    content:
      "Step 1: inventory the service's dependencies, data stores, and traffic sources.\nStep 2: propose a phased cutover with an explicit rollback for each phase.\nStep 3: identify the irreversible step and the point of no return.\nStep 4: produce the communication plan for dependent teams.",
    inputs: ["service_name", "target_environment"],
    outputs: ["migration_plan", "rollback_plan"],
    tags: ["migration", "planning", "infrastructure"],
    createdDaysAgo: 96,
    runs: 14,
    successRate: 0.93,
    window: [5, 70],
    ratings: [4],
  },
  {
    id: "art_secret_scan",
    name: "Secret Leak Scanner",
    type: "skill",
    ownerId: "u_amara",
    teamId: "team_platform",
    scope: "restricted",
    description:
      "Scans a repository's history for credentials and reports exposure without echoing the secret values.",
    content:
      "Scan the repository history for credentials, API keys, and private key material.\nReport the file, commit, and author for each finding, and the rotation owner.\nNever print the secret value itself, not even partially, in any output or log.",
    inputs: ["repository"],
    outputs: ["findings", "rotation_owners"],
    tags: ["security", "secrets", "compliance", "confidential"],
    createdDaysAgo: 104,
    runs: 21,
    successRate: 0.96,
    window: [1, 72],
    ratings: [5, 5],
  },
  {
    id: "art_meeting_summary",
    name: "Meeting Summary Composer",
    type: "prompt",
    ownerId: "u_amara",
    teamId: "team_platform",
    scope: "public",
    certified: true,
    description:
      "Condenses a meeting transcript into decisions, owners, and open questions, separating agreement from debate.",
    content:
      "Condense the meeting transcript {{transcript}} into three sections: decisions made, action items with an owner and a due date, and open questions.\nSeparate what was agreed from what was merely discussed.\nIf a decision has no owner, list it as an open question instead.",
    inputs: ["transcript"],
    outputs: ["decisions", "action_items", "open_questions"],
    tags: ["summarization", "meetings", "productivity"],
    createdDaysAgo: 185,
    runs: 103,
    successRate: 0.96,
    window: [0, 90],
    ratings: [5, 5, 4, 5],
  },
  {
    id: "art_sql_optimizer",
    name: "SQL Query Optimizer",
    type: "skill",
    ownerId: "u_selin",
    teamId: "team_platform",
    scope: "public",
    description:
      "Rewrites an expensive warehouse query for cost, explaining each rewrite against the execution plan.",
    content:
      "Given the query {{query}} and its execution plan, propose a cheaper rewrite.\nExplain each change against the plan: partition pruning, join order, predicate pushdown, or materialisation.\nThe rewrite must return identical rows; prove it or do not propose it.",
    inputs: ["query", "execution_plan"],
    outputs: ["optimized_query", "explanation"],
    tags: ["sql", "performance", "data", "cost"],
    createdDaysAgo: 122,
    runs: 39,
    successRate: 0.91,
    window: [0, 80],
    ratings: [5, 4, 4],
  },

  // ---- Forks: lineage two and three levels deep ---------------------------
  {
    id: "art_outreach_email_emea",
    name: "Enterprise Outreach Email Writer (EMEA)",
    type: "prompt",
    ownerId: "u_priya",
    teamId: "team_revops",
    scope: "public",
    parentId: "art_outreach_email",
    description:
      "EMEA adaptation of the outreach writer: regional compliance footer and a more formal register.",
    content:
      "You are an enterprise sales writer covering EMEA. Draft a short outreach email to {{prospect_name}}, a {{role}} at {{company}} in the {{industry}} industry.\nReference the trigger event {{trigger}} in the opening line.\nUse a formal register, keep it under 120 words, and append the regional privacy footer required for EMEA recipients.",
    inputs: ["prospect_name", "role", "company", "industry", "trigger"],
    outputs: ["subject_line", "email_body"],
    tags: ["sales", "outreach", "email", "emea"],
    createdDaysAgo: 92,
    runs: 52,
    successRate: 0.94,
    window: [0, 85],
    ratings: [5, 4, 4],
  },
  {
    id: "art_outreach_email_emea_de",
    name: "Enterprise Outreach Email Writer (EMEA, German)",
    type: "prompt",
    ownerId: "u_priya",
    teamId: "team_revops",
    scope: "public",
    parentId: "art_outreach_email_emea",
    description:
      "German-language variant of the EMEA outreach writer, using the formal Sie register throughout.",
    content:
      "You are an enterprise sales writer covering the DACH region. Draft a short outreach email in German to {{prospect_name}}, a {{role}} at {{company}} in the {{industry}} industry.\nReference the trigger event {{trigger}} in the opening line.\nUse the formal Sie register, keep it under 120 words, and append the regional privacy footer required for EMEA recipients.",
    inputs: ["prospect_name", "role", "company", "industry", "trigger"],
    outputs: ["subject_line", "email_body"],
    tags: ["sales", "outreach", "email", "dach", "german"],
    createdDaysAgo: 54,
    runs: 23,
    successRate: 0.93,
    window: [0, 50],
    ratings: [4, 4],
  },
  {
    id: "art_ticket_triage_tier2",
    name: "Support Ticket Triage Agent (Tier 2)",
    type: "agent",
    ownerId: "u_hana",
    teamId: "team_support",
    scope: "public",
    parentId: "art_ticket_triage",
    description:
      "Tier 2 adaptation of the triage agent, adding reproduction checks before anything reaches engineering.",
    content:
      "Tools: ticket.read, ticket.label, queue.assign, repro.run.\nClassify inbound ticket {{ticket_id}} by product area, severity, and destination queue.\nBefore routing anything to engineering, attempt the documented reproduction and attach the result.\nApply the labels and assign the queue, then leave an internal note explaining the classification.",
    inputs: ["ticket_id"],
    outputs: ["product_area", "severity", "queue", "repro_result"],
    tags: ["support", "triage", "tier2", "reproduction"],
    createdDaysAgo: 86,
    runs: 61,
    successRate: 0.93,
    window: [0, 82],
    ratings: [5, 4, 4],
  },
  {
    id: "art_ticket_triage_billing",
    name: "Support Ticket Triage Agent (Billing)",
    type: "agent",
    ownerId: "u_marco",
    teamId: "team_support",
    scope: "team",
    parentId: "art_ticket_triage_tier2",
    description:
      "Billing-specific triage variant that checks invoice state before assigning a severity.",
    content:
      "Tools: ticket.read, ticket.label, queue.assign, billing.read_invoice.\nClassify inbound billing ticket {{ticket_id}} by product area, severity, and destination queue.\nCheck the invoice state and dunning status before assigning severity; a failed payment is never severity one.\nApply the labels and assign the queue, then leave an internal note explaining the classification.",
    inputs: ["ticket_id"],
    outputs: ["product_area", "severity", "queue"],
    tags: ["support", "triage", "billing"],
    createdDaysAgo: 41,
    runs: 27,
    successRate: 0.92,
    window: [0, 38],
    ratings: [4],
  },
  {
    id: "art_code_review_python",
    name: "Pull Request Review Agent (Python)",
    type: "agent",
    ownerId: "u_selin",
    teamId: "team_platform",
    scope: "public",
    parentId: "art_code_review",
    description:
      "Python-focused review agent that also enforces type hints and the project's dependency policy.",
    content:
      "Tools: git.read_diff, github.post_review_comment.\nReview the Python pull request diff for correctness bugs, security issues, and missing test coverage.\nAlso require type hints on public functions and reject any new dependency not on the approved list.\nPost inline comments only where the change is genuinely wrong or risky.",
    inputs: ["pull_request_url"],
    outputs: ["review_comments", "verdict"],
    tags: ["code", "review", "python", "quality"],
    createdDaysAgo: 78,
    runs: 58,
    successRate: 0.94,
    window: [0, 76],
    ratings: [5, 4, 5],
  },
  {
    id: "art_code_review_python_dbt",
    name: "Pull Request Review Agent (dbt models)",
    type: "agent",
    ownerId: "u_selin",
    teamId: "team_platform",
    scope: "team",
    parentId: "art_code_review_python",
    description:
      "Adapts the Python review agent for dbt model changes, checking tests, materialisation, and lineage impact.",
    content:
      "Tools: git.read_diff, github.post_review_comment, warehouse.lineage.\nReview the dbt model diff for correctness, missing tests, and materialisation choice.\nCheck the downstream lineage and name every dashboard the change could break.\nPost inline comments only where the change is genuinely wrong or risky.",
    inputs: ["pull_request_url"],
    outputs: ["review_comments", "lineage_impact"],
    tags: ["code", "review", "dbt", "data"],
    createdDaysAgo: 35,
    runs: 19,
    successRate: 0.9,
    window: [0, 33],
    ratings: [4, 4],
  },
  {
    id: "art_meeting_summary_exec",
    name: "Meeting Summary Composer (Executive Brief)",
    type: "prompt",
    ownerId: "u_dilan",
    teamId: "team_revops",
    scope: "public",
    parentId: "art_meeting_summary",
    description:
      "Executive variant of the meeting summariser: five bullets, decisions and money only.",
    content:
      "Condense the meeting transcript {{transcript}} into an executive brief of at most five bullets.\nKeep only decisions, commitments with a financial impact, and risks that need an executive to unblock them.\nDrop process detail entirely. If nothing was decided, say so in one line.",
    inputs: ["transcript"],
    outputs: ["executive_brief"],
    tags: ["summarization", "meetings", "executive"],
    createdDaysAgo: 64,
    runs: 44,
    successRate: 0.95,
    window: [0, 60],
    ratings: [5, 5, 4],
  },
  {
    id: "art_call_notes_qbr",
    name: "Sales Call Notes Summarizer (QBR)",
    type: "prompt",
    ownerId: "u_priya",
    teamId: "team_revops",
    scope: "public",
    parentId: "art_call_notes",
    description:
      "QBR variant of the call summariser, mapping discussion back to the account's success plan.",
    content:
      "Summarise the quarterly business review transcript {{transcript}}.\nReturn attendees with their roles, progress against each success-plan milestone, agreed next steps with an owner and date, and expansion signals.\nFlag any commitment that needs internal approval.",
    inputs: ["transcript", "success_plan"],
    outputs: ["structured_notes", "expansion_signals"],
    tags: ["sales", "summarization", "qbr", "customer-success"],
    createdDaysAgo: 58,
    runs: 30,
    successRate: 0.93,
    window: [0, 55],
    ratings: [4, 5],
  },

  // ---- Independently recreated near-duplicates ---------------------------
  {
    id: "art_cold_email_v2",
    name: "Cold Outreach Email Generator",
    type: "prompt",
    ownerId: "u_priya",
    teamId: "team_revops",
    scope: "public",
    description:
      "Generates a personalised cold outreach email for an enterprise prospect from their industry, role, and a recent trigger event.",
    content:
      "You are an enterprise sales writer. Generate a short outreach email to {{prospect_name}}, a {{role}} at {{company}} in the {{industry}} industry.\nReference the trigger event {{trigger}} in the opening line.\nKeep it under 120 words, lead with the business outcome, avoid superlatives, and finish with a single specific call to action.",
    inputs: ["prospect_name", "role", "company", "industry", "trigger"],
    outputs: ["subject_line", "email_body"],
    tags: ["sales", "outreach", "email", "cold-email"],
    createdDaysAgo: 47,
    runs: 12,
    successRate: 0.9,
    window: [1, 44],
    ratings: [3, 4],
  },
  {
    id: "art_ticket_router",
    name: "Inbound Ticket Classification Agent",
    type: "agent",
    ownerId: "u_hana",
    teamId: "team_support",
    scope: "public",
    description:
      "Classifies an inbound support ticket by product area, severity, and routing queue, then applies the labels.",
    content:
      "Tools: ticket.read, ticket.label, queue.assign.\nClassify the inbound ticket {{ticket_id}} by product area, severity, and destination queue.\nUse severity one only for a total loss of service or a security incident.\nApply the labels and assign the queue, then leave an internal note explaining the classification.",
    inputs: ["ticket_id"],
    outputs: ["product_area", "severity", "queue"],
    tags: ["support", "classification", "routing"],
    createdDaysAgo: 44,
    runs: 9,
    successRate: 0.89,
    window: [2, 40],
    ratings: [3],
  },
  {
    id: "art_review_assistant",
    name: "Code Review Assistant",
    type: "agent",
    ownerId: "u_tomas",
    teamId: "team_platform",
    scope: "public",
    description:
      "Reviews a pull request diff for correctness, security, and test coverage, then posts inline review comments.",
    content:
      "Tools: git.read_diff, github.post_review_comment.\nReview the pull request diff for correctness bugs, security problems, and missing test coverage.\nPost inline comments only where the change is genuinely wrong or risky; do not comment on style the formatter already handles.\nFinish with a short summary verdict.",
    inputs: ["pull_request_url"],
    outputs: ["review_comments", "verdict"],
    tags: ["code", "review", "assistant"],
    createdDaysAgo: 39,
    runs: 7,
    successRate: 0.86,
    window: [3, 36],
    ratings: [3],
  },

  // ---- Abandoned capabilities --------------------------------------------
  {
    id: "art_nps_digest",
    name: "NPS Verbatim Digest",
    type: "workflow",
    ownerId: "u_marco",
    teamId: "team_support",
    scope: "team",
    description:
      "Monthly digest that clusters NPS verbatims into themes and tracks each theme's movement quarter over quarter.",
    content:
      "Step 1: pull the month's NPS responses with their verbatim comments.\nStep 2: cluster the verbatims into themes and score each theme's sentiment.\nStep 3: compare theme volume against the previous quarter.\nStep 4: publish the digest to the voice-of-customer channel.",
    inputs: ["month"],
    outputs: ["nps_digest"],
    tags: ["nps", "voice-of-customer", "reporting"],
    createdDaysAgo: 240,
    runs: 8,
    successRate: 0.88,
    window: [96, 150],
    ratings: [3],
  },
  {
    id: "art_webinar_followup",
    name: "Webinar Follow-up Sequence",
    type: "workflow",
    ownerId: "u_kenji",
    teamId: "team_revops",
    scope: "public",
    description:
      "Builds a three-touch follow-up sequence for webinar attendees, branching on how much of the session they watched.",
    content:
      "Step 1: split registrants into attended, partially attended, and no-show.\nStep 2: build a three-touch email sequence for each branch.\nStep 3: attach the session recording and the most relevant asset per branch.\nStep 4: schedule the sends across the following ten working days.",
    inputs: ["webinar_id"],
    outputs: ["email_sequence"],
    tags: ["marketing", "webinar", "nurture"],
    createdDaysAgo: 200,
    runs: 15,
    successRate: 0.87,
    window: [92, 160],
    ratings: [3, 4],
  },
  {
    id: "art_legacy_crm_sync",
    name: "Legacy CRM Sync Workflow",
    type: "workflow",
    ownerId: "u_dilan",
    teamId: "team_revops",
    scope: "team",
    description:
      "Nightly reconciliation between the legacy CRM and the warehouse, retired when the platform was consolidated.",
    content:
      "Step 1: extract account and opportunity deltas from the legacy CRM.\nStep 2: reconcile identifiers against the warehouse dimension tables.\nStep 3: write mismatches to the exception queue for manual review.\nStep 4: emit a completion metric for the nightly job.",
    inputs: ["run_date"],
    outputs: ["reconciliation_report"],
    tags: ["crm", "sync", "legacy", "reconciliation"],
    createdDaysAgo: 260,
    runs: 0,
    successRate: 1,
    window: [0, 0],
    ratings: [],
  },
  {
    id: "art_deck_outline",
    name: "Deck Outline Generator",
    type: "skill",
    ownerId: "u_kenji",
    teamId: "team_revops",
    scope: "public",
    description:
      "Drafts a slide-by-slide outline for a customer presentation from a meeting objective and audience seniority.",
    content:
      "Given the objective {{objective}} and the audience seniority {{audience}}, draft a slide-by-slide outline.\nOne message per slide, stated as a full sentence.\nCap the deck at twelve slides and mark which three slides carry the argument if time runs short.",
    inputs: ["objective", "audience"],
    outputs: ["slide_outline"],
    tags: ["presentation", "enablement", "writing"],
    createdDaysAgo: 190,
    runs: 11,
    successRate: 0.91,
    window: [100, 170],
    ratings: [4],
  },

  // ---- Unreliable ---------------------------------------------------------
  {
    id: "art_invoice_extract",
    name: "Invoice Field Extractor",
    type: "skill",
    ownerId: "u_selin",
    teamId: "team_platform",
    scope: "public",
    description:
      "Extracts line items, totals, and tax fields from supplier invoice PDFs into a structured record.",
    content:
      "Extract line items, subtotal, tax, and total from the supplier invoice at {{document_url}}.\nReturn a structured record with one row per line item and the currency code.\nIf a field is illegible, return null for it rather than guessing a value.",
    inputs: ["document_url"],
    outputs: ["line_items", "totals"],
    tags: ["extraction", "invoice", "documents", "finance"],
    createdDaysAgo: 84,
    runs: 26,
    successRate: 0.38,
    window: [0, 80],
    ratings: [2, 2, 3],
  },
];
