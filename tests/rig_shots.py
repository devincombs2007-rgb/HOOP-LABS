import sys, json
from playwright.sync_api import sync_playwright
out = sys.argv[1]
cases = [('idle', 0, 'side'), ('idle', 0, 'front'), ('run', 1.23, 'side'), ('run_noball', 1.31, 'side'), ('shot', 0.25, 'side'), ('shot', 0.5, 'side'), ('shot', 0.75, 'side'), ('shot', 1.1, 'side'), ('shot', 0.5, 'front')]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
    pg = b.new_page(viewport={'width': 1400, 'height': 700})
    logs = []
    pg.on('console', lambda m: logs.append(m.type + ': ' + m.text))
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
    pg.goto('file://' + __import__('os').path.abspath('tests/rig_test.html'))
    dims = pg.evaluate('window.ready')
    print(json.dumps({k: {kk: (round(vv, 3) if isinstance(vv, (int, float)) else None) for kk, vv in v.items() if isinstance(vv, (int, float))} for k, v in dims.items()}, indent=0)[:1500])
    for sc, t, view in cases:
        r = pg.evaluate(f'window.run("{sc}", {t}, "{view}")')
        pg.screenshot(path=f'{out}/{sc}_{t}_{view}.png')
        print(sc, t, view, json.dumps(r)[:300])
    print('\n'.join(logs[:20]))
    print('title:', pg.title())
    b.close()
