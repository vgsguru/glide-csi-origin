import { ArrowLeft, Sparkles, ArrowRight, Check, RotateCcw, Download } from "lucide-react";
import { cn } from "@/lib/utils";

type Action = {
  key: string;
  label: string;
  Icon: typeof ArrowLeft;
  variant?: "default" | "primary";
  onClick?: () => void;
};

const ACTIONS: Action[] = [
  { key: "back", label: "Back", Icon: ArrowLeft },
  { key: "undo", label: "Undo", Icon: RotateCcw },
  { key: "ai", label: "AI Generate", Icon: Sparkles, variant: "primary" },
  { key: "apply", label: "Apply", Icon: Check },
  { key: "export", label: "Export", Icon: Download },
  { key: "next", label: "Next", Icon: ArrowRight },
];

export function LiquidGlassActions() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-wrap justify-center gap-3 px-4">
      {ACTIONS.map(({ key, label, Icon, variant, onClick }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "glass-panel pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-transform hover:scale-[1.04] active:scale-[0.97]",
            variant === "primary"
              ? "text-foreground"
              : "text-foreground/90 hover:text-foreground",
          )}
        >
          <Icon className="relative z-10 h-4 w-4" strokeWidth={2} />
          <span className="relative z-10">{label}</span>
        </button>
      ))}
    </div>
  );
}
