import type { ReportData } from '../../services/report';

/** COREQ (Tong, Sainsbury & Craig, 2007) domain 3, items 24–32, filled where QualPair knows the answer. */
export function coreqRows(d: ReportData) {
  return [
    { no: 24, item: 'Number of data coders', answer: 'Three: the researcher, a laptop AI reader and a cloud AI reader (see Method).' },
    { no: 25, item: 'Description of the coding tree', answer: `Yes. ${d.codes.length} codes with definitions and criteria (Appendix A).` },
    { no: 26, item: 'Derivation of themes', answer: 'Codes were defined in advance by the researcher (codebook approach) and refined during calibration.' },
    { no: 27, item: 'Software', answer: 'QualPair (Firebase AI Logic; Gemini Nano on device and Gemini in the cloud).' },
    { no: 28, item: 'Participant checking', answer: 'Not recorded in QualPair. Add if done.' },
    { no: 29, item: 'Quotations presented', answer: 'Yes. Each quotation is identified by participant label (Table 2).' },
    { no: 30, item: 'Data and findings consistent', answer: 'Counts are computed from the final coded data; see Figure 1 and Appendix B.' },
    { no: 31, item: 'Clarity of major themes', answer: 'Major themes are listed in Table 2 in order of prevalence.' },
    { no: 32, item: 'Clarity of minor themes', answer: 'Less common themes appear in Table 2 and Appendix B.' },
  ];
}
