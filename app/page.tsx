import Image from "next/image";
import { Check, FileSearch, Scale } from "lucide-react";
import AuthCard from "@/components/landing/AuthCard";

const CAPABILITIES = [
  {
    icon: FileSearch,
    title: "Bundle forensics",
    detail: "OCR, margins, pagination and annexures, checked page by page.",
  },
  {
    icon: Scale,
    title: "Limitation intelligence",
    detail: "A transparent statutory working, not a black-box date.",
  },
  {
    icon: Check,
    title: "One cited memo",
    detail: "Every defect, its source and the precise next action.",
  },
];

/*
  The front door always shows the front door.

  This used to send anyone holding a session straight through to the workspace,
  which meant that pasting the address a second time skipped the sign-in screen
  entirely: you were simply inside. That is wrong for a shared link, where the
  first thing a visitor should meet is the door and not somebody else's open
  filing, and it hid the one screen that says what PARAM is.

  Signing in still lands on the upload screen, so nobody is made to navigate
  twice. The session is left alone: this is about what the root address shows,
  not about throwing anybody out.
*/
export default function LandingPage() {
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#171313] text-white">
      <Image
        src="/images/param-court-hero-v2.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[57%_center]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,15,18,0.96)_0%,rgba(25,18,19,0.90)_34%,rgba(75,25,32,0.59)_57%,rgba(20,17,17,0.16)_78%,rgba(16,14,14,0.38)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(10,12,14,0.76)_0%,transparent_48%,rgba(8,10,12,0.24)_100%)]" />
      <div className="absolute inset-0 opacity-[0.11] [background-image:linear-gradient(rgba(255,255,255,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.14)_1px,transparent_1px)] [background-size:88px_88px]" />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[100rem] flex-col gap-12 px-6 py-7 sm:px-10 lg:grid lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:gap-[clamp(4rem,7vw,8rem)] lg:px-[clamp(3.5rem,5vw,5.5rem)] lg:py-8">
        <section className="flex min-w-0 flex-col lg:min-h-[calc(100svh-4rem)]">
          <header className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/param-mark.svg" alt="" className="h-[70px] w-[70px]" />
            <div>
              <div className="font-serif text-[clamp(2.5rem,4.7vw,4rem)] font-bold leading-[0.8] tracking-[-0.035em] text-[#fffaf0]">
                PARAM
              </div>
              <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#e9bd72] xl:text-[12px]">
                Pre Assessment Registry and Audit Mitra
              </div>
            </div>
          </header>

          <div className="my-auto max-w-[51rem] py-8">
            <h1 className="landing-reveal max-w-[50rem] font-serif text-[clamp(3.15rem,4.7vw,4.8rem)] font-semibold leading-[0.98] tracking-[-0.046em] text-[#fffaf0]">
              The Registry
              <span className="block text-[#e2ad5d]">shouldn&apos;t find it first.</span>
            </h1>

            <p className="landing-reveal landing-reveal-delay-1 mt-6 max-w-[43rem] text-[17px] leading-[1.75] text-white/85 sm:text-[18px]">
              PARAM reads the complete filing bundle before submission. It catches
              preventable defects, flags limitation risk and shows the authority behind every finding.
            </p>

            <div className="landing-reveal landing-reveal-delay-2 mt-8 grid max-w-[47rem] gap-4 sm:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, detail }) => (
                <article
                  key={title}
                  className="rounded-[19px] border border-white bg-[#fffdfa]/97 px-5 py-4 text-center text-[#27282c] shadow-[0_20px_44px_-28px_rgba(0,0,0,0.92)] backdrop-blur-md"
                >
                  <span className="mx-auto block h-px w-20 bg-[#e5d3b3]" />
                  <span className="mx-auto mt-3.5 grid h-14 w-14 place-items-center rounded-full bg-[#f5e9de] text-[#842d38] ring-1 ring-[#842d38]/10">
                    <Icon className="h-7 w-7" strokeWidth={1.7} />
                  </span>
                  <h2 className="mt-3 text-[16px] font-bold leading-tight text-[#25394c]">{title}</h2>
                  <p className="mx-auto mt-1.5 max-w-[12rem] text-[13px] leading-[1.5] text-[#5f6f7e]">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center pb-8 lg:pb-0">
          <AuthCard />
        </section>
      </div>
    </main>
  );
}
