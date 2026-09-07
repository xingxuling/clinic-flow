import type { ChannelKind, Clinic, ID } from "@/types/domain";

export interface ServiceTenantChannel {
  channel: ChannelKind;
  connected: boolean;
  note: string;
}

export interface ServiceTenant {
  id: ID;
  verticalId: string;
  displayName: string;
  district: string;
  phone: string;
  timezone: string;
  reminderLeadHours: number[];
  channels: ServiceTenantChannel[];
  privacy: {
    retentionDays: number;
    maskCustomerPhoneInLists: boolean;
  };
}

/**
 * 现有 Clinic 数据模型的兼容适配器。
 * 新行业不应为了复用 Core 而伪装成 Clinic；新的持久化层最终直接提供 ServiceTenant。
 */
export function clinicToServiceTenant(
  clinic: Clinic,
  verticalId: string,
): ServiceTenant {
  return {
    id: clinic.id,
    verticalId,
    displayName: clinic.name,
    district: clinic.district,
    phone: clinic.phone,
    timezone: clinic.timezone,
    reminderLeadHours: [...clinic.settings.reminderLeadHours],
    channels: clinic.settings.channels.map((channel) => ({ ...channel })),
    privacy: {
      retentionDays: clinic.settings.privacy.retentionDays,
      maskCustomerPhoneInLists: clinic.settings.privacy.maskPhoneInLists,
    },
  };
}
