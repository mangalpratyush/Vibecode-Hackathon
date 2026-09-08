/** Read numbered, address-bearing party blocks without mistaking an address for a name. */
export function readPartyBlocks(input: string): {petitioner:string;respondent:string} | undefined {
  const text = input
    .replace(/\b([A-Z])[ \t]+([A-Z]{2,})\b/g,"$1$2")
    .replace(/\b([A-Z])[ \t]+([A-Z]{2,})\b/g,"$1$2");
  // Inline judgment captions are handled by the existing detector. This fallback
  // is for party lists with representation/address blocks, not arbitrary headings.
  if (!/\bTHROUGH\b/i.test(text)) return undefined;
  const sides=text.split(/^\s*(?:VERSUS|VS\.?|V\.)\s*$/im);
  if(sides.length!==2) return undefined;
  const names=(side:string,role:RegExp) => {
    const blocks=side.split(role);
    const count=blocks.length-1;
    if(!count) return [];
    return blocks.slice(0,count).map(block=>{
      const lines=block.split("\n").map(l=>l.trim()).filter(Boolean);
      while(lines.length && /^(?:IN THE (?:SUPREME|HIGH|COURT|MATTER)|\(?CIVIL (?:ORIGINAL|APPELLATE)|\(?CRIMINAL (?:ORIGINAL|APPELLATE)|WRIT PETITION|SPECIAL LEAVE PETITION|PUBLIC INTEREST LITIGA\s*TION|BETWEEN\s*:|BEFORE\b)/i.test(lines[0])) lines.shift();
      const first=lines.find(l=>!/^[\d.\s]+$/.test(l)) || "";
      const name=first.replace(/^\d+\s*[.)]?\s*/,"").replace(/\s+/g," ").trim();
      if(!/^[A-Za-z]/.test(name) || name.length<3 || name.length>160 || /@|\b(?:ROAD|FLOOR|EMAIL|PHONE|PINCODE|RESIDENT OF)\b/i.test(name)) return "";
      return name;
    });
  };
  const p=names(sides[0],/[.\u2026 ]*\b(?:PETITIONER|APPELLANT|APPLICANT)S?\b[^\n]*(?:\n|$)/gi);
  const r=names(sides[1],/[.\u2026 ]*\b(?:RESPONDENT|DEFENDANT)S?\b[^\n]*(?:\n|$)/gi);
  if(!p[0]||!r[0]) return undefined;
  const suffix=(n:number)=>n>2?" & Ors.":n===2?" & Anr.":"";
  return {petitioner:p[0]+suffix(p.length),respondent:r[0]+suffix(r.length)};
}
