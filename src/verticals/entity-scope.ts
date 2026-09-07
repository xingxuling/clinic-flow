export interface VerticalScopedEntity {
  verticalId?: string;
}

/**
 * 早期 Clinic Flow seed 没有 verticalId；它们全部来自 dental-only prototype。
 * 新实体从平台化版本开始必须写入 verticalId。
 */
export function entityVerticalId(entity: VerticalScopedEntity): string {
  return entity.verticalId?.trim() || "dental";
}

export function belongsToVertical(
  entity: VerticalScopedEntity,
  verticalId: string,
): boolean {
  return entityVerticalId(entity) === verticalId;
}

export function filterByVertical<T extends VerticalScopedEntity>(
  rows: readonly T[],
  verticalId: string,
): T[] {
  return rows.filter((row) => belongsToVertical(row, verticalId));
}
