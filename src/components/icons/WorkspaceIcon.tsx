import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Workbench / Workspace icon component.
 * Vector redrawn to represent a computer desk/workbench with fine-line strokes.
 */
export const WorkspaceIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, size = 24, strokeWidth, ...props }, ref) => {
    // Detailed multiline icon requires fine stroke weight (~1.15) to maintain clarity across all sizes.
    // Scales proportionally when explicit strokeWidth is passed (e.g. 2 or 2.25).
    const parsedWidth =
      typeof strokeWidth === "number"
        ? strokeWidth
        : strokeWidth
          ? parseFloat(strokeWidth)
          : 2;
    const effective = strokeWidth ? (parsedWidth * 0.52).toFixed(2) : "1.15";

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={effective}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("lucide lucide-workspace", className)}
        {...props}
      >
        {/* Monitor Screen */}
        <rect x="6.8" y="2.8" width="9.4" height="5.2" rx="1.5" />
        {/* Monitor Stand / Neck */}
        <line x1="11.5" y1="8.0" x2="11.5" y2="9.8" />
        {/* Desk Top */}
        <rect x="2.2" y="9.8" width="19.6" height="2.6" rx="1.3" />
        {/* Left Leg */}
        <line x1="4.2" y1="12.4" x2="4.2" y2="21.0" />
        {/* Cabinet Frame */}
        <path d="M 13.5 12.4 V 20.4 a 0.6 0.6 0 0 0 0.6 0.6 h 5.8 a 0.6 0.6 0 0 0 0.6 -0.6 V 12.4" />
        {/* Middle Drawer Divider */}
        <line x1="13.5" y1="16.9" x2="20.5" y2="16.9" />
        {/* Drawer Handles */}
        <line x1="16.1" y1="14.85" x2="17.9" y2="14.85" />
        <line x1="16.1" y1="18.95" x2="17.9" y2="18.95" />
      </svg>
    );
  },
);

WorkspaceIcon.displayName = "WorkspaceIcon";

export const WorkbenchIcon = WorkspaceIcon;
