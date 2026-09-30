"""Support, native unit artwork and profile photo flows using synthetic accounts."""
import base64
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
import mobile_flows as f

OUT=Path(os.environ.get('WORKSPACE_VISUAL_DIR',str(f.ROOT/'output/studio')))
OUT.mkdir(parents=True,exist_ok=True)
ART=base64.b64encode((f.ROOT/'assets/squaredgroup-logo.png').read_bytes()).decode()
AGENT='00000000-0000-4000-a000-000000000002'
UNIT='00000000-0000-4000-a000-000000000010'
TICKET='00000000-0000-4000-a000-000000000020'
f.USER.update(title='Designer',company='Squared Group',phone='',phoneCountryCode='FR',avatarData=ART)
f.WORKSPACE['team']=[dict(f.USER),dict(id=AGENT,firstName='Arthur',lastName='Dujardin',role='ADMIN',permissions=['manageSupport','sendMessages'],email='support@example.invalid')]
f.WORKSPACE['conversations']=[]
metadata=dict(version=1,tags=['Technique','Important'],createdBy=AGENT,updatedBy=AGENT,createdAt='2026-09-30T08:00:00Z',updatedAt='2026-09-30T09:00:00Z')
TICKETS=[dict(id=TICKET,title='Accès au dossier de lancement',status='inProgress',version=4,createdAt=metadata['createdAt'],updatedAt=metadata['updatedAt'],data=dict(id=TICKET,title='Accès au dossier de lancement',reference='SUP-2026-014',description='L’accès au dossier est bloqué depuis ce matin. Le reste de Workspace fonctionne.',requesterID=AGENT,assigneeID=f.USER['id'],state='inProgress',severity='high',impact='team',urgency='high',slaID=UNIT,firstRespondedAt='2026-09-30T08:30:00Z',escalationLevel=1,metadata=metadata)),dict(id='00000000-0000-4000-a000-000000000021',title='Mise à jour du compte',status='resolved',version=2,data=dict(reference='SUP-2026-013',title='Mise à jour du compte',description='Les informations du compte ont été corrigées.',requesterID=f.USER['id'],state='resolved',severity='low',impact='individual',urgency='low',escalationLevel=0,metadata=metadata))]
UNITS=[dict(id=UNIT,title='Studio créatif',status='active',version=3,data=dict(name='Studio créatif',code='STU',kind='businessUnit',summary='Identité, design produit et expériences numériques.',visualImageData=ART,visualColorHex='#7BE84E',leadUserID=AGENT,memberIDs=[f.USER['id'],AGENT],projectIDs=['project-1'],objectiveIDs=[])),dict(id='00000000-0000-4000-a000-000000000011',title='Production',status='active',version=1,data=dict(name='Production',code='PRD',kind='department',summary='La réalisation des projets du groupe.',visualIconName='Bag',memberIDs=[],projectIDs=[]))]
fail_ticket=False
fail_response=False
files={}
sessions=[dict(id='fixture-session',device_name='Ce navigateur',platform='Web',last_seen_at='2026-09-30T09:00:00Z'),dict(id='other-session',device_name='Autre navigateur',platform='Web',last_seen_at='2026-09-29T09:00:00Z')]

