import { BriefcaseBusiness } from "lucide-react";

import { MdCard, MdChip } from "@/components/m3";
import { setTenantVertical } from "@/verticals/tenant-selection";
import { verticalPacks } from "@/verticals/registry";
import type { ServiceVerticalPack } from "@/verticals/types";

const selectable = verticalPacks.filter((pack) => pack.id !== "regulated-health");

export function VerticalSwitcher({
  tenantId,
  vertical,
  onChange,
}: {
  tenantId: string;
  vertical: ServiceVerticalPack;
  onChange?: (pack: ServiceVerticalPack) => void;
}) {
  return (
    <MdCard variant="outlined" className="mb-5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <BriefcaseBusiness className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="md-label-l text-on-surface">行業包</p>
          <p className="md-body-s text-on-surface-variant">
            切換只改行業語義、欄位與規則；Customer / Booking / Messaging / Follow-up Core 不複製。
          </p>
        </div>
        <MdChip tone="secondary">{vertical.displayName}</MdChip>
        <select
          aria-label="選擇行業包"
          className="h-10 rounded-xl border border-outline bg-surface px-3 md-label-l text-on-surface"
          value={vertical.id}
          onChange={(event) => {
            const next = selectable.find((pack) => pack.id === event.target.value);
            if (!next) return;
            setTenantVertical(tenantId, next.id);
            onChange?.(next);
          }}
        >
          {selectable.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.displayName}
            </option>
          ))}
        </select>
      </div>
    </MdCard>
  );
}
