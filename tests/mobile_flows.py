"""Mobile browser regressions on a real production build with a synthetic API.
Run after npm run build && npm run stage. No real accounts or production writes.
Optional WORKSPACE_VISUAL_DIR and CHROMIUM_PATH environment variables.
"""
import functools
import json
import os
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('WORKSPACE_VISUAL_DIR', str(ROOT / 'output/mobile')))
OUT.mkdir(parents=True, exist_ok=True)
PERMISSIONS = ['readWorkspace','manageProjects','publishProjects','manageCMS','manageMissions','manageTasks','decideValidations','manageDeliverables','manageContracts','manageDocuments','sendMessages','manageClients','manageTeam','manageOrganization','editOwnProfile','viewFinance','manageFinance','approveExpenses','manageSales','manageSuppliers','manageBusinessUnits','viewHR','manageHR','manageTimesheets','manageObjectives','manageRisks','manageCompliance','viewReports','manageAutomations','manageSupport','manageMarketing','manageAssets','viewLegal','manageLegal','viewPeople','managePeople','reviewPeople','configurePeople','manageOwnership','manageAccess','createSupportRequests','viewMail','sendMail','organizeMail','deleteMail','manageMailSettings','manageMail']
USER = {'id':'00000000-0000-4000-a000-000000000001','firstName':'Jordan','lastName':'Alévêque','email':'mobile-test@example.invalid','role':'OWNER','permissions':PERMISSIONS}
SESSION = {'accessToken':'fixture-access','refreshToken':'fixture-refresh-token-long-enough','sessionId':'fixture-session','user':USER}
WORKSPACE = {
 'workspace':{'name':'Squared Group'},
 'projects':[{'id':'project-1','version':1,'title':'Une référence projet volontairement très longue pour tester les petits écrans','status':'active','updatedAt':'2026-09-20T08:00:00Z'}],
 'tasks':[{'id':'task-1','version':1,'title':'Valider le parcours mobile de Squared Workspace','status':'pending','dueAt':'2026-09-23T12:00:00Z'}],
 'missions':[],'validations':[],'deliverables':[],'contracts':[],'documents':[],
 'notifications':[{'id':'notification-1','version':1,'title':'Décision requise','body':'Une validation attend votre réponse.','kind':'Produit','isRead':False,'createdAt':'2026-09-22T08:00:00Z'}],
 'conversations':[{'id':'conversation-1','name':'Direction produit','participantIDs':[USER['id'],'member-2'],'unread':2,'messages':[{'id':'message-1','authorId':'member-2','authorName':'Équipe Design','body':'La revue est prête. '+('UneLongueRéférenceSansEspaces'*8),'createdAt':'2026-09-20T08:30:00Z'}]}, {'id':'conversation-2','name':'Équipe créative','participantIDs':[USER['id'],'member-2'],'unread':0,'messages':[]}],
 'team':[dict(USER,isActive=True),{'id':'member-2','firstName':'Équipe','lastName':'Design','email':'design@example.invalid','role':'COLLABORATOR','isActive':True}]
}
SETTINGS = {'appearanceMode':'dark','dashboardDensity':'balanced','contentWidth':'balanced','language':'fr-FR','timezone':'Europe/Paris','compactSidebar':False,'reducedMotion':True}
MAIL = {'id':'mail-1','direction':'INBOUND','folder':'INBOX','status':'RECEIVED','subject':'Revue mobile et préparation du prochain lancement','fromName':'Équipe Design','fromEmail':'design@example.invalid','toEmails':[USER['email']],'ccEmails':[],'preview':'La revue est disponible.','textBody':'Bonjour,\nLa revue est disponible.','htmlBody':'<html><body><table width="560"><tr><td><h1>La revue est disponible</h1><p>Une mise en page réelle et lisible.</p></td></tr></table></body></html>','attachments':[],'isRead':False,'isStarred':True,'receivedAt':'2026-09-20T08:45:00Z'}
requests, reports, errors, missing_assets = [], [], [], []
unknown = set()
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
server = ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT / '_site')))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'

