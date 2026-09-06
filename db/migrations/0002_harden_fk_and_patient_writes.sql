-- Clinic Flow security hardening v0.2
-- 1. 复合外键包含 NOT NULL clinic_id，不能使用默认 ON DELETE SET NULL；改为 RESTRICT。
-- 2. 病人不直接 UPDATE patients 基表；所有写动作由服务器状态机在受控上下文中提交。

begin;

alter table conversations
  drop constraint if exists conversations_clinic_id_assigned_to_fkey,
  add constraint conversations_clinic_id_assigned_to_fkey
    foreign key (clinic_id, assigned_to)
    references staff(clinic_id, id)
    on delete restrict;

alter table urgent_flags
  drop constraint if exists urgent_flags_clinic_id_handled_by_fkey,
  add constraint urgent_flags_clinic_id_handled_by_fkey
    foreign key (clinic_id, handled_by)
    references staff(clinic_id, id)
    on delete restrict;

alter table agent_tasks
  drop constraint if exists agent_tasks_clinic_id_related_patient_id_fkey,
  add constraint agent_tasks_clinic_id_related_patient_id_fkey
    foreign key (clinic_id, related_patient_id)
    references patients(clinic_id, id)
    on delete restrict,
  drop constraint if exists agent_tasks_clinic_id_related_conversation_id_fkey,
  add constraint agent_tasks_clinic_id_related_conversation_id_fkey
    foreign key (clinic_id, related_conversation_id)
    references conversations(clinic_id, id)
    on delete restrict,
  drop constraint if exists agent_tasks_clinic_id_decided_by_fkey,
  add constraint agent_tasks_clinic_id_decided_by_fkey
    foreign key (clinic_id, decided_by)
    references staff(clinic_id, id)
    on delete restrict;

alter table agent_execution_receipts
  drop constraint if exists agent_execution_receipts_clinic_id_executed_by_fkey,
  add constraint agent_execution_receipts_clinic_id_executed_by_fkey
    foreign key (clinic_id, executed_by)
    references staff(clinic_id, id)
    on delete restrict;

alter table staff_invites
  drop constraint if exists staff_invites_clinic_id_redeemed_by_staff_id_fkey,
  add constraint staff_invites_clinic_id_redeemed_by_staff_id_fkey
    foreign key (clinic_id, redeemed_by_staff_id)
    references staff(clinic_id, id)
    on delete restrict;

alter table outbound_messages
  drop constraint if exists outbound_messages_clinic_id_conversation_id_fkey,
  add constraint outbound_messages_clinic_id_conversation_id_fkey
    foreign key (clinic_id, conversation_id)
    references conversations(clinic_id, id)
    on delete restrict;

-- 病人只允许读取自己的最小数据行；不允许直接改基表。
drop policy if exists patients_self_update on patients;

commit;
