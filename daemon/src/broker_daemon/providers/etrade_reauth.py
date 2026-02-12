"""Headless E*Trade OAuth re-authentication helpers."""

from __future__ import annotations

import asyncio
import logging
import re
from contextlib import suppress
from pathlib import Path
from typing import Any, Awaitable, Callable

from broker_daemon.exceptions import ErrorCode, BrokerError

try:
    from playwright.async_api import async_playwright
except ImportError:  # pragma: no cover - optional dependency
    async_playwright = None

logger = logging.getLogger(__name__)

STEP_TIMEOUT_MS = 30_000
MANUAL_AUTH_SUGGESTION = "Run `broker auth etrade` to authenticate manually."
TWO_FACTOR_SUGGESTION = "Auto-reauth cannot handle 2FA; disable 2FA or run `broker auth etrade` manually."

_TWO_FACTOR_TOKENS = (
    "two-factor",
    "two factor",
    "multi-factor",
    "multi factor",
    "mfa",
    "one-time passcode",
    "one time passcode",
    "otp",
    "security code",
    "text me",
    "send code",
    "verification code",
    "challenge question",
)


async def headless_reauth(
    *,
    consumer_key: str,
    consumer_secret: str,
    username: str,
    password: str,
    sandbox: bool,
    token_path: Path,
) -> tuple[str, str]:
    """Perform OAuth re-authentication via headless browser and return fresh access tokens."""
    if async_playwright is None:
        raise BrokerError(
            ErrorCode.INVALID_ARGS,
            "playwright is required for auto-reauth but not installed",
            suggestion="Install with: pip install playwright && playwright install chromium",
        )

    user = username.strip()
    secret = password.strip()
    if not user or not secret:
        raise BrokerError(
            ErrorCode.INVALID_ARGS,
            "E*Trade auto-reauth requires username and password",
            suggestion="Set broker.etrade.username and broker.etrade.password in config or env.",
        )

    from broker_daemon.providers.etrade import (
        etrade_access_token,
        etrade_authorize_url,
        etrade_request_token,
        save_etrade_tokens,
    )

    logger.info("E*Trade auto-reauth: requesting OAuth request token")
    request = await etrade_request_token(
        consumer_key=consumer_key,
        consumer_secret=consumer_secret,
        sandbox=sandbox,
    )
    request_token = request["oauth_token"]
    request_token_secret = request["oauth_token_secret"]
    authorize_url = etrade_authorize_url(consumer_key, request_token)

    logger.info("E*Trade auto-reauth: launching headless Chromium")
    verifier = await _authorize_headless(
        authorize_url=authorize_url,
        username=user,
        password=secret,
    )

    logger.info("E*Trade auto-reauth: exchanging verifier for access token")
    access = await etrade_access_token(
        consumer_key=consumer_key,
        consumer_secret=consumer_secret,
        request_token=request_token,
        request_token_secret=request_token_secret,
        verifier=verifier,
        sandbox=sandbox,
    )

    oauth_token = access["oauth_token"]
    oauth_token_secret = access["oauth_token_secret"]
    save_etrade_tokens(
        token_path,
        oauth_token=oauth_token,
        oauth_token_secret=oauth_token_secret,
    )
    logger.info("E*Trade auto-reauth: saved refreshed access token at %s", token_path.expanduser())
    return oauth_token, oauth_token_secret


async def _authorize_headless(*, authorize_url: str, username: str, password: str) -> str:
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            page.set_default_timeout(STEP_TIMEOUT_MS)

            try:
                logger.info("E*Trade auto-reauth: opening authorization URL")
                await page.goto(authorize_url, wait_until="domcontentloaded", timeout=STEP_TIMEOUT_MS)

                logger.info("E*Trade auto-reauth: submitting login form")
                await _fill_first(
                    page,
                    selectors=(
                        "input[name*='USER']",
                        "input[id*='USER']",
                        "input[name*='user']",
                        "input[id*='user']",
                        "input[autocomplete='username']",
                        "input[type='email']",
                    ),
                    value=username,
                    field_name="username",
                )
                await _fill_first(
                    page,
                    selectors=(
                        "input[type='password']",
                        "input[name*='PASS']",
                        "input[id*='PASS']",
                        "input[name*='pass']",
                        "input[id*='pass']",
                    ),
                    value=password,
                    field_name="password",
                )
                await _click_first(
                    page,
                    clickers=(
                        lambda: page.get_by_role("button", name=re.compile(r"log\s*(in|on)|sign\s*in", re.IGNORECASE)).first.click(),
                        lambda: page.locator("button[type='submit']").first.click(),
                        lambda: page.locator("input[type='submit']").first.click(),
                        lambda: page.get_by_text(re.compile(r"log\s*(in|on)|sign\s*in", re.IGNORECASE)).first.click(),
                    ),
                    label="login submit",
                )
                await page.wait_for_timeout(1_000)

                verifier = await _try_extract_verifier(page)
                if verifier:
                    logger.info("E*Trade auto-reauth: verifier extracted immediately after login")
                    return verifier

                if await _looks_like_two_factor_page(page):
                    logger.warning("E*Trade auto-reauth: 2FA page detected after login")
                    raise BrokerError(
                        ErrorCode.IB_REJECTED,
                        "E*Trade auto-reauth failed: 2FA/MFA challenge detected",
                        suggestion=TWO_FACTOR_SUGGESTION,
                    )

                logger.info("E*Trade auto-reauth: accepting authorization prompt")
                await _click_first(
                    page,
                    clickers=(
                        lambda: page.get_by_role("button", name=re.compile(r"accept|authorize|allow|grant", re.IGNORECASE)).first.click(),
                        lambda: page.locator("button:has-text('Accept')").first.click(),
                        lambda: page.locator("button:has-text('Authorize')").first.click(),
                        lambda: page.locator("input[type='submit'][value*='Accept']").first.click(),
                        lambda: page.locator("input[type='submit'][value*='Authorize']").first.click(),
                        lambda: page.get_by_text(re.compile(r"accept|authorize|allow|grant", re.IGNORECASE)).first.click(),
                    ),
                    label="authorize accept",
                )

                logger.info("E*Trade auto-reauth: waiting for verifier code")
                verifier = await _wait_for_verifier(page)
                logger.info("E*Trade auto-reauth: verifier code extracted")
                return verifier
            finally:
                await context.close()
                await browser.close()
    except BrokerError:
        raise
    except Exception as exc:  # pragma: no cover - browser interaction failures are environment-dependent
        raise BrokerError(
            ErrorCode.IB_REJECTED,
            f"E*Trade auto-reauth failed during browser authorization: {exc}",
            suggestion=MANUAL_AUTH_SUGGESTION,
        ) from exc


