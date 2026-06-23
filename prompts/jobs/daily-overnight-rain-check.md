![[components/output-rule.md]]

## Task

Run every day at 5:00 PM America/Los_Angeles.

Check the weather forecast for Aaron's local area in Walnut Creek / Acalanes Ridge, California.
Look specifically for whether rain is expected overnight or by the next morning.

If overnight rain is expected:
- Send a short message reminding Aaron to cover the outdoor couches.
- Also remind Aaron to pick up anything outside that cannot get wet.

If rain is not expected overnight:
- Output exactly `NO_REPLY`.

## Message requirements

If you send a message:
- Keep it short and practical.
- Mention rain clearly.
- Include the two actions: cover the outdoor couches and pick up anything that can't get wet.
- Do not mention internal reasoning or forecast details unless useful.
- Do not mention delivery, routing, or any internal system details.
