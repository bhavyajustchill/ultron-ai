/**
 * Fetch helpers for live tool handlers (they run in the browser).
 */

export async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

// Host routes report failures in the JSON body, so the body is returned whatever the status
export async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return res.json();
}
