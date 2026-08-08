import { describe, it, expect } from 'vitest';
import { WorkflowEngine, WorkflowError } from '../src/workflow/index';

enum State {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

enum Action {
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

const rules = [
  { action: Action.SUBMIT, from: State.DRAFT, to: State.SUBMITTED, roles: ['CONSUMER'] },
  { action: Action.APPROVE, from: State.SUBMITTED, to: State.APPROVED, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { action: Action.REJECT, from: State.SUBMITTED, to: State.REJECTED, roles: ['ADMIN'] },
];

const engine = new WorkflowEngine<State, Action>(rules);

describe('WorkflowEngine', () => {
  it('allows a configured transition', () => {
    expect(engine.canTransition(State.DRAFT, State.SUBMITTED)).toBe(true);
    expect(() => engine.assertTransition(State.DRAFT, State.SUBMITTED)).not.toThrow();
  });

  it('rejects an illegal transition', () => {
    expect(engine.canTransition(State.DRAFT, State.APPROVED)).toBe(false);
    expect(() => engine.assertTransition(State.DRAFT, State.APPROVED)).toThrow(WorkflowError);
  });

  it('rejects role-gated transitions performed by unauthorized roles', () => {
    expect(() => engine.assertTransition(State.SUBMITTED, State.APPROVED, 'CONSUMER')).toThrow(WorkflowError);
    expect(() => engine.assertTransition(State.SUBMITTED, State.APPROVED, 'ADMIN')).not.toThrow();
    expect(() => engine.assertTransition(State.SUBMITTED, State.APPROVED, 'SUPER_ADMIN')).not.toThrow();
  });

  it('returns the allowed transitions from a state, filtered by role', () => {
    expect(engine.getAllowedTransitions(State.DRAFT)).toHaveLength(1);
    expect(engine.getAllowedTransitions(State.DRAFT, 'ADMIN')).toHaveLength(0);
    expect(engine.getAllowedTransitions(State.SUBMITTED, 'ADMIN').map((r) => r.action)).toEqual([
      Action.APPROVE,
      Action.REJECT,
    ]);
  });

  it('detects terminal states', () => {
    expect(engine.isTerminal(State.APPROVED)).toBe(true);
    expect(engine.isTerminal(State.REJECTED)).toBe(true);
    expect(engine.isTerminal(State.SUBMITTED)).toBe(false);
  });

  it('returns the transition rule for a valid pair', () => {
    const rule = engine.findTransition(State.DRAFT, State.SUBMITTED);
    expect(rule?.action).toBe(Action.SUBMIT);
    expect(engine.findTransition(State.DRAFT, State.REJECTED)).toBeUndefined();
  });

  it('throws WorkflowError with 422 status for illegal transitions', () => {
    try {
      engine.assertTransition(State.APPROVED, State.SUBMITTED);
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowError);
      expect((err as WorkflowError).statusCode).toBe(422);
      expect((err as WorkflowError).code).toBe('WORKFLOW_ERROR');
    }
  });

  it('rejects duplicate transition pairs at construction', () => {
    expect(
      () =>
        new WorkflowEngine([
          { action: Action.SUBMIT, from: State.DRAFT, to: State.SUBMITTED, roles: [] },
          { action: Action.SUBMIT, from: State.DRAFT, to: State.SUBMITTED, roles: [] },
        ]),
    ).toThrow(/duplicate transition/);
  });
});
