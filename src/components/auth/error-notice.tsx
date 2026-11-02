import { Galet } from "@/components/brand/Galet";
import { cn } from "@/lib/cn";

/** Error message with the worried Galet, announced to assistive technologies. */
export function ErrorNotice({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 rounded-md border border-status-open bg-status-open-bg px-3.5 py-3 text-ui font-medium text-status-open",
        className,
      )}
    >
      <Galet mood="worried" size={32} />
      <span>{message}</span>
    </div>
  );
}
