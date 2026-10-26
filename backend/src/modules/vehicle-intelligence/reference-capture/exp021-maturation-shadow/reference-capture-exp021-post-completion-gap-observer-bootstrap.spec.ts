import { Exp021PostCompletionGapObserverModule } from './reference-capture-exp021-post-completion-gap-observer.module';
import { assertExp021GapObserverSlimBootstrap } from './reference-capture-exp021-post-completion-gap-observer-bootstrap.lib';

describe('Exp021 post-completion gap observer bootstrap', () => {
  it('uses slim module without AppModule / Workers / scheduler leader', () => {
    const report = assertExp021GapObserverSlimBootstrap();
    expect(report.OBSERVER_IMPORTS_APP_MODULE).toBe('NO');
    expect(report.OBSERVER_IMPORTS_WORKERS_MODULE).toBe('NO');
    expect(report.OBSERVER_IMPORTS_SCHEDULER_LEADER_ELECTION).toBe('NO');
    expect(report.OBSERVER_CAN_ACQUIRE_GLOBAL_SCHEDULER_LEASE).toBe('NO');
    expect(report.rootModule).toBe(Exp021PostCompletionGapObserverModule.name);
  });

  it('slim module metadata does not reference forbidden modules', () => {
    const source = Exp021PostCompletionGapObserverModule.toString();
    expect(source).not.toContain('AppModule');
    expect(source).not.toContain('WorkersModule');
    expect(source).not.toContain('SchedulerLeaderElectionModule');
    expect(source).not.toContain('WorkersModule');
    expect(source).not.toContain('AppModule');
  });
});
