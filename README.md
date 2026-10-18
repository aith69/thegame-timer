# The Game timer

A tiny self-hosted web app that counts how long it has been since you last lost [The Game](https://en.wikipedia.org/wiki/The_Game_(mind_game)).

- One big timer and one button: **I lost The Game**.
- A stats page: current / record / average / median streaks, losses per week, streak history, losses by weekday, hour and month, top streaks, recent losses.
- Python standard library only (no pip, no npm), plain HTML/CSS/JS, no external requests. Works on any device with a browser.
- Data lives in a single CSV file.

## How the timer survives a power-off

The server never counts anything. Every loss is stored as an absolute UTC timestamp, and the page shows `now - last loss`. If the host is off for three days, the timer simply shows three more days when it comes back. The browser also compares its clock with the server's, so a wrong clock on your phone doesn't matter.

## Run it

```bash
python3 app.py
# open http://localhost:8080
```

Requires Python 3.8+. Configuration via environment variables:

| Variable        | Default            | Meaning                    |
|-----------------|--------------------|----------------------------|
| `THEGAME_HOST`  | `0.0.0.0`          | Address to listen on       |
| `THEGAME_PORT`  | `8080`             | Port                       |
| `THEGAME_DATA`  | `./data/losses.csv`| Path of the CSV data file  |

The timer starts the first time the server runs.

## Install on an Arch Linux container (Proxmox)

```bash
pacman -Syu --needed python git
git clone https://github.com/<your-user>/thegame-timer.git /opt/thegame
cp /opt/thegame/thegame.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now thegame
```

Then open `http://<container-ip>:8080` from any device on your LAN.

- The data is stored in `/var/lib/thegame/losses.csv` (back it up by copying that file).
- To change the port: `systemctl edit thegame` and set `Environment=THEGAME_PORT=...`.
- In Proxmox, enable **Start at boot** on the container so it comes back after a host reboot.
- Keep the Proxmox host clock in sync (NTP); containers share it.

There is no authentication: it is meant for a trusted LAN. Don't expose it to the internet.

## Data format

```csv
timestamp,event
2026-10-18T13:08:00Z,start
2026-10-20T21:15:42Z,lost
```

- Timestamps are UTC, the pages show them in the viewer's local time zone.
- `start` marks the beginning of tracking, `lost` marks a loss. The timer shows the time since the last row.
- The file is re-read on every request, so you can edit it by hand while the server runs: change the first timestamp to backdate your start, or delete the last line to undo a mistaken click.

## API

| Method | Path               | Description                                          |
|--------|--------------------|------------------------------------------------------|
| GET    | `/api/state`       | `{now, since, losses}` (milliseconds since epoch)    |
| GET    | `/api/events`      | `{now, events: [{t, type}]}`                         |
| GET    | `/api/export.csv`  | The raw CSV                                          |
| POST   | `/api/lost`        | Record a loss (requires header `X-Requested-With: thegame`) |

## Project layout

```
app.py              server + CSV storage
static/             index.html, stats.html, home.js, stats.js, style.css, favicon.svg
thegame.service     systemd unit
```

## License

MIT