def fixture(route):
    global fail_ticket,fail_response
    req=route.request;path=urlsplit(req.url).path;method=req.method;body=req.post_data_json if req.post_data and 'application/json' in req.headers.get('content-type','') else None
    def send(payload,status=200):
        route.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':f.origin,'etag':'"12"'},body=json.dumps(payload))
    if path=='/v1/files/upload-url':
        assert body['entityType']=='messageAttachment';assert any(v['id']==body['entityId'] for v in f.WORKSPACE['conversations'])
        f.requests.append((method,path,body));return send({'fileId':'studio-file-1'})
    if path=='/v1/files/studio-file-1/content':
        if method=='PUT':files['studio-file-1']=req.post_data_buffer;return send({'ok':True})
        return route.fulfill(status=200,content_type='text/plain',headers={'Access-Control-Allow-Origin':f.origin},body=files['studio-file-1'])
    if path=='/v1/files/studio-file-1/complete':
        assert body['byteCount']==len(files['studio-file-1']);return send({'ok':True})
    if path.endswith('/messages') and method=='POST' and fail_response:
        fail_response=False;f.requests.append((method,path,body));return send({'message':'Échec de réponse simulé. Réessayez.'},500)
    if path=='/v1/me' and method=='PATCH':
        assert 'avatarData' in body, 'A profile update must explicitly retain or remove the native photo'
        f.requests.append((method,path,body));f.USER.update(body);f.WORKSPACE['team'][0].update(body);return send(f.USER)
    if path=='/v1/projects/project-1' and method=='GET':return send(f.WORKSPACE['projects'][0])
    if path=='/v1/sessions':return send(sessions)
    if path=='/v1/sessions/other-session' and method=='DELETE':
        sessions[:]=[value for value in sessions if value['id']!='other-session'];f.requests.append((method,path,body));return send({'ok':True})
    if path=='/v1/domain-data/catalog':return send({'kinds':[{'kind':'business-units','writable':True,'required':['name','code','kind'],'statuses':['active','draft']}]})
    if path.startswith('/v1/domain-data/'):
        f.requests.append((method,path,body))
        parts=path.split('/');items=TICKETS if parts[3]=='tickets' else UNITS if parts[3]=='business-units' else []
        if method=='GET':
            if parts[3]=='tickets' and 'manageSupport' not in f.USER['permissions']:items=[v for v in items if v['data'].get('requesterID')==f.USER['id']]
            if len(parts)>4:return send(next((v for v in items if v['id']==parts[4]),{}))
            return send({'items':items,'nextCursor':None})
        if method in ('POST','PATCH'):
            assert parts[3]=='tickets'
            if fail_ticket:return send({'message':'Conflit simulé : actualisez avant de réessayer.'},409)
            for key in ['reference','title','state','severity','impact','urgency']:assert body['data'][key]
            assert body['data']['state']==body['status'] and body['title']==body['data']['title']
            if method=='POST':
                record=dict(body,version=1,createdAt='2026-09-30T10:00:00Z',updatedAt='2026-09-30T10:00:00Z');items.append(record)
            else:
                record=next(v for v in items if v['id']==parts[4]);assert body['version']==record['version'];record.update(body);record['version']+=1
            return send(record,201 if method=='POST' else 200)
    return f.fixture(route)

def capture(page,name):
    f.settled(page);page.wait_for_timeout(150)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), name
    page.screenshot(path=str(OUT/f'{name}.png'))

