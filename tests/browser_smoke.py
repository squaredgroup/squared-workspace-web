"""Browser regression tests. All authentication/API responses are synthetic fixtures.
No account or production mutation is used by this suite.
"""
import functools
import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def send_error(self, code, message=None, explain=None):
        if code == 404:
            data = (ROOT / '404.html').read_bytes()
            self.send_response(404); self.send_header('Content-Type','text/html; charset=utf-8'); self.end_headers(); self.wfile.write(data)
        else:
            super().send_error(code,message,explain)

USER = {'id':'00000000-0000-4000-a000-000000000001','firstName':'Test','lastName':'Workspace','email':'browser-test@example.invalid','role':'CLIENT','permissions':['readWorkspace','editOwnProfile','sendMessages']}
SESSION = {'accessToken':'fixture-access-token','refreshToken':'fixture-refresh-token-long-enough','sessionId':'fixture-session','user':USER}
WORKSPACE = {'projects':[{'id':'test-project','title':'Projet test confidentiel','status':'active'}],'tasks':[],'missions':[],'notifications':[],'conversations':[],'deliverables':[],'validations':[]}
results = []

server = ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'

def fixture(route):
    path=urlsplit(route.request.url).path
    if path == '/v1/auth/password' or path == '/v1/auth/refresh': payload=SESSION
    elif path == '/v1/me': payload=USER
    elif path == '/v1/workspace': payload=WORKSPACE
    elif path == '/v1/domain-data/catalog': payload={'kinds':[]}
    elif path == '/health': payload={'status':'ok'}
    elif path.startswith('/v1/sessions/') and route.request.method=='DELETE': return route.fulfill(status=204)
    else: return route.fulfill(status=404,content_type='application/json',body=json.dumps({'error':'fixture_not_defined'}))
    route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':origin,'ETag':'"fixture-workspace-revision"'},body=json.dumps(payload))

