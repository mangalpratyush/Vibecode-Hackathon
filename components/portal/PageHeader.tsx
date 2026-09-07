/**
 * One heading treatment for every portal screen.
 *
 * Eyebrow, serif title, one line of lead. Having it in a single place is what
 * keeps four pages looking like one product rather than four.
 */
export default function PageHeader({
  eyebrow,
  title,
  lead,
  action,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-serif text-[30px] leading-[1.12] tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {lead && (
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{lead}</p>
        )}
      </div>
      {action}
    </header>
  );
}
