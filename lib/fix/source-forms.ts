import { PDFDocument, PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, PDFStream, pushGraphicsState, popGraphicsState, concatTransformationMatrix, rectangle, clip, endPath, drawObject } from "pdf-lib";

/**
 * Reproduce visible widget appearances before copying pages. Work by page, not
 * field name: signed DHC PDFs repeat "Signature1" across different page widgets,
 * which makes PDFForm.flatten() remove the wrong field and fail halfway through.
 * Only the in-memory derivative is changed. Original signature bytes are untouched.
 */
export function preserveFormAppearances(pdf: PDFDocument): number {
  let signatures = 0;
  const ctx = pdf.context;
  const numbers = (a: PDFArray) => Array.from({length:a.size()},(_,i)=>a.lookup(i,PDFNumber).asNumber());
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const widget = annots.lookup(i, PDFDict);
      if (widget.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() !== "/Widget") continue;
      const flags = widget.lookupMaybe(PDFName.of("F"), PDFNumber)?.asNumber() || 0;
      if (flags & 3) { annots.remove(i); continue; } // Invisible/hidden is not evidence to reveal.
      const rect = widget.lookupMaybe(PDFName.of("Rect"), PDFArray);
      if (!rect || rect.size() !== 4) throw new Error("A form widget has no usable rectangle.");
      const [x1,y1,x2,y2] = numbers(rect);
      if (x2<=x1 || y2<=y1) { annots.remove(i); continue; }
      const ap = widget.lookupMaybe(PDFName.of("AP"), PDFDict);
      let object = ap?.get(PDFName.of("N"));
      let appearance = object && ctx.lookup(object);
      if (appearance instanceof PDFDict) {
        const state = widget.lookupMaybe(PDFName.of("AS"),PDFName);
        if (!state) throw new Error("A form widget has no selected appearance.");
        object = appearance.get(state);
        appearance = object && ctx.lookup(object);
      }
      if (!(appearance instanceof PDFStream)) throw new Error("A visible form widget has no saved appearance.");
      const box = appearance.dict.lookup(PDFName.of("BBox"),PDFArray);
      const [bx1,by1,bx2,by2] = numbers(box);
      const matrixArray = appearance.dict.lookupMaybe(PDFName.of("Matrix"),PDFArray);
      const [a,b,c,d,e,f] = matrixArray ? numbers(matrixArray) : [1,0,0,1,0,0];
      const pts = [[bx1,by1],[bx2,by1],[bx1,by2],[bx2,by2]].map(([x,y])=>[a*x+c*y+e,b*x+d*y+f]);
      const lowX=Math.min(...pts.map(p=>p[0])),lowY=Math.min(...pts.map(p=>p[1]));
      const w=Math.max(...pts.map(p=>p[0]))-lowX,h=Math.max(...pts.map(p=>p[1]))-lowY;
      if (!(w>0 && h>0)) throw new Error("A form appearance has invalid dimensions.");
      const sx=(x2-x1)/w,sy=(y2-y1)/h;
      const ref = object instanceof PDFRef ? object : ctx.register(appearance);
      const name = page.node.newXObject("SourceAppearance",ref);
      page.pushOperators(pushGraphicsState(),rectangle(x1,y1,x2-x1,y2-y1),clip(),endPath(),
        concatTransformationMatrix(sx,0,0,sy,x1-lowX*sx,y1-lowY*sy),drawObject(name),popGraphicsState());
      let field: PDFDict | undefined = widget;
      const seen = new Set<PDFDict>();
      while (field && !seen.has(field)) {
        seen.add(field);
        const type = field.lookupMaybe(PDFName.of("FT"),PDFName);
        if (type) { if(type.asString()==="/Sig") signatures++; break; }
        field=field.lookupMaybe(PDFName.of("Parent"),PDFDict);
      }
      annots.remove(i);
    }
  }
  pdf.catalog.delete(PDFName.of("AcroForm"));
  return signatures;
}
