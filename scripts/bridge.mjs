// Narrow host bridge: all extraction contracts and validation live in MoonBit.
import { assistant_system, assistant_context, validate_for_current, place_query_json, pending_places_json, route_query_json, route_result_json, route_options_json } from '../web/engine.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input);
if (data.action === 'prompt') {
  process.stdout.write(JSON.stringify({system: assistant_system(), user: assistant_context(JSON.stringify(data.current), data.message)}));
} else if (data.action === 'validate') {
  process.stdout.write(validate_for_current(data.content, JSON.stringify(data.current)));
} else if (data.action === 'place-query') {
  process.stdout.write(place_query_json(JSON.stringify(data.query)));
} else if (data.action === 'pending-places') {
  process.stdout.write(pending_places_json(JSON.stringify(data.items)));
} else if (data.action === 'route-query') {
  process.stdout.write(route_query_json(JSON.stringify(data.query)));
} else if (data.action === 'route-options') {
  process.stdout.write(route_options_json(JSON.stringify(data.options)));
} else if (data.action === 'route-result') {
  process.stdout.write(route_result_json(JSON.stringify(data.route)));
} else throw new Error('Unknown bridge action');
