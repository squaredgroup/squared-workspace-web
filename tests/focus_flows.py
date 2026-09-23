"""Focus acceptance on a compiled application and synthetic API only."""
import json
import os
from datetime import date
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright, expect
import mobile_flows as f

writes=[]
checks=[]
errors=[]
today=date.today().isoformat()
f.WORKSPACE['tasks']=[{'id':f'task-{i}','version':1,'title':f'Audit tâche numéro {i}','status':'pending','parentId':'project-1','payload':{'assigneeId':f.USER['id'],'dueAt':today,'customField':'preserve'}} for i in range(48)]
f.WORKSPACE['validations']=[{'id':'validation-1','version':3,'title':'Valider la version du livrable','status':'pending','payload':{'description':'Version soumise à la revue.'}}]
f.WORKSPACE['notifications'][0]['payload']={'entityKind':'task','entityId':'task-44'}

def fixture(route):
    req=route.request
    parts=urlsplit(req.url).path.strip('/').split('/')
    if len(parts) in (2,3) and parts[0]=='v1' and parts[1] in ('tasks','projects','missions','validations','deliverables','documents','events'):
        domain=parts[1]
        records=f.WORKSPACE.setdefault(domain,[])
        item=next((v for v in records if v['id']==unquote(parts[2])),None) if len(parts)==3 else None
        def send(value,status=200):
            route.fulfill(status=status,content_type='application/json',body=json.dumps(value))
        if req.method=='GET':return send(records if len(parts)==2 else item or {'message':'Élément inaccessible'},200 if len(parts)==2 or item else 404)
        if req.method in ('POST','PATCH'):
            body=req.post_data_json
            writes.append((domain,req.method,body))
            if req.method=='PATCH':
                if not item or item['version']!=body.get('version'):return send({'message':'La version a changé.'},409)
                item.update(body);item['version']+=1;return send(item)
            new={**body,'id':f'created-{len(writes)}','version':1};records.append(new);return send(new,201)
    return f.fixture(route)

def go(page,section,subpage='',item=''):
    page.evaluate('async ([s,p,i])=>{const m=await import("/js/store.js");m.setRoute(s,p,i)}',[section,subpage,item])
    f.settled(page)