async def _fill_first(
    page: Any,
    *,
    selectors: tuple[str, ...],
    value: str,
    field_name: str,
) -> None:
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            await locator.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
            await locator.fill(value, timeout=STEP_TIMEOUT_MS)
            logger.info("E*Trade auto-reauth: filled %s field using selector %s", field_name, selector)
            return
        except Exception:
            continue
    raise BrokerError(
        ErrorCode.IB_REJECTED,
        f"E*Trade auto-reauth failed: unable to locate {field_name} field",
        suggestion=MANUAL_AUTH_SUGGESTION,
    )


async def _click_first(
    page: Any,
    *,
    clickers: tuple[Callable[[], Awaitable[Any]], ...],
    label: str,
) -> None:
    for click in clickers:
        try:
            await click()
            logger.info("E*Trade auto-reauth: clicked %s", label)
            return
        except Exception:
            continue

    if await _looks_like_two_factor_page(page):
        raise BrokerError(
            ErrorCode.IB_REJECTED,
            "E*Trade auto-reauth failed: 2FA/MFA challenge detected",
            suggestion=TWO_FACTOR_SUGGESTION,
        )

    raise BrokerError(
        ErrorCode.IB_REJECTED,
        f"E*Trade auto-reauth failed: unable to complete {label} step",
        suggestion=MANUAL_AUTH_SUGGESTION,
    )


async def _wait_for_verifier(page: Any) -> str:
    deadline = asyncio.get_running_loop().time() + (STEP_TIMEOUT_MS / 1000)
    while asyncio.get_running_loop().time() < deadline:
        verifier = await _try_extract_verifier(page)
        if verifier:
            return verifier

        if await _looks_like_two_factor_page(page):
            raise BrokerError(
                ErrorCode.IB_REJECTED,
                "E*Trade auto-reauth failed: 2FA/MFA challenge detected",
                suggestion=TWO_FACTOR_SUGGESTION,
            )

        await asyncio.sleep(1)

    raise BrokerError(
        ErrorCode.IB_REJECTED,
        "E*Trade auto-reauth failed: could not find verifier code on authorization page",
        suggestion=MANUAL_AUTH_SUGGESTION,
    )


async def _try_extract_verifier(page: Any) -> str | None:
    input_selectors = (
        "input[name*='verifier']",
        "input[id*='verifier']",
        "input[name*='code']",
        "input[id*='code']",
        "input[name*='pin']",
        "input[id*='pin']",
        "input[value]",
    )
    for selector in input_selectors:
        locator = page.locator(selector)
        with suppress(Exception):
            count = await locator.count()
            for index in range(min(count, 8)):
                candidate = (await locator.nth(index).input_value()).strip()
                if _looks_like_verifier(candidate):
                    return candidate

    body = ""
    with suppress(Exception):
        body = await page.locator("body").inner_text(timeout=3_000)

    for pattern in (
        re.compile(r"verification(?:\s+code)?\D{0,24}([A-Za-z0-9]{4,32})", re.IGNORECASE),
        re.compile(r"verifier\D{0,24}([A-Za-z0-9]{4,32})", re.IGNORECASE),
        re.compile(r"\b([0-9]{5,12})\b"),
    ):
        match = pattern.search(body)
        if match and _looks_like_verifier(match.group(1)):
            return match.group(1)

    return None


def _looks_like_verifier(value: str) -> bool:
    token = value.strip()
    if not token:
        return False
    if not re.fullmatch(r"[A-Za-z0-9]{4,32}", token):
        return False
    return any(char.isdigit() for char in token)


async def _looks_like_two_factor_page(page: Any) -> bool:
    snippets = [page.url.lower()]
    with suppress(Exception):
        body = await page.locator("body").inner_text(timeout=2_000)
        snippets.append(body.lower())
    blob = "\n".join(snippets)
    return any(token in blob for token in _TWO_FACTOR_TOKENS)
