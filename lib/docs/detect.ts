import type { BundleDocument, DetectedMatter, DetectedValue } from "../types";

export type { DetectedMatter };

/**
 * Read the matter out of the documents instead of asking for it.
 *
 * Every Indian filing states its own court, jurisdiction, case number and
 * parties on the first page, in a form that has barely changed in decades:
 *
 *   IN THE HIGH COURT OF DELHI AT NEW DELHI
 *   W.P.(C) 11742/2025 & CM APPL. 48041/2025
 *   MAA SHARDA VIDYAPEETH .....Petitioner
 *   versus
 *   NATIONAL COUNCIL FOR TEACHER EDUCATION AND ANR .....Respondents
 *   Judgment Delivered on: 26.08.2025
 *
 * So an advocate should not have to retype any of it. The patterns below were
 * written against real judgments pulled from sci.gov.in and
 * delhihighcourt.nic.in, not against documents this project generated, because
 * a detector tuned to its own fixtures only ever proves itself right.
 *
 * Everything returned carries the line it was read from. Nothing here decides
 * anything: the advocate confirms it at stage II, and a value they type always
 * wins.
 */

export type Detected<T> = DetectedValue<T>;

/**
 * Courts PARAM can recognise. Recognition is deliberately much wider than the
 * rulebook: saying "this is a Bombay High Court matter, and PARAM has no
 * verified rulebook for that court yet" is far more useful, and far more
 * honest, than refusing to read the document or pretending it is a Delhi filing.
 */
const COURTS: { id: string; name: string; hasRulebook: boolean; re: RegExp }[] = [
  {
    id: "SUPREME_COURT",
    name: "Supreme Court of India",
    hasRulebook: true,
    re: /IN\s+THE\s+SUPREME\s+COURT\s+OF\s+INDIA/i,
  },
  {
    id: "DELHI_HIGH_COURT",
    name: "High Court of Delhi",
    hasRulebook: true,
    re: /IN\s+THE\s+HIGH\s+COURT\s+OF\s+DELHI/i,
  },
  { id: "HC_BOMBAY", name: "High Court of Bombay", hasRulebook: false, re: /HIGH\s+COURT\s+OF\s+(?:JUDICATURE\s+AT\s+)?BOMBAY/i },
  { id: "HC_CALCUTTA", name: "High Court of Calcutta", hasRulebook: false, re: /HIGH\s+COURT\s+AT\s+CALCUTTA|HIGH\s+COURT\s+OF\s+CALCUTTA/i },
  { id: "HC_MADRAS", name: "High Court of Madras", hasRulebook: false, re: /HIGH\s+COURT\s+OF\s+(?:JUDICATURE\s+AT\s+)?MADRAS/i },
  { id: "HC_KARNATAKA", name: "High Court of Karnataka", hasRulebook: false, re: /HIGH\s+COURT\s+OF\s+KARNATAKA/i },
  { id: "HC_ALLAHABAD", name: "High Court of Allahabad", hasRulebook: false, re: /HIGH\s+COURT\s+(?:OF\s+JUDICATURE\s+)?AT\s+ALLAHABAD/i },
  { id: "HC_KERALA", name: "High Court of Kerala", hasRulebook: false, re: /HIGH\s+COURT\s+OF\s+KERALA/i },
  { id: "HC_GUJARAT", name: "High Court of Gujarat", hasRulebook: false, re: /HIGH\s+COURT\s+OF\s+GUJARAT/i },
  { id: "HC_TELANGANA", name: "High Court for the State of Telangana", hasRulebook: false, re: /HIGH\s+COURT\s+(?:FOR\s+THE\s+STATE\s+)?OF\s+TELANGANA/i },
  { id: "HC_PUNJAB_HARYANA", name: "High Court of Punjab and Haryana", hasRulebook: false, re: /HIGH\s+COURT\s+(?:OF\s+)?PUNJAB\s*(?:AND|&)\s*HARYANA/i },
  { id: "HC_RAJASTHAN", name: "High Court of Rajasthan", hasRulebook: false, re: /HIGH\s+COURT\s+OF\s+(?:JUDICATURE\s+FOR\s+)?RAJASTHAN/i },
  { id: "HC_MADHYA_PRADESH", name: "High Court of Madhya Pradesh", hasRulebook: false, re: /HIGH\s+COURT\s+OF\s+MADHYA\s+PRADESH/i },
  { id: "HC_PATNA", name: "High Court of Patna", hasRulebook: false, re: /HIGH\s+COURT\s+(?:OF\s+JUDICATURE\s+)?AT\s+PATNA/i },
  { id: "HC_ORISSA", name: "High Court of Orissa", hasRulebook: false, re: /HIGH\s+COURT\s+OF\s+ORISSA/i },
  { id: "NCLAT", name: "National Company Law Appellate Tribunal", hasRulebook: false, re: /NATIONAL\s+COMPANY\s+LAW\s+APPELLATE\s+TRIBUNAL/i },
  { id: "NCLT", name: "National Company Law Tribunal", hasRulebook: false, re: /NATIONAL\s+COMPANY\s+LAW\s+TRIBUNAL/i },
  { id: "NGT", name: "National Green Tribunal", hasRulebook: false, re: /NATIONAL\s+GREEN\s+TRIBUNAL/i },
  { id: "CAT", name: "Central Administrative Tribunal", hasRulebook: false, re: /CENTRAL\s+ADMINISTRATIVE\s+TRIBUNAL/i },
  { id: "DISTRICT_COURT", name: "District Court", hasRulebook: false, re: /IN\s+THE\s+COURT\s+OF\s+(?:THE\s+)?(?:LD\.?\s+)?(?:ADDITIONAL\s+)?(?:DISTRICT|SESSIONS|CIVIL\s+JUDGE|CHIEF\s+METROPOLITAN|METROPOLITAN\s+MAGISTRATE)/i },
];

