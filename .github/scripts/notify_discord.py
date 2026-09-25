"""Post a GitHub push event to a Discord channel webhook."""

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main():
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        raise SystemExit("Set the DISCORD_WEBHOOK_URL repository secret to enable Discord notifications.")

    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    base_url = os.environ["GITHUB_SERVER_URL"].rstrip("/")
    repository = os.environ["GITHUB_REPOSITORY"]
    actor = os.environ["GITHUB_ACTOR"]
    sha = event["after"]
    compare_url = event.get("compare") or (
        f"{base_url}/{repository}/compare/{event['before']}...{sha}"
    )

    payload = {
        "content": (
            f"**Push to `main`** in **{repository}** by **{actor}**\n"
            f"[`{sha[:7]}`]({base_url}/{repository}/commit/{sha})"
        ),
        "allowed_mentions": {"parse": []},
    }
    request = Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "7-bit-sequence-discord-notifier/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            if response.status not in (200, 204):
                raise SystemExit(f"Discord notification failed (HTTP {response.status}).")
    except HTTPError as error:
        raise SystemExit(f"Discord notification failed (HTTP {error.code}).") from None
    except URLError:
        raise SystemExit("Discord notification failed (network error).") from None


if __name__ == "__main__":
    main()
