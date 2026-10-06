# Merge Front & Front Rush

Two browser games in one repository. Start with **Front Rush by opening `rush.html`**.

| Game | File to open | How it plays |
| --- | --- | --- |
| Front Rush | [`rush.html`](rush.html) | Steer a squad through math gates, fight enemies and bosses, and spend coins on permanent upgrades. Choose 100 waves, 200 waves, endless mode, or a daily challenge. |
| Merge Front | [`index.html`](index.html) | Buy infantry, tanks, and choppers, merge matching units, arrange your formation, and fight automatic battles. |

Both games use plain HTML and JavaScript. You only need a modern browser. There are no packages to install or build steps.

## Install and play

1. [Download the project ZIP](https://github.com/cloudgamble/merge-front/archive/refs/heads/main.zip) and extract it.
2. Open the extracted folder.
3. Double-click **`rush.html`** to play Front Rush in your browser. If prompted, choose Chrome, Firefox, Edge, or Safari.

Keep the extracted files together so each HTML page can load its JavaScript file. To play Merge Front instead, open `index.html`.

If you have Git installed, you can clone the repository instead:

```sh
git clone https://github.com/cloudgamble/merge-front.git
cd merge-front
```

Then open `rush.html` in your browser.

### Optional local server

If you prefer to serve the games locally, run this command from the project folder with Python 3 installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **[http://localhost:8000/rush.html](http://localhost:8000/rush.html)** for Front Rush, or [http://localhost:8000/index.html](http://localhost:8000/index.html) for Merge Front. Press `Ctrl+C` in the terminal to stop the server.

## Controls

### Front Rush

- Drag left or right with a mouse or finger to steer, or use the left/right arrow keys or `A` / `D`.
- Your squad shoots automatically. Choose gates to grow your squad and improve its strength.
- Press `Space` or `Enter` to start from the menu.
- Press `P` or `Esc` to pause or resume.
- Spend earned coins in the upgrade shop between runs.

### Merge Front

- Click or tap the shop buttons to buy units. Keyboard shortcuts `1`, `2`, and `3` buy infantry, tanks, and choppers.
- Drag matching units of the same level onto each other to merge them.
- Drag units to rearrange your formation, or onto the Fight button to sell them.
- Click Fight, or press `Space` or `Enter`, to start a battle.

## Saved progress

Each game saves progress separately in your browser's local storage. Use the same browser and address to keep playing your save. Opening files directly and using a local server can create separate saves. Clearing browser storage removes saved progress.

## Simulation pages

`test.html`, `rush-test.html`, and `rush-career.html` run automated balance simulations. They clear the corresponding game's local save when opened, so use a separate browser profile if you want to keep your playing progress.
