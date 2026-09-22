"""All permitted routes at phone widths, plus modal races and session cleanup.
Uses the same synthetic API as mobile_flows, never production data.
"""
import json
import os
from playwright.sync_api import sync_playwright, expect
import mobile_flows as f

checks = []
errors = []


def inspect(page, name):
    f.settled(page)
    expected_width = page.viewport_size['width']
    actual = page.evaluate('({layout: innerWidth, scroll: document.documentElement.scrollWidth})')
    assert actual['layout'] <= expected_width + 1, (name, actual, expected_width)
    assert actual['scroll'] <= expected_width + 1, (name, actual, expected_width)
    expect(page.locator('#workspace-main .page-title').first).to_be_visible()
    assert not page.locator('#workspace-main .empty strong').filter(has_text='Chargement impossible').count(), name
    assert not page.locator('#workspace-main .empty strong').filter(has_text='Impossible de charger la page').count(), name
    checks.append({'route': name, 'width': expected_width, **actual})


def run():
    with sync_playwright() as p:
        executable = os.environ.get('CHROMIUM_PATH')
        browser = p.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block', reduced_motion='reduce')
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(f.origin) else route.abort())
        context.route('https://workspace.squaredgroup.studio/**', f.fixture)
        context.route_web_socket('wss://workspace.squaredgroup.studio/**', lambda ws: ws.on_message(lambda message: None))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())
        try:
            page.goto(f.origin)
            page.get_by_label('Adresse e-mail', exact=True).fill(f.USER['email'])
            page.get_by_label('Mot de passe', exact=True).fill('fixture-pass123')
            page.get_by_role('button', name='Se connecter', exact=True).click()
            f.settled(page)
            routes = page.evaluate('''async()=>{
              const c=await import('/js/config.js'),s=await import('/js/store.js');
              return Object.entries(c.SECTIONS).filter(([key])=>c.canAccessSection(key,s.state.user)).map(([key,v])=>({key,title:v.title,pages:(v.subpages||[]).filter(p=>c.canAccessSubpage(p,s.state.user)).map(p=>p.id)}));
            }''')
            for width in (320, 390, 768):
                page.set_viewport_size({'width': width, 'height': 900})
                for route in routes:
                    pages = (route['pages'] or ['']) if width == 390 else [next(iter(route['pages']), '')]
                    for subpage in pages:
                        f.go(page, route['key'], subpage)
                        inspect(page, route['key'] + '/' + subpage)
            page.set_viewport_size({'width': 390, 'height': 844})
            f.go(page, 'messages')
            # Escape must work in the same turn as opening the modal, without a frame delay.
            immediate = page.evaluate('''async()=>{
              const u=await import('/js/ui.js');
              const d=u.modal({title:'Test fermeture immédiate',content:u.h('p',{text:'Test'})});
              const focused=d.panel.contains(document.activeElement);
              document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
              return {focused,closed:!d.overlay.isConnected,inert:document.querySelector('#app').inert};
            }''')
            assert immediate == {'focused': True, 'closed': True, 'inert': False}, immediate
            # Modal-to-modal transition must keep the application inert and release it on close.
            page.locator('.sq-mobile-tools-trigger').click()
            page.locator('.sq-tools-sheet').get_by_role('button', name='Installer Workspace', exact=True).click()
            expect(page.get_by_role('dialog', name='Installer Workspace')).to_be_visible()
            assert page.evaluate('document.querySelector("#app").inert')
            page.keyboard.press('Escape')
            expect(page.locator('#portal-root > .overlay')).to_have_count(0)
            assert not page.evaluate('document.querySelector("#app").inert')
            page.get_by_role('button', name='Nouvelle conversation', exact=True).click()
            expect(page.locator('.modal input[type=checkbox]').first).to_be_visible()
            size = page.locator('.modal input[type=checkbox]').first.bounding_box()
            assert 18 <= size['height'] <= 24, size
            page.screenshot(path=str(f.OUT / 'conversation-modal-390.png'), full_page=True)
            page.keyboard.press('Escape')
            page.locator('.conversation-item').filter(has_text='Direction produit').click()
            page.get_by_placeholder('Écrire un message…').fill('Brouillon de fin de session')
            assert not page.evaluate('Object.values(localStorage).some(v=>v.includes("Brouillon de fin de session"))')
            await_count = len(f.requests)
            page.evaluate('async()=>{const a=await import("/js/api.js");await a.logout()}')
            expect(page.get_by_label('Adresse e-mail', exact=True)).to_be_visible()
            page.get_by_label('Adresse e-mail', exact=True).fill(f.USER['email'])
            page.get_by_label('Mot de passe', exact=True).fill('fixture-pass123')
            page.get_by_role('button', name='Se connecter', exact=True).click()
            f.settled(page); f.go(page, 'messages')
            page.locator('.conversation-item').filter(has_text='Direction produit').click()
            expect(page.get_by_placeholder('Écrire un message…')).to_have_value('')
            assert not any(method == 'POST' and path.endswith('/messages') for method,path,body in f.requests[await_count:])
            unexpected = [error for error in errors if "context is sandboxed and lacks the 'allow-same-origin' flag" not in error]
            assert not unexpected, unexpected
            print(f'PASS all mobile routes: {len(routes)} sections, {len(checks)} route-width checks, immediate Escape, chained modals, checkbox sizes and draft cleanup on logout.')
        except BaseException:
            page.screenshot(path=str(f.OUT / 'complete-failure.png'), full_page=True)
            raise
        finally:
            (f.OUT / 'complete-results.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2))
            context.close();browser.close()


if __name__ == '__main__':
    try: run()
    finally: f.server.shutdown()
