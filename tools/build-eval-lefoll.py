"""Convert Le Foll (2025, CC BY-SA 4.0) into QualCheck's evaluation file.

Unit: one interviewee turn (long turns split near 900 characters at sentence ends).
Reference: a unit has a code if any passage the author coded with it overlaps the unit.
Codebook: the 12 most frequent thematic codes. Definitions were written by the QualCheck
team from the code names (the dataset has labels only); this is stated in the eval output.
Usage: python3 tools/build-eval-lefoll.py <raw-dir> <out.json>
"""
import csv, json, re, sys, os

raw, out = sys.argv[1], sys.argv[2]
CODES = {
    'open data': 'Sharing research data openly, or problems and practices around doing so.',
    'open/closed access publishing': 'Publishing articles or books open access versus behind paywalls, including costs and choices of venue.',
    'resistance/reasons not to do OS': 'Reasons people give for not adopting open science practices, or resistance to them.',
    '(lack of) incentives/motivation': 'Whether open science is rewarded or motivated in careers, or the lack of such incentives.',
    'courses/training/coaching/curriculum': 'Teaching, training or coaching about open science, including courses and curricula.',
    'open code/method/tools': 'Sharing analysis code, methods or software tools openly.',
    'funding/funders': 'The role of funding bodies, grants or funder requirements.',
    'community building/networking': 'Building communities or networks of people around open science.',
    'open education': 'Open educational resources or openly sharing teaching materials.',
    'academic culture': 'Norms, values and pressures of academic culture that shape research practice.',
    'generational gap': 'Differences between younger and older researchers or generations.',
    'pre-registration': 'Pre-registering studies or registered reports.',
}
rows = list(csv.reader(open(os.path.join(raw, 'OS_Interviews_Coded_Passages_OpenQDA_12_11_2025.csv'), encoding='utf-8'), delimiter=';'))[1:]
units = []
missing = 0
for i in range(2, 27):
    f = f'A{i:02d}.txt'
    text = open(os.path.join(raw, f), encoding='utf-8').read().replace('\r\n', '\n')
    spans = []
    for r in rows:
        if r[0] != f or r[1] not in CODES:
            continue
        sel = r[7].strip()
        pos = text.find(sel)
        if pos < 0:
            pos = text.find(sel[:80])
        if pos < 0:
            missing += 1
            continue
        spans.append((pos, pos + len(sel), r[1]))
    pos = 0
    for line in text.split('\n'):
        start = pos
        pos += len(line) + 1
        m = re.match(r'^(Interviewee \d+|Interviewer)\s*:\s*', line)
        if not m or m.group(1) == 'Interviewer':
            continue
        body_start = start + m.end()
        body = line[m.end():]
        # split long turns at sentence ends
        pieces, buf, off = [], '', 0
        for s in re.findall(r'[^.!?]+(?:[.!?]+\s*|$)', body):
            if buf and len(buf) + len(s) > 900:
                pieces.append((off, buf)); off += len(buf); buf = ''
            buf += s
        if buf:
            pieces.append((off, buf))
        for off, p in pieces:
            a, b = body_start + off, body_start + off + len(p)
            if len(p.strip()) < 40:
                continue
            codes = sorted({c for (s, e, c) in spans if s < b and e > a})
            units.append({'id': f'{f[:-4]}-{len(units)}', 'file': f[:-4], 'text': p.strip(), 'codes': codes})
json.dump({
    'source': 'Le Foll, E. (2025). Semi-structured interviews with linguists about Open Science [Data set]. Zenodo. https://doi.org/10.5281/zenodo.17630137',
    'license': 'CC BY-SA 4.0. This derived file is also CC BY-SA 4.0.',
    'note': 'Single expert reference (one coder). Code definitions were written by the QualCheck team from the code names. Unit = interviewee turn.',
    'codes': [{'name': k, 'definition': v} for k, v in CODES.items()],
    'units': units,
}, open(out, 'w'), ensure_ascii=False)
print(len(units), 'units;', sum(1 for u in units if u['codes']), 'with codes;', missing, 'passages not found')
