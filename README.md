# BuildingWithJacob

Personal engineering portfolio and public build journal.

## Current project pages

- `honeygotchi.html` — Raspberry Pi cybersecurity companion
- `satellite-lab.html` — planned ground-to-space security research lab
- `security-labs.html` — Linux, networking, cloud, troubleshooting, detection, and hardening labs
- `cyber-pulse.html` — clearly labelled demo visualization with pause and reduced-motion support
- `ground-station-zero.html` — product preview and two free missions; checkout stays closed until configured
- `replay-attack-lab.html` — original worked replay investigation
- `family.html` — the people and home behind the work

## Philosophy

Build it. Instrument it. Document it. Harden it.

The site intentionally separates finished capability from planned work. Project pages should gain screenshots, diagrams, logs, test results, and code references as each layer becomes real.

## Local preview

From the repository folder:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Then open `http://localhost:8000`.

## Deployment

GitHub Pages from the `main` branch. Custom domain: `buildingwithjacob.dev`.

## One maintenance check

From the repository folder, run:

```sh
python tools/check.py
```

This runs the website behavior regressions, link-checker tests and a local HTML link/section scan. It changes no site files and makes no network requests. It needs Python 3.10+ and Node 20+; no package install is required. A successful run ends with PASS. If it prints FAILED, fix the named file/link before publishing.

After a visual change, preview the site and check the phone menu and changed page. The deterministic animation tests verify one scheduling loop, Pause/Resume, hidden tabs and reduced motion; they do not measure CPU use. `js/cyber-pulse.js` owns the visualization loop. Keeping it separate from the page makes that behavior easier to maintain.

Use a feature branch, run the check, review the diff and open a pull request. GitHub Pages deploys main after merge. The product's public sales configuration must remain blank until the seller has completed checkout and delivery testing.
