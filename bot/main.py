"""Entry point: runs the aiogram bot and the aiohttp API in one process."""
from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)
from aiohttp import web

from . import config
from .api import build_app
from .storage import build_storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("gymgame")


def _webapp_url(start_param: str | None = None) -> str:
    url = config.WEBAPP_URL
    if start_param:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}startapp={start_param}"
    return url


def _play_keyboard(start_param: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🎮 Открыть GymGame", web_app=WebAppInfo(url=_webapp_url(start_param))),
    ]])


def register_handlers(dp: Dispatcher, bot: Bot):
    @dp.message(CommandStart())
    async def start(message: Message, command: CommandObject):
        ref = (command.args or "").strip()
        # referral deep link: t.me/bot?start=<referrer_id>
        text = (
            "<b>💪 GymGame Club</b>\n\n"
            "Качай 3D-персонажа реальными тренировками. "
            "Каждый подход — это XP, уровни, характеристики и экипировка.\n\n"
            "Жми кнопку и открывай зал ⬇️"
        )
        if ref:
            text += f"\n\n<i>Тебя пригласил игрок #{ref} — вы оба получите бонус!</i>"
        await message.answer(text, reply_markup=_play_keyboard(ref))

    @dp.message(F.text == "/rank")
    async def rank(message: Message):
        await message.answer("Рейтинг, дуэли и клубы — внутри приложения.", reply_markup=_play_keyboard())

    @dp.message()
    async def fallback(message: Message):
        await message.answer("Открой GymGame, чтобы тренироваться 👇", reply_markup=_play_keyboard())


async def run() -> None:
    storage = build_storage()
    log.info("Storage backend: %s", "Google Sheets" if config.USE_SHEETS else "local JSON")

    # Always start the API server (needed by the Mini App).
    api = build_app(storage)
    runner = web.AppRunner(api)
    await runner.setup()
    site = web.TCPSite(runner, config.HOST, config.PORT)
    await site.start()
    log.info("API listening on %s:%s", config.HOST, config.PORT)

    if not config.BOT_TOKEN:
        log.warning("BOT_TOKEN not set — running API only (no Telegram bot).")
        while True:
            await asyncio.sleep(3600)

    try:
        bot = Bot(config.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    except Exception as exc:  # noqa: BLE001 — usually a malformed BOT_TOKEN
        log.error("Invalid BOT_TOKEN (%s: %s). Copy it from @BotFather, format "
                  "'123456789:AA...'. Running API only.", type(exc).__name__, exc)
        while True:
            await asyncio.sleep(3600)
    dp = Dispatcher()
    register_handlers(dp, bot)

    # Put a persistent "Open App" button in the chat menu.
    try:
        await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="GymGame", web_app=WebAppInfo(url=config.WEBAPP_URL)))
    except Exception as exc:  # non-fatal
        log.warning("Could not set menu button: %s", exc)

    # Drop any leftover webhook / queued updates so polling starts clean.
    try:
        await bot.delete_webhook(drop_pending_updates=True)
    except Exception as exc:  # non-fatal
        log.warning("delete_webhook failed: %s", exc)

    log.info("Bot polling started.")
    await dp.start_polling(bot, handle_signals=False)


def main() -> None:
    try:
        asyncio.run(run())
    except (KeyboardInterrupt, SystemExit):
        log.info("Shutting down.")


if __name__ == "__main__":
    main()