with sync_playwright() as p:
    kwargs={'headless':True,'args':['--no-sandbox']}
    if os.getenv('CHROMIUM_EXECUTABLE'): kwargs['executable_path']=os.environ['CHROMIUM_EXECUTABLE']
    browser=p.chromium.launch(**kwargs)
    def context(width=1280, init=None):
        c=browser.new_context(viewport={'width':width,'height':900},service_workers='block')
        c.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin) else r.abort())
        c.route('https://workspace.squaredgroup.studio/**',fixture)
        c.route_web_socket('wss://workspace.squaredgroup.studio/**',lambda ws:ws.on_message(lambda message:None))
        c.route('https://fonts.googleapis.com/**',lambda r:r.abort())
        c.route('https://fonts.gstatic.com/**',lambda r:r.abort())
        if init: c.add_init_script(init)
        return c
    def record(name): results.append(name); print('PASS',name,flush=True)
    def login(page):
        page.goto(origin)
        page.get_by_label('Adresse e-mail',exact=True).fill(USER['email'])
        page.get_by_label('Mot de passe',exact=True).fill('FixturePassword123')
        page.get_by_role('button',name='Se connecter',exact=True).click()
        expect(page.get_by_role('heading',name='Tableau de bord',exact=True)).to_be_visible()

    for width in [1280,390]:
        c=context(width);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin)
        expect(page.get_by_role('heading',name='Connexion',exact=True)).to_be_visible()
        if width == 1280:
            expect(page.locator('.auth-capabilities')).to_be_visible()
            expect(page.get_by_text('Pilotez tout.',exact=False)).to_be_visible()
            password=page.get_by_label('Mot de passe',exact=True);password.fill('FixturePassword123')
            reveal=page.get_by_role('button',name='Afficher le mot de passe',exact=True);reveal.click()
            assert password.get_attribute('type') == 'text'
            expect(page.get_by_role('button',name='Masquer le mot de passe',exact=True)).to_be_visible()
        else:
            expect(page.locator('.auth-mobile-brand')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'horizontal overflow'
        assert not errors,errors
        page.screenshot(path=str(ROOT / f'test-login-{width}.png'))
        record(f'connexion visible / largeur {width}');c.close()

    c=context(init="localStorage.setItem('sq-web-appearance','{broken');");page=c.new_page();page.goto(origin+'/#/tasks/%ZZ')
    expect(page.get_by_role('heading',name='Connexion',exact=True)).to_be_visible();record('préférences et fragment invalides sans écran noir');c.close()

    c=context(init="Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}});Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('blocked','SecurityError')}});")
    page=c.new_page();page.goto(origin);expect(page.get_by_role('heading',name='Connexion',exact=True)).to_be_visible();record('stockage navigateur bloqué sans écran noir');c.close()

    for path,title,field in [('/activation','Activer votre accès','Code d’invitation'),('/reinitialisation','Nouveau mot de passe','Code reçu'),('/verification-email','Vérifier votre adresse','Code de vérification')]:
        c=context();page=c.new_page();page.goto(origin+path+'?email=browser-test%40example.invalid&token=fixture-single-use-token-12345')
        expect(page.get_by_role('heading',name=title,exact=True)).to_be_visible()
        expect(page.get_by_label(field,exact=True)).to_have_value('fixture-single-use-token-12345')
        assert 'token=' not in page.url and 'email=' not in page.url
        record(f'lien {path} avec jeton retiré de l’adresse');c.close()

    c=context();page=c.new_page();page.route('https://workspace.squaredgroup.studio/v1/auth/password',lambda r:r.fulfill(status=401,content_type='application/json',body='{"error":"invalid_credentials"}'))
    page.goto(origin);page.get_by_label('Adresse e-mail',exact=True).fill(USER['email']);page.get_by_label('Mot de passe',exact=True).fill('incorrect');page.get_by_role('button',name='Se connecter',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('incorrect');expect(page.get_by_role('button',name='Se connecter',exact=True)).to_be_enabled()
    record('mot de passe incorrect : erreur lisible et bouton réactivé');c.close()

    c=context();page=c.new_page();page.route('https://workspace.squaredgroup.studio/v1/auth/password',lambda r:r.abort('failed'))
    page.goto(origin);page.get_by_label('Adresse e-mail',exact=True).fill(USER['email']);page.get_by_label('Mot de passe',exact=True).fill('incorrect');page.get_by_role('button',name='Se connecter',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Impossible de joindre');record('erreur réseau affichée sans effacer la page');c.close()

    c=context();page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));login(page)
    assert page.evaluate("localStorage.getItem('sq-workspace-web-refresh')") is None
    assert page.evaluate("sessionStorage.getItem('sq-workspace-web-refresh')") == SESSION['refreshToken']
    expect(page.get_by_text('Projet test confidentiel',exact=True)).to_be_visible()
    assert not errors,errors
    page.get_by_role('button',name='Déconnexion',exact=True).click()
    expect(page.get_by_role('heading',name='Connexion',exact=True)).to_be_visible()
    expect(page.get_by_text('Projet test confidentiel',exact=True)).to_have_count(0)
    assert page.evaluate("sessionStorage.getItem('sq-workspace-web-refresh')") is None
    record('connexion simulée puis déconnexion immédiate et retrait des données');c.close()

    c=context();page=c.new_page();login(page)
    page.route('https://workspace.squaredgroup.studio/v1/me',lambda r:r.fulfill(status=401,content_type='application/json',body='{"error":"unauthorized"}'))
    page.route('https://workspace.squaredgroup.studio/v1/auth/refresh',lambda r:r.fulfill(status=401,content_type='application/json',body='{"error":"invalid_refresh_token"}'))
    page.evaluate("async()=>{const api=await import('/js/api.js');try{await api.loadMe()}catch{}}")
    expect(page.get_by_role('heading',name='Connexion',exact=True)).to_be_visible()
    expect(page.get_by_text('Projet test confidentiel',exact=True)).to_have_count(0)
    expect(page.get_by_role('alert')).to_contain_text('expiré');record('session expirée : suppression du contenu privé');c.close()

    c=context(init="sessionStorage.setItem('sq-workspace-web-refresh','fixture-refresh-token-long-enough')");page=c.new_page()
    page.route('https://workspace.squaredgroup.studio/v1/auth/refresh',lambda r:r.abort('failed'))
    page.goto(origin);expect(page.get_by_role('button',name='Se connecter',exact=True)).to_be_enabled()
    assert page.evaluate("sessionStorage.getItem('sq-workspace-web-refresh')")
    record('panne réseau : session renouvelable conservée');c.close()

    c=context();page=c.new_page();page.goto(origin)
    outcome=page.evaluate("""async()=>{const api=await import('/js/api.js');const original=window.fetch;window.fetch=(_u,options)=>new Promise((_r,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError'))));try{await api.request('/health',{auth:false,timeoutMs:120})}catch(e){return {code:e.code,message:e.message}}finally{window.fetch=original}}""")
    assert outcome['code']=='timeout';record('délai réseau borné, pas de chargement infini');c.close()

    c=context();page=c.new_page();page.goto(origin)
    outcome=page.evaluate("""async()=>{const a=await import('/js/api.js');const s=await import('/js/store.js');const original=fetch;let resolve;a.setSession({accessToken:'expired',refreshToken:'fixture-long-refresh-token'});window.fetch=()=>new Promise(r=>{resolve=r});const pending=a.refreshSession().catch(e=>e.name);await Promise.resolve();a.clearSession('logout');resolve(new Response(JSON.stringify({accessToken:'late',refreshToken:'late-refresh'}),{headers:{'content-type':'application/json'}}));await pending;window.fetch=original;return s.state.accessToken}""")
    assert outcome is None;record('réponse tardive ne réouvre pas une session fermée');c.close()

    c=context();page=c.new_page();page.route('https://workspace.squaredgroup.studio/v1/auth/password',lambda r:r.fulfill(status=202,content_type='application/json',body=json.dumps({'mfaRequired':True,'challengeId':'fixture-challenge','publicKey':{'challenge':'dGVzdA','rpId':'localhost','allowCredentials':[]}})))
    page.goto(origin);page.get_by_label('Adresse e-mail',exact=True).fill(USER['email']);page.get_by_label('Mot de passe',exact=True).fill('FixturePassword123');page.get_by_role('button',name='Se connecter',exact=True).click()
    expect(page.get_by_role('heading',name='Vérification renforcée',exact=True)).to_be_visible()
    expect(page.get_by_label('Code de récupération',exact=True)).to_be_visible()
    assert page.evaluate("localStorage.getItem('sq-workspace-web-refresh')") is None
    record('MFA obligatoire : pas de session avant seconde vérification');c.close()
    browser.close()
server.shutdown()
(ROOT/'test-results.json').write_text(json.dumps({'passed':len(results),'tests':results,'api':'mocked','productionAuthenticationTested':False},ensure_ascii=False,indent=2))
print(f'{len(results)} tests navigateur réussis (API simulée).')
