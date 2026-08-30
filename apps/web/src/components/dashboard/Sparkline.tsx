"use client";

import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface SparklineProps {
  /** Data points, in chronological order. Non-finite values are filtered out. */
  data: number[];
  /** Accessible description announced to screen readers. */
  label: string;
  /** Tailwind color class for the stroke, e.g. "text-emerald-400". */
  strokeClassName?: string;
  className?: string;
  /** Renders a soft gradient area under the line. */
  filled?: boolean;
}

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 32;

function buildPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({ data, label, strokeClassName = "text-violet-400", className, filled = true }: SparklineProps) {
  const gradientId = useId();
  const cleanData = useMemo(() => data.filter((value) => Number.isFinite(value)), [data]);

  const { linePath, areaPath, points } = useMemo(() => {
    if (cleanData.length === 0) return { linePath: "", areaPath: "", points: [] };
    const min = Math.min(...cleanData);
    const max = Math.max(...cleanData);
    const range = max - min || 1;
    const count = cleanData.length;
    const step = count > 1 ? VIEWBOX_WIDTH / (count - 1) : VIEWBOX_WIDTH;
    const mapped = cleanData.map((value, index) => ({
      x: index * step,
      // invert: higher values draw higher (smaller y)
      y: VIEWBOX_HEIGHT - ((value - min) / range) * (VIEWBOX_HEIGHT - 4) - 2,
    }));
    const line = buildPath(mapped);
    const area = `${line} L${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT} L0 ${VIEWBOX_HEIGHT} Z`;
    return { linePath: line, areaPath: area, points: mapped };
  }, [cleanData]);

  if (cleanData.length === 0) {
    return (
      <div className={cn("flex h-8 items-center text-[10px] text-zinc-600", className)} role="img" aria-label={label}>
        No data
      </div>
    );
  }

  const lastPoint = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full overflow-visible", className)}
      role="img"
      aria-label={label}
    >
      {filled && linePath ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className={cn("af-spark-fill", strokeClassName)} stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" className={cn("af-spark-fill", strokeClassName)} stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      ) : null}
      {filled && areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" /> : null}
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={cn("af-spark-line", strokeClassName)}
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={2.5}
        fill="currentColor"
        className={cn(strokeClassName)}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
