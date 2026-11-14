// bun run ws:tail <sessionId> ["a question to ask"]
//
// Prints every message a chat socket sends. Exists because the previous
// transport's worst bug — a stream Bun closed after 32 seconds of silence while
// the run carried on server-side — was found with `curl -N` and a shell loop,
// and a WebSocket cannot be curled. One transport, one debug tool.
//
// Read-only unless a question is passed, in which case it starts a real turn on
// the real shared browser. There is no dry run for that: the models are three
// logged-in chat tabs.
import { appConfig, serverConfig } from '@/config';
import { ChatClientMessageType } from '@star/run-protocol/chat';

const [sessionId, prompt = null] = process.argv.slice(2);

if (!sessionId) {
    console.error('usage: bun run ws:tail <sessionId> ["a question to ask"]');
    process.exit(1);
}

const url = `ws://localhost:${serverConfig.port}/api/ws/chat/${sessionId}`;
// Sent explicitly: the handshake checks Origin, because browsers do not apply
// CORS to it, and a tool that skipped the header would be testing a path no
// browser takes.
const socket = new WebSocket(url, { headers: { origin: appConfig.webOrigins[0] ?? '' } });

socket.addEventListener('open', () => {
    console.log(`connected ${url}`);
    if (prompt === null) return;
    console.log(`asking: ${prompt}`);
    socket.send(JSON.stringify({ type: ChatClientMessageType.turnStart, prompt, rounds: null }));
});

socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { seq: number; type: string };
    // Whole message, one line: a tail that summarised would hide the field that
    // turns out to matter.
    console.log(`${String(message.seq).padStart(3)} ${message.type} ${String(event.data)}`);
});

socket.addEventListener('close', () => console.log('closed'));
socket.addEventListener('error', () => console.error('socket error (is the API running?)'));
