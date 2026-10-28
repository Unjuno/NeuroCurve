// Test-only adaptation of the browser Worker entry point to Node worker_threads.
import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:value=>parentPort.postMessage(value)};
await import('../public/worker.js');
parentPort.on('message',value=>self.onmessage({data:value}));