def width_check(page,label):
    result=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
    assert result['scroll']<=page.viewport_size['width']+1,(label,result)
    checks.append({'name':label,**result})

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}))
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block',reduced_motion='reduce')
        context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(f.origin) else r.abort())
        context.route('https://workspace.squaredgroup.studio/**',fixture)
        context.route_web_socket('wss://workspace.squaredgroup.studio/**',lambda ws:ws.on_message(lambda message:None))
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda dialog:dialog.accept())
        try:
            page.goto(f.origin)
            page.get_by_label('Adresse e-mail',exact=True).fill(f.USER['email'])
            page.get_by_label('Mot de passe',exact=True).fill('fixture-pass123')
            page.get_by_role('button',name='Se connecter',exact=True).click();f.settled(page)
            expect(page.locator('.focus-home')).to_be_visible()
            first=page.locator('.focus-attention')
            expect(first).to_be_visible()
            assert first.bounding_box()['y']<650
            page.get_by_label('Périmètre de la journée').select_option('mine')
            expect(page.locator('.focus-home-content .focus-record').first).to_be_visible()
            for theme in ['dark','light']:
                page.evaluate('async mode=>{const m=await import("/js/store.js");m.setAppearance({mode})}',theme)
                for width in [320,390,768,1024,1440]:
                    page.set_viewport_size({'width':width,'height':900})
                    for route in ['dashboard','tasks','projects','notifications','spaces','messages','mailbox']:
                        go(page,route);width_check(page,f'{route}-{width}-{theme}')
                    if width in [390,1440]:
                        go(page,'dashboard');page.screenshot(path=str(f.OUT/f'focus-home-{width}-{theme}.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844});go(page,'tasks')
            search=page.get_by_label('Rechercher dans la liste',exact=True)
            search.evaluate('node=>window.__focusSearchNode=node')
            search.press_sequentially('Audit tâche numéro 44',delay=10)
            expect(search).to_be_focused();assert search.evaluate('node=>node===window.__focusSearchNode')
            expect(page.locator('.focus-record')).to_have_count(1)
            page.get_by_role('button',name='Ouvrir Audit tâche numéro 44',exact=True).click();f.settled(page)
            expect(page.locator('.focus-detail')).to_be_visible();assert 'item=task-44' in page.url
            page.get_by_role('button',name='Retour à la liste',exact=True).click();f.settled(page)
            expect(search).to_have_value('Audit tâche numéro 44')
            page.get_by_role('button',name='Recherche',exact=True).click()
            page.get_by_role('combobox',name='Rechercher dans Workspace').fill('Audit tâche numéro 47')
            page.get_by_role('option').filter(has_text='Audit tâche numéro 47').click();f.settled(page)
            expect(page.get_by_role('heading',name='Audit tâche numéro 47',exact=True)).to_be_visible()
            assert 'item=task-47' in page.url
            page.reload();f.settled(page);expect(page.locator('.focus-detail')).to_be_visible()
            go(page,'tasks');page.get_by_role('button',name='Nouvelle tâche',exact=True).click()
            form=page.locator('.focus-editor')
            form.get_by_label('Tâche',exact=True).fill('Créer un parcours réellement mobile')
            form.get_by_label('Description',exact=True).fill('Saisie sans identifiant technique.')
            form.get_by_label('Projet',exact=True).select_option('project-1')
            form.get_by_label('Responsable',exact=True).select_option(f.USER['id'])
            form.get_by_label('Échéance',exact=True).fill(today)
            page.locator('.focus-editor-dialog').get_by_role('button',name='Enregistrer',exact=True).click()
            expect(page.locator('.focus-editor-dialog')).to_have_count(0)
            created=next(body for domain,method,body in writes if domain=='tasks' and method=='POST')
            assert created['parentId']=='project-1' and created['payload']['assigneeId']==f.USER['id']
            assert created['payload']['dueAt']==today
            assert not form.count()
            go(page,'tasks',item='task-44')
            page.get_by_role('button',name='Modifier',exact=True).click()
            page.locator('.focus-editor').get_by_label('Tâche',exact=True).fill('Tâche revue')
            page.locator('.focus-editor-dialog').get_by_role('button',name='Enregistrer',exact=True).click()
            expect(page.locator('.focus-editor-dialog')).to_have_count(0)
            record=next(item for item in f.WORKSPACE['tasks'] if item['id']=='task-44')
            assert record['payload']['customField']=='preserve'
            page.get_by_role('button',name='Terminer la tâche',exact=True).click()
            expect(page.get_by_role('button',name='Terminer la tâche',exact=True)).to_have_count(0)
            assert record['status']=='completed'
            go(page,'notifications')
            q=page.get_by_label('Rechercher une notification',exact=True);q.evaluate('n=>window.__notificationSearch=n')
            q.press_sequentially('Décision',delay=15);expect(q).to_be_focused();assert q.evaluate('n=>n===window.__notificationSearch')
            page.get_by_role('button',name='Ouvrir l’élément',exact=True).click();f.settled(page)
            expect(page.get_by_role('heading',name='Tâche revue',exact=True)).to_be_visible()
            go(page,'messages');page.locator('.conversation-item').filter(has_text='Direction produit').click();f.settled(page)
            box=page.get_by_placeholder('Écrire un message…');box.fill('Brouillon de recette confidentiel')
            assert not page.evaluate('Object.values(localStorage).some(v=>v.includes("Brouillon de recette confidentiel"))')
            page.reload();f.settled(page);expect(box).to_have_value('Brouillon de recette confidentiel')
            page.screenshot(path=str(f.OUT/'focus-conversation-390.png'),full_page=True)
            page.evaluate('async()=>{const a=await import("/js/api.js");await a.logout()}')
            expect(page.get_by_label('Adresse e-mail',exact=True)).to_be_visible()
            assert not page.evaluate('Object.keys(sessionStorage).some(k=>k.startsWith("sq-focus-draft:"))')
            unexpected=[e for e in errors if "context is sandboxed and lacks the 'allow-same-origin' flag" not in e]
            assert not unexpected,unexpected
            print(f'PASS Focus: {len(checks)} layout checks + task creation/update/completion, exact deep links, stable search, reloads and private-draft lifecycle.')
        except BaseException:
            page.screenshot(path=str(f.OUT/'focus-failure.png'),full_page=True);raise
        finally:
            (f.OUT/'focus-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'writes':len(writes)},ensure_ascii=False,indent=2))
            context.close();browser.close()

if __name__=='__main__':
    try:run()
    finally:f.server.shutdown()
