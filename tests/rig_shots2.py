import sys, json
from playwright.sync_api import sync_playwright
out = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'])
    pg = b.new_page(viewport={'width': 1400, 'height': 700})
    logs = []
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
    pg.goto('file://' + __import__('os').path.abspath('tests/rig_test.html'))
    pg.evaluate('window.ready')
    # spread characters along x so a side camera sees each separately
    pg.evaluate('''window.run2 = (t, view) => {
      players.forEach((pl, i) => { pl.placeAt(i*2.4, 0, Math.PI/2); pl.hasBall = true; pl.ballPos.set(pl.x+0.25, 1.05, pl.z); let now=0; const dt=1/120;
        for (let k=0;k<40;k++){now+=dt;pl.update(dt,null,now);pl.computePose(dt);HoopCharacters.applyPose(pl.model,pl.pose);}
        pl.startShot(now); const n=Math.round(t*120);
        for (let k=0;k<n;k++){now+=dt;pl.update(dt,null,now); if(pl.shot&&!pl.shot.released&&pl.shot.t>=pl.shot.T) pl.release(pl.shot.t); pl.computePose(dt);HoopCharacters.applyPose(pl.model,pl.pose);}
        ballMesh[i].position.copy(pl.ballPos); ballMesh[i].visible = !(pl.shot && pl.shot.released);
      });
      if (view==='side') { camera.fov=40; camera.updateProjectionMatrix(); camera.position.set(2.3, 1.5, 0); camera.position.set(2.4, 1.6, -8.5); camera.lookAt(2.4, 1.35, 0); }
      else { camera.position.set(9, 1.6, 0); camera.lookAt(2, 1.4, 0); }
      renderer.render(scene, camera); return players.map(p=>p.shot?[p.shot.T.toFixed(3), p.shot.released]:null); }''')
    for t in [0.12, 0.3, 0.45, 0.6, 0.72, 0.95]:
        r = pg.evaluate(f'window.run2({t}, "side")')
        pg.screenshot(path=f'{out}/s2_{t}.png'); print(t, r)
    r = pg.evaluate('window.run2(0.4, "front")'); pg.screenshot(path=f'{out}/s2_front.png')
    print(logs)
    b.close()
