// Thin API client. Every request carries Telegram initData for auth.
import { API_BASE, DEV_MODE } from './config.js';

const tg = window.Telegram?.WebApp;

function baseBody() {
  const body = { initData: tg?.initData || '' };
  if (DEV_MODE) {
    body.debugUser = { id: 424242, first_name: 'DevTester', username: 'dev' };
    const sp = new URLSearchParams(location.search).get('startapp');
    if (sp) body.start_param = sp;
  } else {
    const sp = tg?.initDataUnsafe?.start_param;
    if (sp) body.start_param = sp;
  }
  return body;
}

async function post(path, extra = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...baseBody(), ...extra }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export const api = {
  profile: () => post('/api/profile'),
  workout: (exercise, sets, reps, weight) => post('/api/workout', { exercise, sets, reps, weight }),
  history: () => post('/api/history'),
  leaderboard: (metric, scope) => post('/api/leaderboard', { metric, scope }),
  friends: () => post('/api/friends'),
  compare: (other_id) => post('/api/compare', { other_id }),
  duels: () => post('/api/duels'),
  createDuel: (opponent_id) => post('/api/duel/create', { opponent_id }),
  acceptDuel: (duel_id) => post('/api/duel/accept', { duel_id }),
  clubs: () => post('/api/clubs'),
  createClub: (name) => post('/api/club/create', { name }),
  joinClub: (club_id) => post('/api/club/join', { club_id }),
};

export { tg };