def run():
    global fail_ticket,fail_response
    errors=[]
    with sync_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH')
        browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
        context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block',reduced_motion='reduce')
        context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(f.origin) else route.abort())
        context.route('https://workspace.squaredgroup.studio/**',fixture)
        context.route_web_socket('wss://workspace.squaredgroup.studio/**',lambda ws:ws.on_message(lambda message:None))
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f.origin);page.locator('input[name=email]').fill(f.USER['email']);page.locator('input[name=password]').fill('fixture-pass123');page.get_by_role('button',name='Se connecter',exact=True).click();f.settled(page)
        for theme in ['light','dark']:
            page.evaluate('async theme=>{const s=await import("/js/store.js");s.setAppearance({mode:theme})}',theme)
            for width,height in [(320,740),(390,844),(768,1024),(1440,1000)]:
                page.set_viewport_size({'width':width,'height':height});f.go(page,'support','tickets-clients');capture(page,f'support-{theme}-{width}')
                page.get_by_role('button',name='Ouvrir le ticket Accès au dossier de lancement',exact=True).click();f.settled(page);expect(page.locator('.sq-ticket-detail')).to_contain_text('Arthur Dujardin');capture(page,f'ticket-{theme}-{width}')
                page.get_by_role('button',name='Fermer le ticket').click();f.settled(page)
                page.get_by_role('button',name='Créer un ticket',exact=True).first.click();expect(page.get_by_role('dialog',name='Créer un ticket')).to_be_visible();capture(page,f'create-{theme}-{width}');page.keyboard.press('Escape')
                f.go(page,'businessUnits');expect(page.get_by_role('img',name='Image du pôle Studio créatif')).to_be_visible();capture(page,f'units-{theme}-{width}')
                page.get_by_role('button',name='Ouvrir le pôle Studio créatif',exact=True).click();expect(page.get_by_role('dialog',name='Studio créatif')).to_contain_text('Arthur Dujardin');capture(page,f'unit-detail-{theme}-{width}');page.keyboard.press('Escape')
                f.go(page,'profile');expect(page.get_by_role('button',name='Changer la photo')).to_be_visible();capture(page,f'profile-{theme}-{width}')
        page.set_viewport_size({'width':390,'height':844});f.go(page,'support','tickets-clients')
        page.get_by_role('searchbox',name='Rechercher un ticket').fill('introuvable');expect(page.get_by_text('Aucun ticket trouvé',exact=True)).to_be_visible();page.get_by_role('searchbox',name='Rechercher un ticket').fill('')
        page.get_by_role('button',name='Créer un ticket',exact=True).first.click();dialog=page.get_by_role('dialog',name='Créer un ticket')
        dialog.get_by_label('Objet de la demande',exact=True).fill('Mon nouvel accès')
        dialog.get_by_label('Description',exact=True).fill('Le compte doit accéder au dossier partagé pour la revue de demain.')
        fail_ticket=True;dialog.get_by_role('button',name='Créer le ticket',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('Conflit simulé');expect(dialog.get_by_label('Objet de la demande',exact=True)).to_have_value('Mon nouvel accès')
        fail_ticket=False;dialog.get_by_role('button',name='Créer le ticket',exact=True).click();expect(dialog).not_to_be_visible();f.settled(page);expect(page.locator('.sq-ticket-detail')).to_contain_text('Mon nouvel accès')
        page.get_by_role('button',name='Gérer le ticket',exact=True).click();dialog=page.get_by_role('dialog',name='Gérer le ticket');dialog.get_by_label('Statut',exact=True).select_option('resolved');dialog.get_by_role('button',name='Enregistrer les modifications').click();expect(dialog).not_to_be_visible();expect(page.locator('.sq-ticket-detail .sq-ticket-state')).to_have_text('Résolu')
        page.get_by_role('button',name='Fermer le ticket').click();f.settled(page);page.get_by_role('button',name='Ouvrir le ticket Accès au dossier de lancement',exact=True).click();f.settled(page)
        page.get_by_role('button',name='Gérer le ticket',exact=True).click();dialog=page.get_by_role('dialog',name='Gérer le ticket');dialog.get_by_label('Responsable',exact=True).select_option(AGENT);dialog.get_by_role('button',name='Enregistrer les modifications').click();expect(dialog).not_to_be_visible();assert TICKETS[0]['data']['slaID']==UNIT and 'Important' in TICKETS[0]['data']['metadata']['tags']
        page.get_by_role('button',name='Échanger',exact=True).click();f.settled(page);expect(page.get_by_placeholder('Écrire un message…')).to_be_visible()
        expect(page.get_by_placeholder('Écrire un message…')).to_have_value('À propos du ticket SUP-2026-014 : Accès au dossier de lancement.')
        assert not any(method=='POST' and path.endswith('/messages') for method,path,body in f.requests), 'Opening a ticket discussion must leave a draft'
        # A failed first reply preserves the draft and reuses the acknowledged conversation.
        f.WORKSPACE['conversations'].clear()
        page.evaluate('async()=>{const a=await import("/js/api.js");await a.loadWorkspace()}')
        page.evaluate('async id=>{const s=await import("/js/store.js");s.setRoute("support","tickets-clients",id)}',TICKET);f.settled(page)
        reply=page.get_by_label('Message concernant ce ticket',exact=True);reply.fill('Voici la réponse du support avec le contexte demandé.')
        page.reload();f.settled(page);expect(reply).to_have_value('Voici la réponse du support avec le contexte demandé.')
        fail_response=True;page.get_by_role('button',name='Envoyer la réponse',exact=True).click();expect(page.locator('.studio-ticket-thread [role=alert]')).to_contain_text('Échec de réponse simulé')
        assert len(f.WORKSPACE['conversations'])==1;expect(reply).to_have_value('Voici la réponse du support avec le contexte demandé.')
        page.get_by_role('button',name='Envoyer la réponse',exact=True).click();expect(reply).to_have_value('');expect(page.get_by_role('button',name='Envoyer la réponse',exact=True)).to_be_disabled()
        assert len(f.WORKSPACE['conversations'])==1
        assert f.WORKSPACE['conversations'][0]['messages'][0]['body']=='[Ticket SUP-2026-014]\nVoici la réponse du support avec le contexte demandé.'
        expect(page.locator('.studio-ticket-messages')).to_contain_text('Voici la réponse du support')
        page.get_by_label('Fichier pour ce ticket',exact=True).set_input_files({'name':'contexte.txt','mimeType':'text/plain','buffer':b'Ticket attachment evidence'})
        expect(page.locator('.studio-ticket-messages').get_by_role('button',name='contexte.txt',exact=True)).to_be_visible()
        with page.expect_download() as event:page.locator('.studio-ticket-messages').get_by_role('button',name='contexte.txt',exact=True).click()
        download=event.value;assert download.suggested_filename=='contexte.txt';assert Path(download.path()).read_bytes()==b'Ticket attachment evidence'
        capture(page,'ticket-exchanges-390')
        f.go(page,'businessUnits');page.get_by_role('button',name='Ouvrir le pôle Studio créatif',exact=True).click()
        page.get_by_role('dialog',name='Studio créatif').get_by_role('button',name=f.WORKSPACE['projects'][0]['title'],exact=True).click();f.settled(page)
        expect(page.locator('.focus-detail')).to_contain_text(f.WORKSPACE['projects'][0]['title'])
        f.go(page,'settings');page.get_by_label('Thème',exact=True).select_option('light');expect(page.locator('html')).to_have_attribute('data-theme','light')
        page.get_by_label('Thème',exact=True).select_option('dark');expect(page.locator('html')).to_have_attribute('data-theme','dark')
        page.get_by_role('button',name='Révoquer',exact=True).click();page.get_by_role('alertdialog',name='Révoquer cette session ?').get_by_role('button',name='Révoquer',exact=True).click()
        expect(page.get_by_text('Autre navigateur',exact=True)).to_have_count(0);assert len(sessions)==1
        f.go(page,'profile');old_avatar=f.USER['avatarData'];page.get_by_role('button',name='Enregistrer le profil').click();expect(page.get_by_text('Profil mis à jour',exact=True)).to_be_visible();assert f.USER['avatarData']==old_avatar
        page.get_by_label('Choisir une photo de profil').set_input_files(str(f.ROOT/'assets/appicon-256.png'));photo=page.get_by_role('dialog',name='Votre photo de profil');expect(photo.get_by_role('img',name='Aperçu du recadrage de la photo')).to_be_visible();capture(page,'photo-crop-390')
        photo.get_by_role('slider',name='Zoom de la photo').press('End');photo.get_by_role('button',name='Enregistrer la photo').click();expect(photo).not_to_be_visible();assert f.USER['avatarData'].startswith('/9j/');assert len(base64.b64decode(f.USER['avatarData']))<10*1024*1024
        f.go(page,'dashboard');f.go(page,'profile');expect(page.locator('.sq-photo-avatar img')).to_have_attribute('src','data:image/jpeg;base64,'+f.USER['avatarData'])
        page.get_by_label('Choisir une photo de profil').set_input_files({'name':'invalide.png','mimeType':'image/png','buffer':b'not-an-image'});expect(page.get_by_role('status').filter(has_text='Cette image ne peut pas être ouverte')).to_be_visible();assert f.USER['avatarData'].startswith('/9j/')
        page.get_by_role('button',name='Retirer',exact=True).click();page.get_by_role('alertdialog',name='Retirer votre photo ?').get_by_role('button',name='Retirer la photo',exact=True).click();expect(page.locator('.sq-photo-avatar img')).to_have_count(0);assert f.USER['avatarData'] is None
        # Requester creation must be available without support-management permission.
        f.USER['permissions']=['readWorkspace','createSupportRequests','editOwnProfile','sendMessages'];f.USER['role']='CLIENT'
        page.evaluate('async u=>{const s=await import("/js/store.js");s.setState({user:u});s.setRoute("support","tickets-clients")}',f.USER);f.settled(page)
        expect(page.get_by_role('button',name='Créer un ticket',exact=True).first).to_be_visible();page.get_by_role('button',name='Tous',exact=True).click();page.get_by_role('button',name='Ouvrir le ticket Mon nouvel accès',exact=True).click();f.settled(page);expect(page.get_by_role('button',name='Gérer le ticket',exact=True)).to_have_count(0)
        assert not errors,errors
        context.close();browser.close()
    print('Support CRUD/conflicts/permissions, reload-safe inline replies, retry without duplicate conversation, uploaded/downloaded attachments, linked unit projects, live appearance and profile photo passed; 4 widths in both themes.')

if __name__=='__main__':run()
