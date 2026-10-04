import { execFile } from 'child_process';
import { promisify } from 'util';

/**
 * Message composer (Phase 8.8): opens WhatsApp, Telegram, or email with the message already
 * written, through each app's own link format. Jarvis never presses Send — sending is the
 * operator's click in the app, so nothing goes out on a misheard name or a wrong number.
 * Installed desktop apps are preferred (whatsapp:// / tg:// handlers); otherwise the web links
 * work in any browser.
 */

const execFileAsync = promisify(execFile);
const MAX_TEXT = 2000;
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export class ComposeError extends Error {}

export const MESSAGE_APPS = ['whatsapp', 'telegram', 'email'];

/**
 * Whether a desktop app is registered for a URL scheme (Linux; elsewhere the web link is used).
 */
async function hasSchemeHandler(scheme) {
  if (process.platform !== 'linux') return false;
  try {
    const { stdout } = await execFileAsync('xdg-mime', ['query', 'default', `x-scheme-handler/${scheme}`], { timeout: 4000 });
    // A browser registered for the scheme is not the app
    return Boolean(stdout.trim()) && !/firefox|chrom|brave|edge|opera|vivaldi/i.test(stdout);
  } catch {
    return false;
  }
}

function phoneDigits(to) {
  const compact = String(to || '').replace(/[\s().-]/g, '');
  return /^\+?\d{7,15}$/.test(compact) ? compact.replace(/^\+/, '') : null;
}

/**
 * Returns { url, app, recipient, note } for the compose link. `to` is a phone number (WhatsApp),
 * a @username (Telegram), or email address(es); without one the app asks who to send it to.
 */
export async function buildComposeLink({ app, to = '', text = '', subject = '', client = 'default' }) {
  const message = String(text || '').trim();
  if (!message) throw new ComposeError('The message text is empty.');
  if (message.length > MAX_TEXT) throw new ComposeError(`Messages are limited to ${MAX_TEXT} characters.`);
  const enc = encodeURIComponent;
  const recipient = String(to || '').trim();

  if (app === 'whatsapp') {
    const phone = phoneDigits(recipient);
    if (recipient && !phone) {
      throw new ComposeError(`WhatsApp needs a phone number with country code (e.g. +91 98765 43210), not "${recipient}". Look the number up in memory or ask the operator.`);
    }
    const native = await hasSchemeHandler('whatsapp');
    const url = native
      ? `whatsapp://send?${phone ? `phone=${phone}&` : ''}text=${enc(message)}`
      : `https://wa.me/${phone || ''}?text=${enc(message)}`;
    return { url, app, recipient: phone ? `+${phone}` : null, note: phone ? '' : 'WhatsApp will ask which chat to send it to.' };
  }

  if (app === 'telegram') {
    const username = recipient.replace(/^@/, '');
    const native = await hasSchemeHandler('tg');
    // Telegram links cannot prefill a message into a specific chat, so the share sheet carries
    // the text and the operator picks the chat (named in the note when known)
    const url = native ? `tg://msg_url?url=${enc(message)}` : `https://t.me/share/url?url=${enc(message)}`;
    const valid = /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username);
    return { url, app, recipient: valid ? `@${username}` : null, note: valid ? `Pick @${username} in the share list.` : 'Telegram will ask which chat to send it to.' };
  }

  if (app === 'email') {
    const addresses = recipient ? recipient.split(/[,;]\s*/).filter(Boolean) : [];
    const invalid = addresses.find((a) => !EMAIL_PATTERN.test(a));
    if (invalid) throw new ComposeError(`"${invalid}" is not an email address.`);
    const subjectLine = String(subject || '').trim().slice(0, 200);
    const url =
      client === 'gmail'
        ? `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(addresses.join(','))}&su=${enc(subjectLine)}&body=${enc(message)}`
        : `mailto:${addresses.map(enc).join(',')}?subject=${enc(subjectLine)}&body=${enc(message)}`;
    return { url, app, recipient: addresses.join(', ') || null, note: addresses.length ? '' : 'Fill in the recipient in the mail window.' };
  }

  throw new ComposeError(`Unknown app "${app}". Use whatsapp, telegram, or email.`);
}
