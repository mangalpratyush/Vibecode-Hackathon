import { getSessionUser } from "@/lib/auth/session";
import { getBundle } from "@/lib/store";
import { finalArtifact } from "@/lib/fix/final-artifact";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown,status=200) => Response.json(body,{status});
async function load(id:string) {
  const user=await getSessionUser();
  if(!user) return null;
  const b=await getBundle(id);
  return b?.ownerEmail===user.email ? b : null;
}
export async function GET(req:Request) {
  const bundle=await load(new URL(req.url).searchParams.get("bundleId")||"");
  if(!bundle) return json({error:"Bundle not found or not signed in."},404);
  try {
    const a=await finalArtifact(bundle);
    return new Response(new Uint8Array(a.pdf),{headers:{"Content-Type":"application/pdf",
      "Content-Disposition":'attachment; filename="'+a.fileName+'"',
      "X-Param-Pages":String(a.plan.totalPages),"X-Param-Index-Pages":String(a.plan.indexPages),
      "X-Param-Review-Required":String(a.result.defects.length>0||a.result.skipped.length>0)}});
  } catch(e) {return json({error:e instanceof Error?e.message:"Export failed"},422)}
}
export async function POST(req:Request) {
  const {bundleId}=await req.json().catch(()=>({bundleId:""}));
  const b=await load(String(bundleId));
  if(!b) return json({error:"Bundle not found or not signed in."},404);
  try {const a=await finalArtifact(b);return json({ok:true,...a.plan,finalScrutiny:a.result});}
  catch(e){return json({error:e instanceof Error?e.message:"Export failed"},422)}
}
