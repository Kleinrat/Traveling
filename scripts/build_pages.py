"""Package only public browser assets for GitHub Pages."""
from pathlib import Path
import shutil
import hashlib

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "_site"
DEST.mkdir(exist_ok=True)
for name in ("index.html", "style.css", "app.js", "journey.js", "engine.js"):
    shutil.copyfile(ROOT / "web" / name, DEST / name)
shutil.copytree(ROOT / "web" / "data", DEST / "data", dirs_exist_ok=True)
def version(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]

# Each build references matching assets, even while CDN edges retain old files.
app = DEST / "app.js"
app_text = app.read_text(encoding="utf-8")
app_text = app_text.replace("'./engine.js'", "'./engine.js?v=" + version(DEST / "engine.js") + "'")
app_text = app_text.replace("'./journey.js'", "'./journey.js?v=" + version(DEST / "journey.js") + "'")
for city in ('hangzhou','chengdu','sight-evidence'):
    path = 'data/'+city+'.json'
    app_text = app_text.replace("'./"+path+"'", "'./"+path+"?v="+version(DEST / path)+"'")
app.write_text(app_text, encoding="utf-8")
page = DEST / "index.html"
html = page.read_text(encoding="utf-8")
html = html.replace("<head>", '<head><meta name="moontrip-mode" content="static">', 1)
html = html.replace('src="app.js"', 'src="app.js?v=' + version(app) + '"')
html = html.replace('href="style.css"', 'href="style.css?v=' + version(DEST / "style.css") + '"')
page.write_text(html, encoding="utf-8")
(DEST / ".nojekyll").touch()
print("Public demo packaged: browser assets and two-city source snapshots; no server configuration or secrets")
