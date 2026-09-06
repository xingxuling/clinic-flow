# 診所行政 Agent（Clinic Admin Agent）

面向香港小型牙科診所、普通科診所與物理治療中心的**邀請制行政後台**。
不是公開官網、沒有公開註冊；只有獲診所負責人邀請的團隊成員才能進入。

目前版本為**高完成度可點擊示範（Demo）**：全部資料為虛構，未連接任何真實醫療、
保險、WhatsApp 或電話系統。

---

## 一、產品定位

系統只做一件事：**把診所前台與行政工作，變成可審計、可控制的工作流。**

包含模組：

| 模組 | 路徑 | 內容 |
| --- | --- | --- |
| 邀請登入 | `/` | 邀請密令、二維碼邀請（佔位）、Passkey／裝置綁定（佔位） |
| 今日工作台 | `/app/today` | 今日預約、待確認、待回覆、緊急標記、待批 Agent 任務、文件異常 |
| 對話中心 | `/app/inbox` | WhatsApp／電話／網頁統一收件匣、AI 建議草稿、人工接管 |
| 預約中心 | `/app/appointments` | 日／週視圖、新建、確認、改期、取消、空檔查找 |
| 提醒與召回 | `/app/reminders` | 就診前提醒、洗牙 6／12 個月、疫苗／覆診、未回覆跟進 |
| Agent 任務台 | `/app/agent` | 準備做什麼／依據什麼／會修改什麼；高風險必須人工批准 |
| 行政文件 | `/app/documents` | 保險表格、轉介信、收據、發票的分類、缺欄位、異常提示 |
| 病人目錄 | `/app/patients` | 只顯示行政最低必要資料 |
| 員工與權限 | `/app/staff` | 六種角色、權限矩陣、邀請與撤銷 |
| 審計日誌 | `/app/audit` | 誰／哪個 Agent、何時、做了什麼、結果如何 |
| 診所設定 | `/app/settings` | 營業時間、服務、提醒規則、緊急關鍵詞、渠道、隱私 |

示範登入密令：`CINGHE-2026`、`CINGHE-NURSE-77`。

---

## 二、安全與責任邊界（重要）

1. **不作醫學用途。** 系統不提供診斷、分流結論或治療建議。
   「緊急標記」只是**關鍵詞／規則比對**，永遠附上病人原話與觸發原因，
   由人手決定如何處理。
2. **高風險動作不自動執行。** 取消預約、加插緊急時段、對外發出文件等
   高風險 Agent 任務一律停在「等待人工批准」。
3. **行政最低必要原則。** 病人資料只保留聯絡與排程所需欄位；
   預設不儲存臨床病歷、影像或用藥紀錄。
4. **全部留痕。** 成功、失敗與被權限阻止的操作都會寫入審計日誌。
5. **多租戶隔離。** 所有實體帶 `clinicId`，Repository 的每個查詢都以
   `clinicId` 收窄，不同診所的員工、病人、預約、規則、訊息、文件與審計完全獨立。
6. **示範版限制。** 目前登入為前端示範閘門（`localStorage`），
   **不構成真實身分驗證**，正式上線前必須改為伺服器端驗證（見下節）。

---

## 三、技術結構

- TypeScript 嚴格模式、React 19、TanStack Start／Router、Tailwind v4。
- Material Design 3 設計系統定義於 `src/styles.css`：
  M3 語義色角色、surface 層級、狀態層、圓角與排版尺度。
  組件不得硬寫顏色，只用語義 token。
- `src/components/m3/` 為 M3 基礎組件（Button、Card、Chip、Badge、FAB、
  Segmented Button、Dialog、TextField、Switch）。
- `src/components/layout/AppShell.tsx`：桌面 Navigation Rail、手機 Bottom
  Navigation 與 Modal Drawer。
- 領域類型：`src/types/domain.ts`
  （`Clinic` / `Staff` / `Patient` / `Appointment` / `Conversation` /
  `AgentTask` / `Reminder` / `DocumentCase` / `AuditEvent` / `Invite`）。
- 資料層：`src/data/repository.ts` 的 `ClinicRepository` 介面 +
  `InMemoryClinicRepository`（示範資料在 `src/data/seed.ts`）。
- 狀態機：`src/data/repository.ts`（預約）與 `src/lib/agent-rules.ts`
  （Agent 任務、緊急關鍵詞）。
- 權限：`src/lib/permissions.ts` 角色 → 權限矩陣。

### 指令

```bash
bun run dev        # 開發
bun run build      # 生產建置
bunx vitest run    # 狀態轉換與權限測試
```

### 測試覆蓋

`src/lib/__tests__/state-transitions.test.ts`：預約狀態機、Agent 任務狀態機、
高風險不可自動執行、緊急關鍵詞比對、角色權限、多租戶隔離。

### PWA

`public/manifest.webmanifest` + 應用圖示，可加到手機主畫面以獨立視窗開啟。
目前**未**啟用 Service Worker，因此沒有離線快取。

---

## 四、後續真實整合點

替換 `ClinicRepository` 的實作即可接上真實資料庫，UI 與狀態機不需改動。

| 位置 | 現況 | 正式版做法 |
| --- | --- | --- |
| `src/data/repository.ts` | 記憶體資料 | PostgreSQL／Supabase，每張表 `clinic_id` + RLS 政策 |
| 登入（`src/state/app-store.tsx`） | `localStorage` 示範閘門 | 伺服器端 session、邀請碼一次性核銷、WebAuthn Passkey 裝置綁定 |
| WhatsApp 渠道 | 模擬適配器 | WhatsApp Business Cloud API，webhook 收訊 |
| 電話渠道 | 模擬語音轉錄 | 電話系統／語音轉文字服務 |
| Agent 任務執行 | 前端狀態轉換 | 伺服器工作佇列 + 明確權限鏈與逾時重試 |
| 保險／收據文件 | 模擬檔案 | 診所實際使用的保險表格與會計系統 |
| 審計日誌 | 記憶體陣列 | Append-only 表，不可修改、可匯出 |
| 緊急關鍵詞 | 診所設定內的字串 | 可版本化的規則集，並保留每次命中的證據 |

## 雙端結構（病人前台 / 行政後台）

本系統是兩套互相獨立的產品面，共用同一個 domain / repository：

| | 病人前台 | 行政後台 |
|---|---|---|
| 路由 | `/patient/*` | `/staff/*` |
| 入口 | `/patient/login`：診所專屬連結、病人二維碼、手機一次性驗證碼 | `/staff/login`：邀請密令、員工二維碼、Passkey（佔位） |
| Session | `PatientSession`（`kind: "patient"`，localStorage key `cinghe.patient-session.v1`） | `StaffSession`（`kind: "staff"`，key `cinghe.staff-session.v1`） |
| 導航 | 手機 Bottom Navigation／桌面輕量 Rail，只有 5 項 | Navigation Rail／Drawer，10 項工作區 |
| 可見資料 | 只有自己的預約、訊息、行政文件、提醒與聯絡資料 | 全診所行政資料、Agent 任務、審計日誌、員工權限 |

- 兩種 session 在 hydration 時以 `kind` 嚴格校驗，員工 session 無法冒充病人身分，反之亦然。
- 病人端資料一律經 `src/data/patient-view.ts` 以 `clinicId + patientId` 收窄；改期只回傳 `availableSlots()` 產生的 `{ startAt, practitionerId }`，不暴露診所排程與其他病人。
- 病人端不顯示 Agent 任務、審計日誌、病人目錄、員工權限等任何後台功能。
- 根路徑 `/` 只是極簡入口選擇；舊有 `/app/*` 連結會重定向至 `/staff/*`。
