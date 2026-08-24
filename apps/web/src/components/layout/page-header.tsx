export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        {/* The display voice. Scaled to app sizes rather than the reference's
          80-96px marketing hero, and tracked in rather than lightened —
          the substitute serif ships at weight 400 where the reference
          specifies 300. */}
      <h1 className="font-serif text-[26px] leading-none font-normal tracking-[-0.01em] lg:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
