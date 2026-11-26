import type { ReportData } from '../../services/report';

/** COREQ (Tong, Sainsbury & Craig, 2007) domain 3, items 24–32, filled where QualPair knows the answer. */
export function coreqRows(d: ReportData) {
  const ai = [d.readers.laptop ? `a laptop ${d.readers.laptopPractice ? 'practice reader (keyword rules, no AI)' : 'AI reader'}` : '', d.readers.cloud ? `a cloud ${d.readers.cloudPractice ? 'practice reader (keyword rules, no AI)' : 'AI reader'}` : ''].filter(Boolean);
  const coders = 1 + ai.length;
  const count = ['One', 'Two', 'Three'][coders - 1];
  const software = [!d.readers.laptop || d.readers.laptopPractice ? '' : 'Gemini Nano on device', !d.readers.cloud || d.readers.cloudPractice ? '' : 'Gemini in the cloud'].filter(Boolean);
  return [
    { no: 24, item: 'Number of data coders', answer: coders === 1 ? 'One: the researcher. No AI reader has coded the data yet.' : `${count}: the researcher, ${ai.join(' and ')} (see Method).` },
    { no: 25, item: 'Description of the coding tree', answer: `Yes. ${d.codes.length} codes with definitions and criteria (Appendix A).` },
    { no: 26, item: 'Derivation of themes', answer: 'Codes were defined in advance by the researcher (codebook approach) and refined during calibration.' },
    { no: 27, item: 'Software', answer: software.length ? `QualPair (Firebase AI Logic; ${software.join(' and ')}).` : 'QualPair.' },
    { no: 28, item: 'Participant checking', answer: 'Not recorded in QualPair. Add if done.' },
    { no: 29, item: 'Quotations presented', answer: 'Yes. Each quotation is identified by participant label (Table 2).' },
    { no: 30, item: 'Data and findings consistent', answer: 'Counts are computed from the final coded data; see Figure 1 and Appendix B.' },
    { no: 31, item: 'Clarity of major themes', answer: 'Major themes are listed in Table 2 in order of prevalence.' },
    { no: 32, item: 'Clarity of minor themes', answer: 'Less common themes appear in Table 2 and Appendix B.' },
  ];
}
