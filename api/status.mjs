import {createHostedWorker} from '../server/hosted.mjs';
// One handler instance per warm function; the API key is read only server-side.
export default createHostedWorker();