/**
 * Case types, keyed to the registry abbreviations that actually appear on the
 * face of a filing. `id` links to lib/rulebook CASE_TYPES where PARAM has a
 * limitation period encoded; null means recognised but not yet modelled.
 */
const CASE_TYPES: { id: string | null; code: string; name: string; re: RegExp }[] = [
  { id: "SLP_CIVIL", code: "SLP (C)", name: "Special Leave Petition (Civil)", re: /SPECIAL\s+LEAVE\s+PETITION\s*\(\s*C(?:IVIL)?\s*\)|\bSLP\s*\(\s*C\s*\)|S\.?L\.?P\.?\s*\(\s*CIVIL\s*\)/i },
  { id: "SLP_CRIMINAL", code: "SLP (Crl)", name: "Special Leave Petition (Criminal)", re: /SPECIAL\s+LEAVE\s+PETITION\s*\(\s*CRL?(?:IMINAL)?\s*\)|\bSLP\s*\(\s*CRL\s*\)/i },
  { id: null, code: "C.A.", name: "Civil Appeal", re: /\bCIVIL\s+APPEAL\s+(?:NO|NOS)\b|\bC\.?\s?A\.?\s*NO\.?\s*\d/i },
  { id: null, code: "CRL.A.", name: "Criminal Appeal", re: /\bCRIMINAL\s+APPEAL\s+(?:NO|NOS)\b|\bCRL\.?\s?A\.?\s*NO\.?\s*\d/i },
  { id: "WRIT_PETITION", code: "W.P.", name: "Writ Petition (Article 32)", re: /WRIT\s+PETITION\s*\(\s*C(?:IVIL)?\s*\)\s*NO[^\n]{0,40}UNDER\s+ARTICLE\s+32|ARTICLE\s+32\s+OF\s+THE\s+CONSTITUTION/i },
  { id: "CIVIL_WRIT", code: "W.P.(C)", name: "Civil Writ Petition", re: /\bW\.?\s?P\.?\s*\(\s*C\s*\)|\bWRIT\s+PETITION\s*\(\s*CIVIL\s*\)/i },
  { id: null, code: "W.P.(CRL)", name: "Criminal Writ Petition", re: /\bW\.?\s?P\.?\s*\(\s*CRL\.?\s*\)/i },
  { id: "CRLA", code: "CRL.A.", name: "Criminal Appeal", re: /\bCRL\.?\s?A\.?\s*\d|\bCRIMINAL\s+APPEAL\b/i },
  { id: "RFA", code: "RFA", name: "Regular First Appeal", re: /\bR\.?F\.?A\.?\s*(?:NO\.?)?\s*\d/i },
  { id: "CRLREV", code: "CRL.REV.P.", name: "Criminal Revision Petition", re: /CRL\.?\s?REV\.?\s?P\.?|CRIMINAL\s+REVISION/i },
  { id: "OMP_34", code: "O.M.P. (COMM)", name: "Petition under s.34, Arbitration Act", re: /O\.?M\.?P\.?\s*\(\s*COMM\s*\)|SECTION\s+34\s+OF\s+THE\s+ARBITRATION/i },
  { id: null, code: "CM APPL.", name: "Miscellaneous Application", re: /\bCM\s+APPL\.?\s*\d/i },
  { id: null, code: "CS", name: "Civil Suit", re: /\bCS\s*\(\s*OS\s*\)|\bCIVIL\s+SUIT\b/i },
];

