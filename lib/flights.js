/**
 * Flight lookup (Phase 8.8): Google Flights understands a plain-English query in its URL, so Jarvis
 * opens the live results page for the operator; a short grounded summary is added only when
 * Google Search grounding is available (fares from a model's memory would be stale).
 */

export const CABINS = ['economy', 'premium economy', 'business', 'first'];

export class FlightError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(value, label, today) {
  if (!value) return null;
  if (!ISO_DATE.test(value) || Number.isNaN(new Date(`${value}T00:00`).getTime())) {
    throw new FlightError(`The ${label} must be a date like 2026-11-20 (got "${value}").`);
  }
  if (value < today) throw new FlightError(`The ${label} ${value} is in the past.`);
  return value;
}

/**
 * Returns { query, url } for a search. Dates are local YYYY-MM-DD; omit `date` for flexible dates.
 */
export function buildFlightSearch({ from, to, date, return_date: returnDate, passengers = 1, cabin = 'economy' }, now = new Date()) {
  const origin = String(from || '').trim();
  const destination = String(to || '').trim();
  if (!origin || !destination) throw new FlightError('Give both where the flight leaves from and where it goes.');
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const depart = checkDate(date, 'departure date', today);
  const back = checkDate(returnDate, 'return date', today);
  if (back && depart && back < depart) throw new FlightError('The return date is before the departure date.');
  const travellers = Math.round(Number(passengers) || 1);
  if (travellers < 1 || travellers > 9) throw new FlightError('Between 1 and 9 passengers, please.');
  const seat = String(cabin || 'economy').toLowerCase();
  if (!CABINS.includes(seat)) throw new FlightError(`Cabin must be one of: ${CABINS.join(', ')}.`);

  const query = [
    `Flights from ${origin} to ${destination}`,
    depart ? `on ${depart}` : '',
    back ? `returning ${back}` : 'one way',
    travellers > 1 ? `for ${travellers} adults` : '',
    seat !== 'economy' ? `in ${seat}` : '',
  ].filter(Boolean).join(' ');
  return { query, url: `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}&hl=en` };
}
