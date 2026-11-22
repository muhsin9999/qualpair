import { Info } from 'lucide-react';

/** Shown before every cloud send (decision D16: free tier, plain notice). */
export function CloudTermsNotice() {
  return (
    <div className="notice row" style={{ alignItems: 'flex-start' }}>
      <Info size={16} color="var(--attn)" style={{ flex: 'none', marginTop: 2 }} />
      <span>On the free tier, Google may keep and review what you send to improve its models.</span>
    </div>
  );
}
