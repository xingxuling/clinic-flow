import type { AppointmentStatus, ReminderKind } from "@/types/domain";
import type { Tone } from "@/lib/labels";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface VerticalStatusPresentation {
  label: string;
  tone: Tone;
}

const STATUS_TONE: Record<AppointmentStatus, Tone> = {
  pending: "tertiary",
  confirmed: "primary",
  arrived: "secondary",
  no_show: "error",
  cancelled: "neutral",
};

function arrivedLabel(vertical: ServiceVerticalPack): string {
  switch (vertical.id) {
    case "dental":
    case "regulated-health":
      return "已到診";
    case "auto-repair":
      return "已入廠";
    case "home-service":
      return "已到場";
    case "pet-care":
    case "beauty":
      return "已到店";
    default:
      return "已到場";
  }
}

export function bookingStatusFor(
  vertical: ServiceVerticalPack,
  status: AppointmentStatus,
): VerticalStatusPresentation {
  const label: Record<AppointmentStatus, string> = {
    pending: "待確認",
    confirmed: "已確認",
    arrived: arrivedLabel(vertical),
    no_show: vertical.mode === "field_service" ? "未能完成" : "未出現",
    cancelled: "已取消",
  };
  return { label: label[status], tone: STATUS_TONE[status] };
}

export function arrivalActionLabel(vertical: ServiceVerticalPack): string {
  switch (vertical.id) {
    case "dental":
    case "regulated-health":
      return "到診";
    case "auto-repair":
      return "入廠";
    case "home-service":
      return "已到場";
    case "pet-care":
    case "beauty":
      return "到店";
    default:
      return "已到場";
  }
}

export function reminderKindFor(vertical: ServiceVerticalPack, kind: ReminderKind): string {
  switch (kind) {
    case "pre_visit":
      return `${vertical.labels.booking}前提醒`;
    case "recall_cleaning":
      return "定期召回";
    case "vaccine":
      return "定期服務跟進";
    case "followup":
      return "服務跟進";
    case "no_reply":
      return "未回覆跟進";
  }
}

export function safetyFlagLabel(vertical: ServiceVerticalPack): string {
  if (vertical.id === "dental" || vertical.id === "regulated-health") return "潛在緊急標記";
  return "高優先安全標記";
}

export function safetyBoundaryText(vertical: ServiceVerticalPack): string {
  if (vertical.id === "dental" || vertical.id === "regulated-health" || vertical.id === "pet-care") {
    return "系統只作風險訊號標記，不提供診斷、治療、用藥或專業分流結論。";
  }
  if (vertical.id === "auto-repair") {
    return "系統只作安全訊號標記，不判斷車輛是否可繼續行駛或自行給出維修結論。";
  }
  if (vertical.id === "home-service") {
    return "系統只作安全訊號標記，不自行判斷電力、燃氣、結構或維修風險等級。";
  }
  return "系統只作高優先訊號標記，未授權專業判斷一律交由人工處理。";
}
