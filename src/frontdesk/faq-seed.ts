import type { ClinicFaqEntry } from "@/frontdesk/faq-engine";
import { dentalVerticalPack } from "@/verticals/dental";
import { materializeFaqEntries } from "@/verticals/registry";

/**
 * 完全虚构的演示 FAQ。
 *
 * 行业共性来自 dentalVerticalPack；晴和牙科中心的名称、地点和演示营业时间只属于 tenant override。
 */
export const demoDentalFaq: ClinicFaqEntry[] = materializeFaqEntries(
  dentalVerticalPack,
  "clinic_cinghe",
).map((entry) => {
  if (entry.id === "faq_hours") {
    return {
      ...entry,
      question: "你哋幾點開門？",
      answer: "晴和牙科中心星期一至五主要診症時段由上午 9:30 開始；實際可預約時間請以系統顯示為準。",
      keywords: ["幾點開", "營業時間", "開門", "收幾點", "星期日", "星期六"],
    };
  }
  if (entry.id === "faq_location") {
    return {
      ...entry,
      question: "診所喺邊？",
      answer: "晴和牙科中心位於香港觀塘。正式接入診所後，這裡會顯示診所核准的完整地址與交通方式。",
      keywords: ["喺邊", "地址", "點去", "位置", "地鐵", "交通"],
    };
  }
  return entry;
});
