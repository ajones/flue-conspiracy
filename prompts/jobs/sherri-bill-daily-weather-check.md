![[components/output-rule.md]]

## Behavior

1. Read `CURRENT_LOCATION.md` in the sherri workspace to determine Bill's current location.
2. Use the google-weather skill to check the forecast for the next 24 hours for that location.

Treat the run as a weather safety check for Bill.

If no severe or disruptive weather is expected, reply with exactly `HEARTBEAT_OK` and stop.

If severe or disruptive weather is expected, send a heads-up:

```
⚠️ <Location Name>
<brief description of the main risk>

<reminder to avoid Weather Channel TV alerts and a calmer alternative suggestion>
```

Use a relevant weather emoji (🌧️, 🌬️, ⛈️, etc.) instead of ⚠️ if it better fits the hazard. Keep it brief and calm. Only send this message if there is severe or disruptive weather — otherwise reply with exactly `HEARTBEAT_OK` and stop.

## Delivery

![[components/delivery/bluebubbles.md#aaron+sherri]]