def fixture(route):
    req=route.request; path=urlsplit(req.url).path; method=req.method
    body=req.post_data_json if req.post_data else None
    requests.append((method,path,body))
    def send(payload,status=200):
        route.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*'},body=json.dumps(payload))
    if method=='OPTIONS': return send({})
    if path in ('/v1/auth/password','/v1/auth/refresh'):return send(SESSION)
    if path=='/v1/me':return send(USER)
    if path=='/v1/workspace':return send(WORKSPACE)
    if path=='/v1/domain-data/catalog':return send({'kinds':[]})
    if path=='/v1/settings':return send(SETTINGS)
    if path=='/v1/me/security':return send({'multiFactorEnabled':True,'loginAlertsEnabled':True})
    if path=='/v1/sessions':return send([{'id':'fixture-session','device_name':'Test mobile','platform':'Web','last_seen_at':'2026-09-22T09:00:00Z'}])
    if path=='/v1/people':return send({'people':[]})
    if path=='/v1/people/overview':return send({'activePeople':0,'onboardingPeople':0,'openAssessments':0,'profilesToReview':0})
    if path=='/v1/training/catalog':return send({'program':{'title':'Squared BUILD'},'stats':{},'lessons':[]})
    if path=='/v1/admin/security-overview':return send({'healthy':True,'services':[]})
    if path in ('/v1/invitations','/v1/custom-roles'):return send([])
    if path=='/v1/cms/collections':return send({'collections':[]})
    if path=='/v1/mailbox/newsletters/subscribers':return send({'subscribers':[],'counts':{'active':0}})
    if path=='/v1/mailbox/templates':return send({'templates':[]})
    if path=='/v1/mailbox/style':return send({})
    if path=='/v1/mailbox':return send({'messages':[MAIL]})
    if path=='/v1/mailbox/mail-1/thread':return send({'messages':[MAIL]})
    if path=='/v1/mailbox/mail-1': MAIL.update(body or {});return send(MAIL)
    if path=='/v1/mailbox/send':return send({'id':'sent-mail'},201)
    if path.startswith('/v1/conversations/'):
        cid=path.split('/')[3];conv=next((v for v in WORKSPACE['conversations'] if v['id']==cid),None)
        if conv and path.endswith('/read'):conv['unread']=0;return send({'ok':True})
        if conv and path.endswith('/messages'):
            text=(body or {}).get('message',{}).get('body','')
            if text=='FAIL_TEST':return send({'message':'Échec simulé. Réessayez.'},500)
            message=dict((body or {}).get('message',{}),authorId=USER['id']);conv['messages'].append(message);return send(message,201)
    if path=='/v1/conversations' and method=='POST':WORKSPACE['conversations'].append(body);return send(body,201)
    if path.startswith('/v1/domain-data/'):return send({'items':[],'nextCursor':None})
    collection=path.removeprefix('/v1/').split('/')[0]
    if collection in WORKSPACE and isinstance(WORKSPACE[collection],list):
        if method in ('PUT','PATCH','POST'):return send(body or {'ok':True})
        return send(WORKSPACE[collection])
    if '/cms/' in path:return send({'items':[]})
    unknown.add((method,path));return send({})

def settled(page):
    expect(page.locator('#workspace-main')).to_have_attribute('aria-busy','false',timeout=12000)
    page.wait_for_timeout(120)

def go(page,section,subpage=''):
    page.evaluate('async ([s,p])=>{const m=await import("/js/store.js");m.setRoute(s,p)}',[section,subpage]);settled(page)

def check_width(page,label):
    result=page.evaluate('''()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('.content *,.topbar *, .auth-page *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0 && (r.right>innerWidth+1 || r.left < -1) && getComputedStyle(e).position!=='fixed' && !e.closest('.subnav,.sq-scroll-region,.sidebar,.command')}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,70),width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))})''')
    reports.append({'test':label,**result})
    if result['scroll']>result['width']+1:
        page.screenshot(path=str(OUT/'overflow-failure.png'),full_page=True)
    assert result['scroll']<=result['width']+1,(label,result)

