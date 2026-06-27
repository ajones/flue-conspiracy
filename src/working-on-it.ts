const MESSAGES = [
  'No looking back... 🏃',
  'Unlocking the mystery... 🔓',
  'On the trail... 🌲',
  'Diving deep... 🤿',
  'Putting on the lab coat... 🥼',
  'Spinning the vinyl... 🎚️',
  'Revving the engine... 🏍️',
  'Lighting the fuse... 🧨',
  'Stepping into the arena... 🏟️',
  'Making magic happen... ✨',
  'Tuning the instruments... 🎸',
  "Let's roll... 🎲",
  'Taking the plunge... 🪂',
  'High gear engaged... ⚙️',
  'Beeping intensely... 🤖',
];

export function pickWorkingOnItMessage(): string {
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
}
