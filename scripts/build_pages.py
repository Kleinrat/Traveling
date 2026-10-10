"""Package only public browser assets for GitHub Pages."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "_site"
DEST.mkdir(exist_ok=True)
for name in ("index.html", "style.css", "app.js", "engine.js"):
    shutil.copyfile(ROOT / "web" / name, DEST / name)
page = DEST / "index.html"
html = page.read_text(encoding="utf-8")
html = html.replace("<head>", '<head><meta name="moontrip-mode" content="static">', 1)
page.write_text(html, encoding="utf-8")
(DEST / ".nojekyll").touch()
print("Public demo packaged: 4 browser assets; no server configuration or secrets")
