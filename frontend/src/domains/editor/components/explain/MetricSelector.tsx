import { Button } from "@/shared/components/ui/Button";
import { type Metric, ALL_METRICS, metricAvailable } from "../../explain/metrics";
import type { Plan } from "../../explain/types";

interface MetricSelectorProps {
  plan: Plan;
  value: Metric;
  onChange: (metric: Metric) => void;
}

export function MetricSelector({ plan, value, onChange }: MetricSelectorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Color by</span>
      {ALL_METRICS.filter((metric) => metricAvailable(plan, metric)).map((metric) => (
        <Button
          key={metric}
          variant="ghost"
          size="xs"
          onClick={() => onChange(metric)}
          className={
            value === metric
              ? "bg-foreground text-background hover:bg-foreground hover:text-background"
              : "capitalize"
          }
        >
          {metric}
        </Button>
      ))}
    </div>
  );
}
