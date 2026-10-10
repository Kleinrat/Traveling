// Narrow host bridge: all extraction contracts and validation live in MoonBit.
import { assistant_system, assistant_context, validate_for_current } from '../web/engine.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input);
if (data.action === 'prompt') {
  process.stdout.write(JSON.stringify({system: assistant_system(), user: assistant_context(JSON.stringify(data.current), data.message)}));
} else if (data.action === 'validate') {
  process.stdout.write(validate_for_current(data.content, JSON.stringify(data.current)));
} else throw new Error('Unknown bridge action');
