/**
 * Los correos de Auth del stack local caen en Mailpit (`[local_smtp]` en
 * supabase/config.toml, puerto 54324), también en CI. Los e2e leen de ahí el
 * código de 6 dígitos, como lo haría la persona, sin tocar la base.
 */

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

type Summary = { ID: string; Created: string };

/** Un correo único por test: Auth espera 60 s entre envíos a la misma dirección. */
export function uniqueEmail(label: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${label}-${stamp}@example.com`;
}

/**
 * El código del último correo que llegó a `email` después de `since` (un
 * `Date.now()` tomado antes de pedirlo). Espera a que llegue, hasta `timeout`.
 */
export async function codeSentTo(
  email: string,
  { since, timeout = 10_000 }: { since: number; timeout?: number },
): Promise<string> {
  const deadline = Date.now() + timeout;
  const query = encodeURIComponent(`to:"${email}"`);
  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
    if (response.ok) {
      const { messages } = (await response.json()) as { messages: Summary[] };
      const latest = messages
        .filter((message) => Date.parse(message.Created) >= since - 1000)
        .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
      if (latest) {
        const message = (await (
          await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)
        ).json()) as { Text: string };
        const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
        if (code) return code;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No code reached ${email} in ${timeout} ms`);
}
