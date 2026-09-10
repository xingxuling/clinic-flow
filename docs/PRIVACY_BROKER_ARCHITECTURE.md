# Privacy Broker Architecture

## Purpose

The Privacy Broker is a job-scoped disclosure boundary between Customer Agent,
Worker Agent, staff and private data. It minimizes data at each service stage
and records every allow/block decision.

## Domain separation

The scheduling domain stores IDs, approximate area, service, time, duration,
requirements and reservation state. The privacy context stores public Job
identities (`Customer #…` and `Worker #…`) and a reference to a private vault;
it does not store private phone numbers or exact address values.

`PrivateDataVault` is an injected boundary. The browser candidate uses an empty
vault unless a deployment supplies a real vault implementation. A vault write
must not be interpreted as consent or authority to disclose.

## Progressive stages

| Stage | Default disclosure |
|---|---|
| `matching` | job identity, service, time, duration, requirements, approximate area |
| `confirmed` | the same job-scoped fields; no exact address or private phone |
| `near_service` | exact address only with active-service purpose and explicit consent |
| `completed` | identity, service, time and duration for retained operational history |

Phone and email capabilities are disabled by the default policy. A tenant may
provide a stricter policy; enabling private contact disclosure is a separate
policy decision and is never inferred from an Agent request.

## Authorization checks

Every access request checks:

- tenant and vertical scope;
- actual participant subject ID for Customer/Worker and their Agents;
- temporary context expiry;
- stage capability allow-list;
- exact-address purpose and consent;
- private-vault data availability.

The public Job ID is not an authentication credential. The caller must present
the authorized participant subject ID. Wrong participant, tenant, vertical,
purpose, consent or policy requests fail closed.

Exact-address consent is recorded separately from the context. Only a request
authenticated as the context's customer subject can create the consent record;
a Worker or Worker Agent cannot manufacture consent by setting a request flag.
The context stage is also server-controlled and can only advance through the
privacy lifecycle.

## Audit

`PrivacyAuditEvent` records context, Job, viewer, capability, purpose, decision,
consent flag, disclosed fields and time. Block events are retained as evidence
of the boundary being exercised, not only successful disclosures.

## Runtime boundary

The Broker returns a scoped view or a value after policy checks. It does not
send messages, mutate bookings, grant Agent execution authority or override the
existing human-approval and channel-policy controls. WhatsApp outbound delivery
must pass the existing WhatsApp Policy Gate at the channel boundary.
