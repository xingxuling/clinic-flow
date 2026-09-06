import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import { toast } from "sonner";

import { PatientPage } from "@/components/layout/PatientShell";
import { MdButton, MdCard, MdChip } from "@/components/m3";
import { fmtDate } from "@/lib/labels";
import { useApp } from "@/state/app-store";

export const Route = createFileRoute("/patient/_app/forms")({
  head: () => ({
    meta: [
      { title: "我的資料與表格｜晴和牙科中心" },
      { name: "description", content: "查看診所要求補交的表格資料，並上載所需文件。" },
      { property: "og:title", content: "我的資料與表格｜晴和牙科中心" },
      { property: "og:description", content: "查看診所要求補交的表格資料，並上載文件。" },
    ],
  }),
  component: PatientForms,
});

const KIND_LABEL: Record<string, string> = {
  insurance_form: "保險表格",
  referral: "轉介信",
  receipt: "收據",
  invoice: "帳單",
};

function PatientForms() {
  const { myDocuments } = useApp();

  return (
    <PatientPage title="資料與表格" subtitle="診所需要你補交或已為你備妥的文件">
      {myDocuments.length === 0 && (
        <MdCard variant="outlined" className="p-6 text-center md-body-m text-on-surface-variant">
          目前沒有需要處理的文件。
        </MdCard>
      )}

      {myDocuments.map((d) => {
        const needs = d.missingFields.length > 0;
        return (
          <MdCard key={d.id} variant="outlined" className="p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-on-surface-variant">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="md-title-m text-on-surface">{d.title}</p>
                <p className="md-body-s text-on-surface-variant">
                  {KIND_LABEL[d.kind] ?? "文件"}・更新於 {fmtDate(d.updatedAt)}
                  {d.amountHKD ? `・HK$${d.amountHKD}` : ""}
                </p>
              </div>
              <MdChip tone={needs ? "tertiary" : "primary"}>{needs ? "待你補交" : "已備妥"}</MdChip>
            </div>

            {needs ? (
              <>
                <ul className="mt-3 flex flex-col gap-1">
                  {d.missingFields.map((f) => (
                    <li key={f} className="md-body-m text-on-surface-variant">
                      ・{f}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <MdButton
                    variant="tonal"
                    icon={<Upload className="size-4" />}
                    onClick={() =>
                      toast.success("已收到上載（示範）", {
                        description: "實際版本會安全傳送至診所並記錄審計事件。",
                      })
                    }
                  >
                    上載文件
                  </MdButton>
                </div>
              </>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 md-body-s text-on-surface-variant">
                <CheckCircle2 className="size-4 text-primary" /> 診所已處理，可到診時領取或要求電郵。
              </p>
            )}
          </MdCard>
        );
      })}

      <p className="md-body-s text-on-surface-variant">
        本頁只顯示行政文件，不包含你的臨床病歷。
      </p>
    </PatientPage>
  );
}
