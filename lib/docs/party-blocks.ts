/** Read numbered, address-bearing party blocks without mistaking an address for a name. */

/**
 * Lines that sit above a cause title and are not anybody's name.
 *
 * A Delhi High Court judgment opens with its own running header, its daily
 * list item mark, the court, the date and the case number before it reaches
 * the petitioner. All five were being read as the petitioner, so a filing came
 * out titled "W.P.(C) 11742/2025 Page 1 of 10 v. National Council for Teacher
 * Education", which then became the paperbook filename and the cause title on
 * the index.
 */
const NOISE: RegExp[] = [
  /page\s+\d+\s+of\s+\d+\s*$/i,
  /^\$~/,
  /^in the (?:supreme|high|court|matter)\b/i,
  /^\(?(?:civil|criminal)\s+(?:original|appellate)\b/i,
  /^(?:writ petition|special leave petition|public interest litiga\s*tion)\b/i,
  /^between\s*:?\s*$/i,
  /^before\b/i,
  /^(?:coram|through)\b/i,
  /^(?:judgment|judgement|order|decided|reserved|pronounced|delivered|date)\b[^\n]*\d/i,
  /^[A-Z][A-Z.()\s]{0,14}\s*\d+\s*(?:of|\/)\s*\d{2,4}\b/,
  /^[\d.\s]+$/,
];

/** Delhi High Court marks its cause list entries with a leading *, % or +. */
const stripMark = (line: string) => line.replace(/^[*%+]\s*/, "").trim();

const isNoise = (line: string) => NOISE.some((re) => re.test(line));

/**
 * The role marker must carry a dot leader.
 *
 * Without that the word "respondents" in the body of the judgment counted as
 * another party block, and the count drove the "& Anr." suffix, so a single
 * respondent already named "... AND ANR" came back as "AND ANR & Anr.". A
 * cause title always leads to the role with dots or an ellipsis; running prose
 * never does.
 */
const PETITIONER_ROLE =
  /(?:\.{2,}|…)\s*\b(?:PETITIONER|APPELLANT|APPLICANT)S?\b[^\n]*(?:\n|$)/gi;
const RESPONDENT_ROLE =
  /(?:\.{2,}|…)\s*\b(?:RESPONDENT|DEFENDANT)S?\b[^\n]*(?:\n|$)/gi;

/** Already says there are others, so do not say it twice. */
const saysMultiple = (name: string) =>
  /\b(?:&|and)\s*(?:anr|ors|others|another)\b\.?$/i.test(name);

export function readPartyBlocks(
  input: string
): { petitioner: string; respondent: string } | undefined {
  const text = input
    .replace(/\b([A-Z])[ \t]+([A-Z]{2,})\b/g, "$1$2")
    .replace(/\b([A-Z])[ \t]+([A-Z]{2,})\b/g, "$1$2");

  // Inline judgment captions are handled by the existing detector. This fallback
  // is for party lists with representation/address blocks, not arbitrary headings.
  if (!/\bTHROUGH\b/i.test(text)) return undefined;

  const sides = text.split(/^\s*(?:VERSUS|VS\.?|V\.)\s*$/im);
  if (sides.length !== 2) return undefined;

  const names = (side: string, role: RegExp) => {
    const blocks = side.split(role);
    const count = blocks.length - 1;
    if (!count) return [];
    return blocks.slice(0, count).map((block) => {
      const lines = block
        .split("\n")
        .map((l) => stripMark(l))
        .filter((l) => l && !isNoise(l));
      // The first surviving line. In a numbered block the name is above its own
      // address, so taking the last line here would read back an address.
      const name = (lines[0] ?? "")
        .replace(/^\d+\s*[.)]?\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
      if (
        !/^[A-Za-z]/.test(name) ||
        name.length < 3 ||
        name.length > 160 ||
        /@|\b(?:ROAD|FLOOR|EMAIL|PHONE|PINCODE|RESIDENT OF)\b/i.test(name)
      )
        return "";
      return name;
    });
  };

  // Count only the blocks that yielded a real name. A block of advocates'
  // appearances is not a party, and counting it inflated the suffix.
  const p = names(sides[0], PETITIONER_ROLE).filter(Boolean);
  const r = names(sides[1], RESPONDENT_ROLE).filter(Boolean);
  if (!p[0] || !r[0]) return undefined;

  const suffix = (name: string, n: number) =>
    saysMultiple(name) ? "" : n > 2 ? " & Ors." : n === 2 ? " & Anr." : "";

  return {
    petitioner: p[0] + suffix(p[0], p.length),
    respondent: r[0] + suffix(r[0], r.length),
  };
}