/** "W.P.(C) 11742/2025", "Civil Appeal No 8629 of 2024", "CRL.A. 231/2023". */
const CASE_NUMBER =
  /\b((?:W\.?\s?P\.?\s*\([A-Z]{1,4}\.?\)|SLP\s*\([A-Z]{1,4}\)|CRL\.?\s?[A-Z]{1,6}\.?|C\.?\s?A\.?|R\.?F\.?A\.?|O\.?M\.?P\.?\s*\([A-Z]+\)|CS\s*\([A-Z]+\))\s*(?:NO\.?S?\.?\s*)?\d{1,6}\s*(?:\/|\s+OF\s+)\s*\d{4})/i;

/**
 * The cause title. Indian filings separate the sides with "versus" or "Vs." and
 * label each side before Petitioner / Appellant / Respondent.
 *
 * The leaders are written either as a run of dots ("Sharma .....Petitioner",
 * the Delhi High Court style) or as a single ellipsis character ("Union of
 * India & Ors. … Appellants", the Supreme Court style). Matching only dots
 * silently missed every Supreme Court cause title.
 */
const PARTIES =
  /([A-Z][A-Za-z0-9 .,&()'\/-]{2,90}?)\s*(?:\.{2,}|…)\s*(?:Petitioner|Appellant|Applicant)s?\b[\s\S]{0,400}?\b(?:versus|vs\.?|v\.)\s*([A-Z][A-Za-z0-9 .,&()'\/-]{2,90}?)\s*(?:\.{2,}|…)\s*(?:Respondent|Defendant)s?\b/i;

const tidy = (s: string) =>
  s.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

const quote = (text: string, at: number, len = 110) =>
  tidy(text.slice(Math.max(0, at - 10), Math.min(text.length, at + len)));

/**
 * Which documents to read.
 *
 * The cause title is on the first page of the petition and of the impugned
 * order. Reading the whole bundle would find party names inside annexures and
 * attribute them wrongly, which is worse than finding nothing.
 */
function sources(documents: BundleDocument[]): BundleDocument[] {
  const preferred = documents.filter((d) =>
    ["PETITION", "CERTIFIED_COPY", "IMPUGNED_ORDER", "MEMO_OF_PARTIES"].includes(d.kind)
  );
  // Fall back to whatever has text: on a fresh upload nothing is classified yet.
  return preferred.length ? preferred : documents.filter((d) => d.text.trim().length > 80);
}

export function detectMatter(documents: BundleDocument[]): DetectedMatter {
  const out: DetectedMatter = {};

  for (const doc of sources(documents)) {
    // The identifying block is at the top. Reading further finds citations of
    // other cases and mistakes them for this one.
    const head = doc.pagesText.slice(0, 2).join("\n").slice(0, 4000);
    if (!head.trim()) continue;

    if (!out.court) {
      for (const c of COURTS) {
        const m = head.match(c.re);
        if (!m) continue;
        out.court = {
          value: { id: c.id, name: c.name, hasRulebook: c.hasRulebook },
          evidence: quote(head, m.index ?? 0),
          from: doc.fileName,
        };
        break;
      }
    }

    if (!out.caseNumber) {
      const m = head.match(CASE_NUMBER);
      if (m) {
        out.caseNumber = {
          value: tidy(m[1]).toUpperCase(),
          evidence: quote(head, m.index ?? 0),
          from: doc.fileName,
        };
      }
    }

    if (!out.caseType) {
      for (const t of CASE_TYPES) {
        const m = head.match(t.re);
        if (!m) continue;
        out.caseType = {
          value: { id: t.id, code: t.code, name: t.name },
          evidence: quote(head, m.index ?? 0),
          from: doc.fileName,
        };
        break;
      }
    }

    if (!out.parties) {
      const m = head.match(PARTIES);
      if (m) {
        const petitioner = tidy(m[1]);
        const respondent = tidy(m[2]);
        // A cause title of one word on either side is almost always a false
        // positive off a running header, so require something substantive.
        if (petitioner.length > 2 && respondent.length > 2) {
          out.parties = {
            value: {
              petitioner,
              respondent,
              title: `${titleCase(petitioner)} v. ${titleCase(respondent)}`,
            },
            evidence: quote(head, m.index ?? 0, 160),
            from: doc.fileName,
          };
        }
      }
    }
  }

  return out;
}

/** Cause titles are printed in caps; a workspace list is easier to scan in title case. */
function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Of|And|The|For|At|In|A|An|Ors|Anr)\b/g, (w) => w.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());
}

/** A readable title for the workspace, from whatever was found. */
export function suggestedTitle(d: DetectedMatter): string | undefined {
  const parties = d.parties?.value.title;
  const num = d.caseNumber?.value;
  if (parties && num) return `${parties}, ${num}`;
  if (parties) return parties;
  if (num) return num;
  return undefined;
}
