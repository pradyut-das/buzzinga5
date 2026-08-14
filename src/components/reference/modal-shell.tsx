"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId } from "react";

export function ModalShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/20 px-4 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className="flex max-h-[92vh] w-full max-w-[610px] flex-col overflow-hidden rounded-[18px] border border-line bg-white shadow-modal"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-6 border-b border-line px-5 py-5 sm:px-6">
              <div>
                <h2 id={titleId} className="text-xl font-semibold tracking-[-0.02em] text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1.5 text-sm leading-5 text-muted">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-50 hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>
            <div className="app-scrollbar overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && (
              <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50/50 px-5 py-4 sm:px-6">
                {footer}
              </footer>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const modalLabelClass = "mb-2 block text-sm font-medium text-ink";
export const modalInputClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-[#ffd54a] focus:ring-2 focus:ring-[#fff3cc]";
export const modalTextareaClass =
  "min-h-28 w-full resize-y rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-[#ffd54a] focus:ring-2 focus:ring-[#fff3cc]";
