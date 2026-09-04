#!/bin/bash
# Builds a populated demo zoo for visual QA by injecting a setup script into the
# real built index.html, so the demo can never drift from the shipped DOM.
set -e
python3 - <<'PY'
html = open('dist/index.html').read()
inject = open('demo-inject.html').read()
open('dist/demo.html','w').write(html.replace('</body>', inject + '</body>'))
PY
echo "wrote dist/demo.html"
