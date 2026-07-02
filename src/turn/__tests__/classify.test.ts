import { classifyTurn, type ConversationMessage } from '../classify.ts';

const AGENT = '❄️';

interface Case {
  label: string;
  messages: ConversationMessage[];
  expect: string;
}

const cases: Case[] = [
  {
    label: 'YES to action-confirmation question → agent',
    messages: [
      { role: 'assistant', name: AGENT, text: 'Turn off if not using:\nAsh Office AC\nMain Floor Nest\nBedroom Nest\nWant me to turn them off?' },
      { role: 'user', name: 'Ashley Mahoney', text: 'Yes' },
    ],
    expect: 'agent',
  },
  {
    label: '"Sure" to action-confirmation question → agent',
    messages: [
      { role: 'assistant', name: AGENT, text: 'Should I schedule this for tomorrow?' },
      { role: 'user', name: 'Ashley Mahoney', text: 'Sure' },
    ],
    expect: 'agent',
  },
  {
    label: '"No" to action-confirmation question → agent (agent should acknowledge/stop)',
    messages: [
      { role: 'assistant', name: AGENT, text: 'Want me to send the summary now?' },
      { role: 'user', name: 'Ashley Mahoney', text: 'No' },
    ],
    expect: 'agent',
  },
  {
    label: 'Thanks after agent replied → none',
    messages: [
      { role: 'assistant', name: AGENT, text: 'Done! All three thermostats turned off.' },
      { role: 'user', name: 'Ashley Mahoney', text: 'Thanks' },
    ],
    expect: 'none',
  },
  {
    label: 'Human-to-human chatter → none',
    messages: [
      { role: 'user', name: 'Aaron', text: 'Hey Ashley what time does the game start?' },
      { role: 'user', name: 'Ashley Mahoney', text: '7pm I think' },
    ],
    expect: 'none',
  },
  {
    label: 'Direct question to agent → agent',
    messages: [
      { role: 'user', name: 'Ashley Mahoney', text: '❄️ can you check the weather in Phoenix?' },
    ],
    expect: 'agent',
  },
  {
    label: 'Message addressed to "bun" (not the agent) → none',
    messages: [
      { role: 'user', name: 'Aaron Jones', text: 'bun we can drop 1 of these. I was thinking about dropping the grilled cheese. Thoughts?' },
    ],
    expect: 'none',
  },
];

let passed = 0;
let failed = 0;

async function run() {
  for (const c of cases) {
    try {
      const result = await classifyTurn(c.messages, { agentName: AGENT });
      const ok = result === c.expect;
      if (ok) {
        console.log(`✅  ${c.label}`);
        passed++;
      } else {
        console.log(`❌  ${c.label}`);
        console.log(`    expected: ${c.expect}  got: ${result}`);
        failed++;
      }
    } catch (err) {
      console.log(`💥  ${c.label}`);
      console.log(`    ${err}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${passed + failed} passed`);
  if (failed > 0) process.exit(1);
}

run();
