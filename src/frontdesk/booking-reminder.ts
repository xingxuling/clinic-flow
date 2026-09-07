import { bookingInteractionPayload } from "@/frontdesk/booking-interaction";
import type { InteractiveReplyOption } from "@/integrations/messaging-adapter";
import type { ServiceVerticalPack } from "@/verticals/types";

export interface BookingReminderView {
  text: string;
  bookingId: string;
  replyOptions: InteractiveReplyOption[];
}

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

/**
 * 通用服务提醒，只处理服务/预约行政资料。
 * 不读取病历、宠物健康资料、车辆故障判断或危险维修建议。
 */
export function buildBookingReminder(input: {
  vertical: ServiceVerticalPack;
  timezone: string;
  customerName: string;
  bookingId: string;
  startAt: string;
  serviceName: string;
  resourceName?: string;
}): BookingReminderView {
  const when = formatDateTime(input.startAt, input.timezone);
  const labels = input.vertical.labels;
  const resourceLine = input.resourceName
    ? `${labels.resource}：${input.resourceName}。`
    : null;

  const text = [
    `${input.customerName}你好，提提你：`,
    `${when} 有一個「${input.serviceName}」${labels.booking}。`,
    resourceLine,
    `你可以直接按下面按鈕確認、改期或取消。接近服務時間的改動可能需要${labels.staff}確認。`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return {
    text,
    bookingId: input.bookingId,
    replyOptions: [
      {
        id: `confirm_${input.bookingId}`,
        label: "確認",
        payload: bookingInteractionPayload({
          kind: "confirm",
          bookingId: input.bookingId,
        }),
      },
      {
        id: `reschedule_${input.bookingId}`,
        label: "改期",
        payload: bookingInteractionPayload({
          kind: "reschedule_request",
          bookingId: input.bookingId,
        }),
      },
      {
        id: `cancel_${input.bookingId}`,
        label: "取消",
        payload: bookingInteractionPayload({
          kind: "cancel",
          bookingId: input.bookingId,
        }),
      },
    ],
  };
}
