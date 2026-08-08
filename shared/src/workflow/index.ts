import { HTTP_STATUS } from '../constants';
import { AppError } from '../errors';

/**
 * Thrown when a requested workflow transition is illegal for the current
 * state / actor. Carries a 422 (Unprocessable) status because the request is
 * well-formed but violates the workflow's business rules.
 */
export class WorkflowError extends AppError {
  constructor(message: string) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, 'WORKFLOW_ERROR');
  }
}

export interface WorkflowTransitionRule<TStatus extends string, TAction extends string> {
  /** Logical action performed by this transition (e.g. ASSIGN, APPROVE). */
  action: TAction;
  from: TStatus;
  to: TStatus;
  /**
   * Roles allowed to perform this transition. Empty array means any
   * authenticated role.
   */
  roles: string[];
  /** Short human-readable label describing the transition. */
  label?: string;
}

/**
 * WorkflowEngine — a reusable, domain-agnostic state machine.
 *
 * Configure once per domain (e.g. connection applications) with an explicit
 * list of legal transitions. The engine guarantees:
 *
 *  - Illegal transitions are rejected (`assertTransition` throws).
 *  - Role-gating is enforced per transition.
 *  - The full set of allowed transitions can be queried for UIs, validation
 *    endpoints and documentation.
 *
 * The engine is pure (no I/O) so it is trivially testable and shareable.
 */
export class WorkflowEngine<TStatus extends string, TAction extends string> {
  private readonly byFrom: Map<TStatus, WorkflowTransitionRule<TStatus, TAction>[]>;
  private readonly byPair: Map<string, WorkflowTransitionRule<TStatus, TAction>>;
  private readonly all: WorkflowTransitionRule<TStatus, TAction>[];

  constructor(rules: WorkflowTransitionRule<TStatus, TAction>[]) {
    this.all = [...rules];
    this.byFrom = new Map();
    this.byPair = new Map();

    for (const rule of rules) {
      const list = this.byFrom.get(rule.from) ?? [];
      list.push(rule);
      this.byFrom.set(rule.from, list);

      const key = this.pairKey(rule.from, rule.to);
      if (this.byPair.has(key)) {
        throw new Error(`WorkflowEngine: duplicate transition ${rule.from} -> ${rule.to}`);
      }
      this.byPair.set(key, rule);
    }
  }

  private pairKey(from: TStatus, to: TStatus): string {
    return `${from}->${to}`;
  }

  /** Returns the transition rule for a from/to pair, if one is configured. */
  public findTransition(from: TStatus, to: TStatus): WorkflowTransitionRule<TStatus, TAction> | undefined {
    return this.byPair.get(this.pairKey(from, to));
  }

  /** True when the from/to pair is a configured, legal transition. */
  public canTransition(from: TStatus, to: TStatus): boolean {
    return this.findTransition(from, to) !== undefined;
  }

  /**
   * Validates a transition and returns its rule, or throws a WorkflowError.
   * `role` is optional — when provided, the actor role is also checked.
   */
  public assertTransition(from: TStatus, to: TStatus, role?: string): WorkflowTransitionRule<TStatus, TAction> {
    const rule = this.findTransition(from, to);
    if (!rule) {
      throw new WorkflowError(`Illegal workflow transition: ${from} -> ${to} is not allowed`);
    }
    if (role && rule.roles.length > 0 && !rule.roles.includes(role)) {
      throw new WorkflowError(`Role ${role} is not permitted to perform transition ${from} -> ${to}`);
    }
    return rule;
  }

  /** All transitions permitted from a given state (optionally for a role). */
  public getAllowedTransitions(from: TStatus, role?: string): WorkflowTransitionRule<TStatus, TAction>[] {
    const list = this.byFrom.get(from) ?? [];
    if (!role) return [...list];
    return list.filter((r) => r.roles.length === 0 || r.roles.includes(role));
  }

  /** True when the state has no configured outgoing transitions. */
  public isTerminal(from: TStatus): boolean {
    return (this.byFrom.get(from)?.length ?? 0) === 0;
  }

  /** All configured transitions (for documentation / validation endpoints). */
  public getAll(): WorkflowTransitionRule<TStatus, TAction>[] {
    return [...this.all];
  }
}
