export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 pb-7 pt-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[40px]">
          {title}
        </h1>
        <p className="mt-2 text-[15px] text-muted sm:text-base">{description}</p>
      </div>
      {children}
    </div>
  );
}
