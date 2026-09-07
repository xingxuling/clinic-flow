import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, UserPlus } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/StaffShell";
import {
  MdButton,
  MdCard,
  MdChip,
  MdDialog,
  MdSelect,
  MdTextField,
  SectionHeader,
} from "@/components/m3";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, roleLabelFor } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/labels";
import { useApp } from "@/state/app-store";
import type { StaffRole } from "@/types/domain";
import { useTenantVertical } from "@/verticals/use-tenant-vertical";

export const Route = createFileRoute("/staff/_app/staff")({
  head: () => ({
    meta: [
      { title: "員工與權限｜Service Frontdesk" },
      { name: "description", content: "服務業角色權限矩陣、員工狀態與邀請管理。" },
    ],
  }),
  component: StaffPage,
});

const ROLES: StaffRole[] = ["owner", "practitioner", "nurse", "reception", "finance", "readonly"];

function StaffPage() {
  const { staff, invites, createInvite, revokeInvite, currentStaff, clinic } = useApp();
  const vertical = useTenantVertical(clinic);
  const [open, setOpen] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);

  return (
    <PageContainer
      title="員工與權限"
      subtitle={`${vertical.displayName} · 你目前的角色：${roleLabelFor(vertical, currentStaff.role)}`}
      actions={
        <MdButton icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>
          邀請員工
        </MdButton>
      }
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <SectionHeader title="員工" count={staff.length} />
          <MdCard className="divide-y divide-outline-variant overflow-hidden">
            {staff.map((person) => (
              <div key={person.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-container md-label-l text-on-primary-container">
                  {person.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="md-title-m truncate text-on-surface">{person.name}</p>
                  <p className="md-body-s text-on-surface-variant">
                    {person.title} · 最後活躍 {fmtDateTime(person.lastActiveAt)}
                  </p>
                </div>
                <MdChip tone={person.active ? "primary" : "neutral"}>{roleLabelFor(vertical, person.role)}</MdChip>
                {!person.active && <MdChip tone="neutral">已停用</MdChip>}
              </div>
            ))}
          </MdCard>
        </section>

        <section>
          <SectionHeader title="邀請" count={invites.length} />
          <MdCard className="divide-y divide-outline-variant overflow-hidden">
            {invites.map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="md-title-m text-on-surface">{invite.inviteeName}</p>
                  <p className="md-body-s text-on-surface-variant">
                    密令 {invite.code} · {roleLabelFor(vertical, invite.role)} · 到期 {fmtDateTime(invite.expiresAt)}
                  </p>
                </div>
                <MdChip tone={invite.status === "pending" ? "tertiary" : "neutral"}>
                  {{ pending: "待使用", accepted: "已接受", revoked: "已撤銷", expired: "已過期" }[invite.status]}
                </MdChip>
                {invite.status === "pending" && (
                  <MdButton size="sm" variant="text" onClick={() => revokeInvite(invite.id)}>
                    撤銷
                  </MdButton>
                )}
              </div>
            ))}
          </MdCard>
        </section>
      </div>

      <section className="mt-6">
        <SectionHeader title="權限矩陣" />
        <MdCard className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="p-3 text-left md-label-l text-on-surface-variant">權限</th>
                {ROLES.map((role) => (
                  <th key={role} className="p-3 md-label-l text-on-surface-variant">
                    {roleLabelFor(vertical, role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map((permission) => (
                <tr key={permission.key} className="border-b border-outline-variant last:border-0">
                  <td className="p-3 md-body-m text-on-surface">{permission.label}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="p-3 text-center">
                      {ROLE_PERMISSIONS[role].includes(permission.key) ? (
                        <Check className="mx-auto size-4 text-primary" />
                      ) : (
                        <Minus className="mx-auto size-4 text-on-surface-variant/50" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </MdCard>
        <p className="mt-2 md-body-s text-on-surface-variant">
          底層兼容 key 仍沿用早期 patient / appointment 命名；可見權限語義已統一為客戶、排程與行政資料。
        </p>
      </section>

      <MdDialog open={open} onClose={() => setOpen(false)} title="邀請員工">
        <form
          id="invite-form"
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const invite = createInvite({
              inviteeName: String(form.get("name")),
              role: String(form.get("role")) as StaffRole,
            });
            setLastCode(invite.code);
          }}
        >
          <MdTextField label="姓名" name="name" placeholder="新同事姓名" required />
          <MdSelect label="角色" name="role" defaultValue="reception">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabelFor(vertical, role)}
              </option>
            ))}
          </MdSelect>
        </form>
        {lastCode && (
          <p className="mt-4 rounded-lg bg-primary-container p-3 md-body-m text-on-primary-container">
            邀請密令：<strong>{lastCode}</strong>（示範版可直接用於登入頁）
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <MdButton variant="text" onClick={() => setOpen(false)}>關閉</MdButton>
          <MdButton type="submit" form="invite-form">產生邀請</MdButton>
        </div>
      </MdDialog>
    </PageContainer>
  );
}
