import { cn } from "@/lib/utils";

export function SquirrlMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("squirrl-mark", className)} aria-hidden="true">
      <path d="M43 20c12-15 22-1 14 11-5 8-16 7-23 4 6-1 12-4 13-9 1-3-1-5-4-6Z" />
      <path d="M24 27c0-8 5-14 12-14l-2 7c7 3 11 10 10 18-1 10-8 16-19 15-9-1-15-8-15-17 0-6 3-10 8-13l1-9 8 6" />
      <circle cx="31" cy="26" r="2.5" className="squirrl-mark-eye" />
    </svg>
  );
}

export function SquirrlMascot({ className, label }: { className?: string; label?: string }) {
  return (
    <figure className={cn("squirrl-mascot", className)} aria-hidden="true">
      <svg viewBox="0 0 150 120">
        <path
          className="squirrl-tail"
          d="M96 24c28-31 55-3 38 26-12 21-38 20-59 8 18-1 31-10 34-20 2-8-4-13-13-14Z"
        />
        <path
          className="squirrl-body"
          d="M54 43c0-17 11-29 26-29l-5 16c17 5 28 20 25 38-3 25-21 39-47 35-21-3-35-20-33-41 1-13 8-23 19-29l3-20 17 14"
        />
        <path className="squirrl-line" d="M42 83c13-8 32-6 48 10" />
        <path className="squirrl-line" d="M57 99c-3 10-11 13-20 12M78 101c3 8 11 10 20 8" />
        <circle cx="66" cy="42" r="4" className="squirrl-eye" />
        <path className="squirrl-face" d="M78 51c6 4 11 4 16 1" />
        <path className="squirrl-highlight" d="M49 59c8 1 14 5 18 11" />
      </svg>
      {label ? <figcaption>{label}</figcaption> : null}
    </figure>
  );
}
