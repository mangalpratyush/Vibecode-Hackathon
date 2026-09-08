import { getSessionUser } from "@/lib/auth/session";
import { getBundle, saveBundle } from "@/lib/store";
import { finalArtifact } from "@/lib/fix/final-artifact";
import { sealCertificate } from "@/lib/seal/certificate";
import { zipFiles } from "@/lib/seal/zip";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req:Request) {
  const user=await getSessionUser();
  if(!user) return Response.json({error:"Not signed in."},{status:401});
  const url=new URL(req.url),b=await getBundle(url.searchParams.get("bundleId")||"");
  if(!b||b.ownerEmail!==user.email) return Response.json({error:"Bundle not found."},{status:404});
  try {
    const a=await finalArtifact(b);
    const caseSlug=a.fileName.replace(/-paperbook\.pdf$/i,"");
    const certificateName=caseSlug+"-integrity-seal.pdf";
    // No content change: the revision key excludes this UI bookkeeping timestamp.
    if(b.sealedAt!==a.seal.manifest.sealedAt) await saveBundle({...b,sealedAt:a.seal.manifest.sealedAt});
    if(url.searchParams.get("format")==="zip") {
      const files=[{name:a.fileName,bytes:a.pdf},{name:"param-integrity-manifest.json",bytes:Buffer.from(JSON.stringify(a.seal,null,2))},
        {name:certificateName,bytes:await sealCertificate(a.seal)},
        {name:"final-scrutiny.json",bytes:Buffer.from(JSON.stringify(a.result,null,2))},
        {name:"READ-ME.txt",bytes:Buffer.from("Verify ONLY the paperbook PDF with param-integrity-manifest.json. The certificate uses the same saved seal. The scrutiny JSON is a review aid; the seal covers only files named in the manifest. Remaining findings and skipped checks require review. Not court clearance. Original uploads are unchanged; the original index is replaced, not duplicated.")}];
      return new Response(new Uint8Array(zipFiles(files)),{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${caseSlug}-sealed-pack.zip"`}});
    }
    if(url.searchParams.get("format")==="pdf") return new Response(new Uint8Array(await sealCertificate(a.seal)),{
      headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${certificateName}"`}});
    if(url.searchParams.get("format")==="report") return Response.json({scope:"FINAL_PAPERBOOK",result:a.result,assembly:a.plan});
    return Response.json(a.seal);
  } catch(e) {return Response.json({error:e instanceof Error?e.message:"Seal failed"},{status:422})}
}
