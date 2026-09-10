# Privacy Broker Threat Model

## Assets

- customer and worker private phones/emails;
- exact service address;
- participant identity and Job linkage;
- scheduling requirements and attachments;
- tenant-scoped audit and consent records.

## Trust boundaries

1. Customer/Worker channel input → intent compiler;
2. intent compiler → Job Conversation;
3. scheduling repository → Privacy Broker;
4. private vault → scoped disclosure view;
5. notification gateway → channel adapter/provider;
6. browser candidate → production server/provider.

## Threats and controls

| Threat | Control | Residual status |
|---|---|---|
| Cross-tenant or cross-vertical lookup | composite scope checks in repository and Broker | local tests pass; server/RLS migration not executed |
| Wrong participant uses a public Job ID | actual subject ID required for customer/worker Agent access | local tests pass |
| Prompt injection requests a private phone | intent is capability-mapped; default phone policy blocks before vault value | local tests pass |
| Exact address disclosed too early or with forged consent | server-controlled near-service stage + purpose + customer-bound consent record + vault | local tests pass |
| Agent continues after human request | Job Conversation human-only state plus existing customer control | local tests pass |
| WhatsApp opt-out is ignored | existing STOP/opt-out control repository | local tests pass; live webhook not verified |
| Double booking under concurrent requests | local slot lock plus PostgreSQL GiST exclusion candidate | database migration not executed |
| Browser localStorage tampering | local UI labeled candidate; server session/RLS required for production | production boundary open |
| Private value remains in context or notification body | context contains vault ref only; notification text is job-scoped | static/source check; storage audit open |
| Provider bypasses WhatsApp rules | dedicated notification gateway invokes existing Policy Gate | local policy test passes; all legacy inbound paths need server integration audit |

## Non-goals

This phase does not claim end-to-end encryption, live Meta policy approval,
device compromise resistance, a production secret store, or regulatory
certification. Those require deployment-specific review and human acceptance.
