import type { PlanFeature } from '@/lib/plans';

export function PlanFeatureText({ feature }: { feature: PlanFeature }) {
  return (
    <span>
      {feature.before}
      <strong className="font-semibold text-white">{feature.emphasis}</strong>
      {feature.after}
    </span>
  );
}
