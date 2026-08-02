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
        <h1 className="text-2xl font-semibold tracking-[-0.02em] lg:text-[28px]">
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
