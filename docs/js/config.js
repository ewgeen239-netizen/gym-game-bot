// ===========================================================================
//  EDIT THIS after you deploy the backend to Railway.
//  Put your Railway public URL here (no trailing slash), e.g.
//  export const API_BASE = 'https://gymgame-bot-production.up.railway.app';
// ===========================================================================
const params = new URLSearchParams(location.search);
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_BASE =
  params.get('api') ||                       // ?api=... override for testing
  (isLocal ? location.origin : null) ||      // local dev: backend on same origin
  'https://gym-game-bot-production.up.railway.app';

// When true, the app injects a fake Telegram user so you can open it in a normal
// browser (only works if the backend has no BOT_TOKEN, i.e. local dev).
export const DEV_MODE = params.get('dev') === '1' || isLocal;

// Your bot's @username (without @). Used to build referral / duel share links.
export const BOT_USERNAME = 'gymgamepanda_bot';
