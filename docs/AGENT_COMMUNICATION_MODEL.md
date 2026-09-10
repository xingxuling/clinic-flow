# Dual Agent Communication Model

## Job-scoped topology

Each confirmed booking creates one Job Conversation with two bounded roles:

```text
Customer Agent ─┐
                ├─ Job Conversation ── Human takeover
Worker Agent ───┘
```

The agents coordinate service logistics only inside the Job. They do not become
the source of truth for availability, prices, identity, private contact data or
professional judgment.

## Structured intent

`compileConversationIntent` converts text into a `ConversationIntent` with:

- Job ID and sender side;
- target side;
- one bounded intent kind;
- typed-as-string parameters;
- original source text;
- explicit status (`proposed`, `blocked`, `awaiting_human` or
  `ready_for_policy`).

Supported examples include availability, time change/reschedule, information,
price, photo, delay, arrival, cancellation and service completion. Private phone
requests are mapped to a Privacy Broker capability and are blocked by default.

The Agent runtime requires the caller's actual Customer/Worker subject ID. A
public Job identity or text assertion cannot authenticate a participant.

## Human controls

`REQUEST_HUMAN` pauses the Job Conversation and sets the existing customer
automation control to human-only. A later message cannot implicitly resume the
Agent. WhatsApp `STOP` and existing opt-out phrases go through the current
control repository, set WhatsApp opt-out/human-only state and stop automated
handling.

Unresolved or prompt-injected requests do not become actions. They produce a
bounded response and require human handling where the policy is uncertain.

## Channel adapter boundary

Conversation intent compilation is not message delivery. Scheduling
notifications go through `dispatchSchedulingNotification`; WhatsApp sends in
that gateway call the existing `evaluateWhatsAppPolicy` gate for tenant Agent
pause, human-only, opt-in/scope, STOP/opt-out, 24-hour window, templates and
official production provider eligibility. The adapter receives a real recipient
phone only from the channel boundary; internal IDs are never coerced into phone
numbers.

## Evidence boundary

The local UI can simulate both sides and display the policy result. It does not
prove a live WhatsApp account, Meta template approval, production delivery,
worker mobile app or remote webhook behavior.
