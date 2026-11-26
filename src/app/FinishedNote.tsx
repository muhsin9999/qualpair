import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { FINISHED_ID } from '../services/sample';

/** Explains the finished example study: what was run, by whom and when. Shown only in that study. */
export function FinishedNote({ pid }: { pid: string }) {
  if (pid !== FINISHED_ID) return null;
  return (
    <div className="finished-note" role="note">
      <Info size={18} />
      <div>
        <strong>Finished example: a real run from 22 Nov 2026.</strong> The QualPair team coded the 39-paragraph sample by hand. Gemini Nano coded all 263 paragraphs in Chrome on a laptop; gemini-3.5-flash-lite coded the approved access copies.
        {' '}Look around <Link to={`/p/${pid}/agreement`}>Agreement</Link>, <Link to={`/p/${pid}/review`}>Disagreements</Link> and the <Link to={`/p/${pid}/report`}>Report</Link>, or decide a few disagreements yourself.
      </div>
    </div>
  );
}
