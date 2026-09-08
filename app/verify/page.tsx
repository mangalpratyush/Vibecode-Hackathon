import VerifyForm from "@/components/verify/VerifyForm";

export const metadata = {
  title: "Verify a sealed filing · PARAM",
  description:
    "Check that a filing bundle is byte for byte the bundle PARAM sealed. No account required.",
};

/**
 * Public on purpose, and outside the portal.
 *
 * The whole value of the seal is that the person you hand the filing to can
 * check it, and that person does not have an account here. Opposing counsel,
 * a clerk, a judge's reader: anyone with the certificate and the bundle can
 * confirm it, without signing in and without anything being stored.
 */
export default function VerifyPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <header className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/param-mark.svg" alt="" className="mx-auto h-11 w-11" />
          <p className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.2em] text-ink-soft">
            PARAM · Filing Integrity Seal
          </p>
          <h1 className="mt-3 font-serif text-[30px] leading-tight tracking-[-0.02em] text-ink">
            Verify a sealed filing.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink-soft">
            Upload the seal and the bundle it covers. PARAM re-hashes every document and
            re-checks the signature, and will name any document that has changed. Nothing
            you upload here is stored.
          </p>
        </header>

        <div className="mt-10">
          <VerifyForm />
        </div>

        <footer className="mt-12 border-t border-rule pt-6 text-center text-[11.5px] leading-relaxed text-ink-soft">
          A PARAM seal is an integrity record, not a digital signature or electronic
          signature under the Information Technology Act, 2000. It is not issued against a
          certificate from a licensed Certifying Authority and does not replace a DSC or
          Aadhaar eSign where one is required. It evidences only that a set of documents is
          unchanged since PARAM examined it.
        </footer>
      </div>
    </main>
  );
}
