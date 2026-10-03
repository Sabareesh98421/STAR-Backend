/**
 * Splits an SSE byte stream into the JSON payloads of its `data:` lines.
 *
 * Its own file because the framing is the part that breaks quietly: a chunk
 * boundary can land mid-JSON, and parsing eagerly would throw on a payload
 * that was merely incomplete. Pure and transport-free, so it is testable
 * without a server.
 */
export async function* sseEvents<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // `stream: true` keeps a multi-byte character split across chunks
            // from decoding into a replacement char.
            buffer += decoder.decode(value, { stream: true });

            // A frame is only complete at a blank line. Anything after the last
            // one stays in the buffer — that remainder is the half-frame.
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
                const data = frame
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trim())
                    .join('');
                if (data) yield JSON.parse(data) as T;
            }
        }
    } finally {
        // Releasing matters on the cancel path: an un-released reader keeps the
        // response body alive and the request open after the run was abandoned.
        reader.releaseLock();
    }
}
