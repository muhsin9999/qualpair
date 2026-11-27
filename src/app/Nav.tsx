import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Activity, BookOpen, ChevronsUpDown, Cloud, EyeOff, Files, GitCompareArrows, LayoutDashboard, Laptop, Scale, FileChartColumn, UserRound,
} from 'lucide-react';
import { db } from '../db/db';
import { practiceMode, setPracticeMode } from '../ai/registry';
import { usePid, useProject } from './hooks';
import { studyStats } from './stats';
import { Logo } from './Logo';
import { confirmBox } from './Confirm';

function pct(done: number, total: number) {
  if (!total) return '';
  if (done >= total) return '✓';
  return `${Math.floor((done / total) * 100)}%`;
}

/** Shown while practice readers (keyword rules, no AI) are on, with a way back to the real readers. */
export function PracticeFlag() {
  return (
    <div className="practice-flag" title="Readers use keyword rules, not AI">
      <span>Practice readers · no AI</span>
      <button type="button" onClick={async () => { if (await confirmBox({ title: 'Use the real AI readers?', body: 'Practice readers will be turned off. The laptop reader will use Gemini Nano on this computer, and the cloud reader will use Gemini.', confirm: 'Turn off practice' })) { setPracticeMode(false); location.replace(location.pathname); } }}>Turn off</button>
    </div>
  );
}

export function Nav() {
  const pid = usePid();
  const project = useProject(pid);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);
  const s = useLiveQuery(() => studyStats(pid), [pid]);

  const item = (to: string, label: string, Icon: typeof Files, right?: string, rightClass = '') => (
    <NavLink to={to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <Icon size={16} />
      <span>{label}</span>
      {right ? <span className={`r ${rightClass}`}>{right}</span> : null}
    </NavLink>
  );
  const base = `/p/${pid}`;

  return (
    <nav className="nav" id="study-nav" aria-label="Study">
      <Link to="/" className="brand" title="QualPair home page" aria-label="QualPair home page">
        <Logo size={26} fontSize={18} />
      </Link>
      <div style={{ position: 'relative' }}>
        <button className="switcher" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <div className="nm">{project?.name ?? '…'}</div>
            <div className="mt">{s ? `${s.interviews} interview${s.interviews === 1 ? '' : 's'}` : ''}</div>
          </span>
          <ChevronsUpDown size={14} color="var(--ink3)" />
        </button>
        {open && (
          <div className="card lift" style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, marginTop: 4, padding: 6 }}>
            {projects?.map((p) => (
              <button key={p.id} className="nav-item" style={{ width: '100%', background: 'none', cursor: 'pointer' }} onClick={() => { setOpen(false); navigate(`/p/${p.id}`); }}>
                {p.name}
              </button>
            ))}
            <Link className="nav-item" to="/studies" onClick={() => setOpen(false)}>All studies…</Link>
          </div>
        )}
      </div>
      {practiceMode() && <PracticeFlag />}
      {item(base, 'Overview', LayoutDashboard)}
      <div className="nav-group">PREPARE</div>
      {item(`${base}/interviews`, 'Interviews', Files, s ? String(s.interviews) : '')}
      {item(`${base}/codebook`, 'Codebook', BookOpen, s ? String(s.codes) : '')}
      <div className="nav-group">CODING</div>
      {item(`${base}/sample`, 'Your sample', UserRound, s && s.sampleSize && s.sampleDone < s.sampleSize ? `${s.sampleDone}/${s.sampleSize}` : '')}
      {item(`${base}/laptop`, 'Laptop reader', Laptop, s ? pct(s.laptopDone, s.codable) : '')}
      {item(`${base}/access`, 'Access copies', EyeOff, s && s.interviews && s.approved < s.interviews ? `${s.approved}/${s.interviews}` : '')}
      {item(`${base}/cloud`, 'Cloud reader', Cloud, s ? pct(s.cloudDone, s.codable) : '')}
      <div className="nav-group">RESULTS</div>
      {item(`${base}/agreement`, 'Agreement', Scale)}
      {item(`${base}/review`, 'Disagreements', GitCompareArrows, s && s.open ? String(s.open) : '', 'attn')}
      {item(`${base}/report`, 'Report', FileChartColumn)}
      <div className="push" />
      <div className="nav-foot" />
      {item(`${base}/activity`, 'AI activity', Activity, s ? String(s.ledger) : '')}
    </nav>
  );
}
