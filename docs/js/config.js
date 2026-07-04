// ===========================================================================
//  EDIT THIS after you deploy the backend to Railway.
//  Put your Railway public URL here (no trailing slash), e.g.
//  const CONFIGURED_API = 'https://gymgame-bot-production.up.railway.app';
// ===========================================================================
const params = new URLSearchParams(location.search);

// ← EDIT this after Railway deploy. Leave the REPLACE... placeholder and the app
//   falls back to same-origin (works when the backend also serves the frontend,
//   e.g. local dev / self-host / preview).
const CONFIGURED_API = 'https://gym-game-bot-production.up.railway.app';

// Production is served from *.github.io; anywhere else counts as a dev host.
const isProd = location.hostname.endsWith('github.io');

export const API_BASE =
  params.get('api') ||                                   // ?api=... override
  (CONFIGURED_API.includes('REPLACE') ? location.origin : CONFIGURED_API);

// When true, the app injects a fake Telegram user so you can open it in a normal
// browser (only works if the backend has no BOT_TOKEN, i.e. dev).
export const DEV_MODE = params.get('dev') === '1' || !isProd;

// Your bot's @username (without @). Used to build referral / duel share links.
export const BOT_USERNAME = 'gymgamepanda_bot';
