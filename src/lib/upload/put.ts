/** Signed `PUT` target: URL and headers to send. */
export interface PutTarget {
  url: string;
  headers: Record<string, string>;
}

/** HTTP status of a finished `PUT`. */
export type PutResult = { status: number };

/**
 * Browser `PUT` of a blob to a signed URL with upload progress (`XMLHttpRequest`, since
 * `fetch` has no upload progress). Rejects on network failure or abort, resolves with the
 * HTTP status otherwise. Shared by the photo queue and the plan import.
 */
export function putWithProgress(
  target: PutTarget,
  body: Blob,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.url, true);
    for (const [name, value] of Object.entries(target.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => resolve({ status: xhr.status });
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}
