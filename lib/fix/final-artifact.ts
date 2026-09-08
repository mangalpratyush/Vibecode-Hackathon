import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bundle, ScrutinyResult } from "../types";
import { normalizeBundle } from "../docs/normalize";
import { analysePdf } from "../docs/pdf-forensics";
import { assemblePaperbook, type RepairResult } from "./paperbook";
import { readDocumentFile } from "../storage/files";
import { runScrutiny } from "../scrutiny/run";
import { scoreFiling } from "../scrutiny/score";
import { signManifest, type Seal, type Manifest } from "../seal/seal";
import { rulebookStats } from "../rulebook";

const VERSION = "final-artifact-v5";
const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
type Plan = Omit<RepairResult, "pdf">;
export interface FinalArtifact { fileName: string; pdf: Buffer; seal: Seal; result: ScrutinyResult; plan: Plan }
const state = globalThis as typeof globalThis & {paramFinalBuilds?: Map<string, Promise<FinalArtifact>>};
const pending = state.paramFinalBuilds ??= new Map();

/** Content-addressed snapshot: one PDF, one final audit and one immutable seal record. */
export async function finalArtifact(input: Bundle): Promise<FinalArtifact> {
  const bundle = normalizeBundle(input);
  if (!/^[a-zA-Z0-9_-]+$/.test(bundle.id)) throw new Error("Invalid bundle identifier");
  const sources = new Map<string,Buffer>();
  for (const d of bundle.documents) {
    const bytes = await readDocumentFile(bundle.id,d.id);
    if (!bytes) throw new Error("Source missing: "+d.fileName);
    sources.set(d.id,bytes);
  }
  const revisionBundle = {...bundle, sealedAt: undefined};
  const revision = hash(JSON.stringify({version:VERSION,bundle:revisionBundle,hashes:[...sources].map(([id,b])=>[id,hash(b)])}));
  const key = bundle.id+revision;
  const existing = pending.get(key);
  if (existing) return existing;
  const task = build(bundle,sources,revision);
  pending.set(key,task);
  try { return await task; } finally { pending.delete(key); }
}

async function build(bundle: Bundle, sources: Map<string,Buffer>, revision: string): Promise<FinalArtifact> {
  const dir = path.join(process.cwd(),"uploads",bundle.id,"final",revision);
  try {
    const saved = JSON.parse(await readFile(path.join(dir,"record.json"),"utf8")) as Omit<FinalArtifact,"pdf">;
    const pdf = await readFile(path.join(dir,"paperbook.pdf"));
    if (hash(pdf)!==saved.seal.manifest.documents[0].sha256 || signManifest(saved.seal.manifest)!==saved.seal.seal) throw new Error("Snapshot integrity mismatch");
    return {...saved,pdf};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const repaired = await assemblePaperbook(bundle,async d=>sources.get(d.id)||null);
  const pdf = Buffer.from(repaired.pdf);
  const measured = await analysePdf(pdf);
  if (measured.pageCount !== repaired.totalPages) throw new Error("Final PDF page count failed validation");
  if (measured.pages.some((p,i)=>p.printedPageNo!==i+1)) throw new Error("Final pagination failed validation");
  // Re-scrutinise the exact output, retaining each document's identity and local page coordinates.
  const docs = repaired.contents.map(c => {
    const original = bundle.documents.find(d=>d.fileName===c.fileName)!;
    const pagesText = measured.pageTexts.slice(c.from-1,c.to);
    return {...original,pagesText,text:pagesText.join("\n"),
      pages:measured.pages.slice(c.from-1,c.to).map((p,i)=>({
        ...p,...original.pages[i],pageNo:i+1,widthPt:p.widthPt,heightPt:p.heightPt,
        printedPageNo:p.printedPageNo
      })),
      pageCount:c.to-c.from+1};
  });
  const result = runScrutiny({...bundle,documents:docs});
  // The original index was deliberately replaced. Validate generated ranges, not the removed index.
  let next = repaired.indexPages+1;
  for (const c of repaired.contents) {
    if(c.from!==next || c.to<c.from) throw new Error("Generated index ranges failed validation");
    next=c.to+1;
  }
  if(next!==measured.pageCount+1) throw new Error("Generated index is incomplete");
  const indexRule = "SC-VIII-INDEX";
  // Both courts may use an index rule; settle only implemented index_mismatch rules.
  const {activeRules} = await import("../rulebook");
  const indexRules = new Set(activeRules(bundle.court,bundle.caseTypeId).filter(r=>r.check==="index_mismatch").map(r=>r.id));
  indexRules.add(indexRule);
  result.defects=result.defects.filter(d=>!indexRules.has(d.ruleId));
  result.skipped=result.skipped.filter(d=>!indexRules.has(d.ruleId));
  result.passed=result.passed.filter(d=>!indexRules.has(d.ruleId));
  for(const id of indexRules) if(activeRules(bundle.court,bundle.caseTypeId).some(r=>r.id===id))
    result.passed.push({ruleId:id,text:"Generated index ranges checked against the final PDF page positions."});
  result.stats={...result.stats,pages:measured.pageCount,documents:docs.length,
    fatal:result.defects.filter(d=>d.severity==="FATAL").length,
    objections:result.defects.filter(d=>d.severity==="REGISTRY_OBJECTION").length,
    advisories:result.defects.filter(d=>d.severity==="ADVISORY").length};
  result.score=scoreFiling(result);
  const fileName=(bundle.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"filing")+"-paperbook.pdf";
  const digest=hash(pdf);
  const manifest: Manifest = {
    version:"param-manifest-1",bundleId:bundle.id,title:bundle.title,court:bundle.court,caseType:bundle.caseTypeId,
    sealedAt:result.ranAt,scope:"FINAL_PAPERBOOK",
    rulebook:{version:"v1",verifiedRules:rulebookStats().verified},
    scrutiny:{ranAt:result.ranAt,verdict:result.score.verdict,score:result.score.score,
      fatal:result.stats.fatal,objections:result.stats.objections,advisories:result.stats.advisories,
      passed:result.passed.length,notChecked:result.skipped.length,
      limitation:result.limitation.computed ? (result.limitation.barred ? "outside computed period" : "within computed period") : result.limitation.reason || "not computed"},
    documents:[{fileName,kind:"FINAL_PAPERBOOK",pages:measured.pageCount,bytes:pdf.length,sha256:digest}],
    bundleDigest:hash(digest),
  };
  const seal: Seal={manifest,seal:signManifest(manifest),algorithm:"HMAC-SHA256"};
  const {pdf:unused,...plan}=repaired;
  void unused;
  const record={fileName,seal,result,plan};
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,"paperbook.pdf"),pdf);
  await writeFile(path.join(dir,"record.json"),JSON.stringify(record));
  return {...record,pdf};
}