def flows(page):
    page.goto(origin);page.locator('input[name=email]').fill(USER['email']);page.locator('input[name=password]').fill('fixture-pass123')
    check_width(page,'login-390');page.get_by_role('button',name='Se connecter',exact=True).click();settled(page)
    expect(page.locator('.sq-mobile-tools-trigger')).to_be_visible()
    for width,height in [(320,740),(360,780),(390,844),(430,932),(768,1024),(880,1024),(844,390),(1024,768),(1440,1000)]:
        page.set_viewport_size({'width':width,'height':height})
        for section in ['dashboard','projects','tasks','messages','mailbox','notifications','profile','settings','training','people']:
            go(page,section);check_width(page,f'{section}-{width}x{height}')
        go(page,'dashboard')
        if width in (320,390,768,1440):page.screenshot(path=str(OUT/f'dashboard-{width}.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});go(page,'messages')
    query=page.get_by_role('searchbox',name='Rechercher une conversation');query.press_sequentially('creative',delay=20)
    expect(query).to_be_focused();expect(page.locator('.conversation-item')).to_have_count(1)
    query.fill('');page.locator('.conversation-item').filter(has_text='Direction produit').click()
    expect(page.locator('.sq-message-panel')).to_be_visible();expect(page.locator('.sq-conversation-list')).not_to_be_visible()
    box=page.get_by_placeholder('Écrire un message…');box.fill('Brouillon privé');box.focus()
    page.evaluate('window.dispatchEvent(new Event("sq:messages-refresh"))');expect(box).to_have_value('Brouillon privé');expect(box).to_be_focused()
    go(page,'tasks');go(page,'messages');expect(box).to_have_value('Brouillon privé')
    check_width(page,'message-open-390');page.screenshot(path=str(OUT/'messages-390.png'),full_page=True)
    page.get_by_role('button',name='Envoyer',exact=True).click();expect(box).to_have_value('')
    expect(page.get_by_role('button',name='Envoyer',exact=True)).to_be_disabled()
    assert sum(1 for method,path,body in requests if method=='POST' and path.endswith('/messages'))==1
    box.fill('FAIL_TEST');page.get_by_role('button',name='Envoyer',exact=True).click();expect(page.get_by_text('Échec simulé. Réessayez.').first).to_be_visible();expect(box).to_have_value('FAIL_TEST')
    # Simulate the browser connectivity signal; no background mutation queue.
    page.evaluate('window.dispatchEvent(new Event("offline"))');expect(page.get_by_role('button',name='Envoyer',exact=True)).to_be_disabled()
    box.fill('Brouillon hors ligne');go(page,'tasks');go(page,'messages');expect(box).to_have_value('Brouillon hors ligne')
    page.evaluate('window.dispatchEvent(new Event("online"))');box.fill('')
    page.locator('.sq-conversation-back').click();expect(query).to_be_visible()
    go(page,'mailbox');page.locator('.mail-list-pane .mail-item').first.click()
    expect(page.locator('.sq-mail-back')).to_be_visible();expect(page.locator('.mail-list-pane')).not_to_be_visible()
    check_width(page,'mail-reader-390');page.screenshot(path=str(OUT/'mail-reader-390.png'),full_page=True)
    page.locator('.sq-mail-back').click();expect(page.locator('.mail-list-pane')).to_be_visible()
    go(page,'messages')
    page.locator('.menu-toggle button').click();expect(page.locator('.sidebar')).to_have_attribute('role','dialog');expect(page.locator('.main')).to_have_attribute('inert','')
    page.keyboard.press('Shift+Tab');assert page.evaluate('document.querySelector(".sidebar").contains(document.activeElement)')
    page.keyboard.press('Escape');expect(page.locator('.main')).not_to_have_attribute('inert','')
    page.locator('.sq-mobile-tools-trigger').click();expect(page.get_by_role('dialog',name='Outils Workspace')).to_be_visible()
    page.get_by_role('button',name='Épingler cette rubrique').click()
    page.locator('.sq-mobile-tools-trigger').click();expect(page.get_by_role('heading',name='Mes favoris')).to_be_visible()
    page.locator('.sq-tools-sheet').get_by_role('button',name='Changer de thème',exact=True).click()
    expect(page.locator('html')).to_have_attribute('data-theme','light')
    page.screenshot(path=str(OUT/'messages-light-390.png'),full_page=True)
    page.locator('.sq-mobile-tools-trigger').click();page.locator('.sq-tools-sheet').get_by_role('button',name='Installer Workspace',exact=True).click()
    expect(page.get_by_role('dialog',name='Installer Workspace')).to_be_visible();page.keyboard.press('Escape')
    page.get_by_role('button',name='Nouvelle conversation',exact=True).click()
    for w in [320,390,768]:
        page.set_viewport_size({'width':w,'height':844});check_width(page,f'conversation-modal-{w}')
        assert page.locator('.modal').bounding_box()['width']<=w
    page.keyboard.press('Escape');page.set_viewport_size({'width':1440,'height':1000})
    expect(page.locator('.sidebar')).not_to_have_attribute('inert','')

def run():
    with sync_playwright() as playwright:
        executable=os.environ.get('CHROMIUM_PATH')
        browser=playwright.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1,service_workers='block',reduced_motion='reduce')
        context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin) else route.abort())
        context.route('https://workspace.squaredgroup.studio/**',fixture)
        context.route_web_socket('wss://workspace.squaredgroup.studio/**',lambda ws:ws.on_message(lambda message:None))
        page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda response:missing_assets.append(response.url) if response.status==404 and response.url.startswith(origin) else None)
        page.on('dialog',lambda dialog:dialog.dismiss())
        try:
            flows(page)
            unexpected=[error for error in errors if "context is sandboxed and lacks the 'allow-same-origin' flag" not in error]
            assert not unexpected,unexpected
            assert not missing_assets,missing_assets
        except BaseException:
            page.screenshot(path=str(OUT/'flow-failure.png'),full_page=True)
            raise
        finally:
            context.close();browser.close()

if __name__=='__main__':
    try:
        run();print(f'PASS: {len(reports)} responsive checks; messaging, drafts, offline signals, mail, tools, focus; no unexpected JavaScript errors or missing assets.')
    finally:
        (OUT/'mobile-results.json').write_text(json.dumps({'checks':reports,'javascript_errors':errors,'missing_assets':missing_assets,'unmodelled_api_reads':sorted(unknown),'mutations':[(method,path) for method,path,body in requests if method not in ('GET','OPTIONS')]},ensure_ascii=False,indent=2))
        server.shutdown()
