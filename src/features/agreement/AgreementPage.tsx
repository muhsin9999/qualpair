import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Cloud, Laptop } from 'lucide-react';
import { codeColor, usePid, useProject } from '../../app/hooks';
import { studyStats } from '../../app/stats';
import { Empty, PageHead } from '../../app/ui';
import { agreementByCode, type CodeAgreement } from '../../services/results';
import { formatKappa, kappaBand } from '../../domain/stats/agreement';

function KBar({ k, threshold, color }: { k: number | null; threshold: number; color: string }) {
  const v = k === null ? 0 : Math.max(0, k);
  const pass = k !== null && k >= threshold;
  return (
    <div className="row" style={{ gap: 10, flex: 1 }}>
      <div className="kbar">
        <i style={{ width: `${v * 100}%`, background: pass ? color : 'var(--attn)' }} />
        <b style={{ left: `${threshold * 100}%` }} title={`Pass mark ${threshold}`} />
      </div>
      <span style={{ width: 132, fontSize: 13, fontWeight: 700, color: k === null ? 'var(--ink3)' : pass ? 'var(--ink)' : 'var(--attn)' }}>
        {formatKappa(k)} <span style={{ fontWeight: 500 }}>{k === null ? 'not enough data' : kappaBand(k)}</span>
      </span>
    </div>
  );
}

function status(c: CodeAgreement, t: number) {
  const l = c.laptop?.kappa ?? null;
  const cl = c.cloud?.kappa ?? null;
  if (l === null && cl === null) return null;
  const lb = l !== null && l < t;
  const cb = cl !== null && cl < t;
  if (lb && cb) return 'Both below';
  if (lb) return 'Laptop below';
  if (cb) return 'Cloud below';
  return null;
}

export default function AgreementPage() {
  const pid = usePid();
  const navigate = useNavigate();
  const project = useProject(pid);
  const ag = useLiveQuery(() => agreementByCode(pid), [pid]);
  const s = useLiveQuery(() => studyStats(pid), [pid]);
  if (!project || !ag || !s) return null;
  const scored = ag.codes.filter((c) => c.laptop || c.cloud);
  const passing = scored.filter((c) => c.passes).length;
  const t = ag.threshold;
  const sorted = ag.codes.slice().sort((a, b) => (Math.min(a.laptop?.kappa ?? 1, a.cloud?.kappa ?? 1)) - (Math.min(b.laptop?.kappa ?? 1, b.cloud?.kappa ?? 1)));

  return (
    <>
      <PageHead title="Agreement" sub="How often each reader agrees with your sample, code by code">
        {s.open > 0 && <Link className="btn primary" to="../review"><ArrowRight size={16} /> Review {s.open} disagreements</Link>}
      </PageHead>
      <div className="work col">
        {!ag.humanDone ? (
          <Empty action={<Link className="btn primary" to="../sample">Code your sample</Link>}>Code your sample first. The readers are scored against it.</Empty>
        ) : !scored.length ? (
          <Empty action={<Link className="btn primary" to="../laptop">Open the laptop reader</Link>}>Run at least one reader to see agreement.</Empty>
        ) : (
          <>
            <div>
              <div className="row" style={{ alignItems: 'baseline' }}><span className="big">{passing} of {ag.codes.length}</span><span className="muted" style={{ fontSize: 16 }}>codes reach the pass mark</span></div>
              <div className="small faint" style={{ marginTop: 4 }}>
                Cohen’s κ on the {ag.humanDone} paragraphs you coded yourself · pass mark {t.toFixed(2)}, set before the readers ran · 0.61–0.80 = substantial
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th title="Paragraphs in your sample where you applied this code">You used it</th>
                    <th><span className="row laptop" style={{ gap: 6 }}><Laptop size={13} /> Laptop reader vs you</span></th>
                    <th><span className="row cloud" style={{ gap: 6 }}><Cloud size={13} /> Cloud reader vs you</span></th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const st = status(c, t);
                    return (
                      <tr key={c.code.id} className="click" onClick={() => navigate(c.code.id)}>
                        <td><span className="row" style={{ fontWeight: 600 }}><span className="cbar" style={{ background: codeColor(c.code) }} />{c.code.name}</span></td>
                        <td className="muted">{c.humanApplied} of {ag.humanDone}</td>
                        <td><KBar k={c.laptop?.kappa ?? null} threshold={t} color="var(--laptop)" /></td>
                        <td><KBar k={c.cloud?.kappa ?? null} threshold={t} color="var(--cloud)" /></td>
                        <td style={{ width: 150 }}>
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            {st && <span className="pill attn">{st}</span>}
                            <ChevronRight size={16} color="var(--ink3)" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="small faint">
              κ is “—” when a code was never (or always) used in your sample, so agreement can’t be measured. Codes below the pass mark are left out of the report until their definition is clearer.
            </div>
          </>
        )}
      </div>
    </>
  );
}
