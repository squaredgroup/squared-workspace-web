"""Inspectable messenger renders, using synthetic accounts and local media only."""
import base64
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
import mobile_flows as f
from media_fixture import sample_pdf

OUT = Path(os.environ.get('WORKSPACE_VISUAL_DIR', str(f.ROOT / 'output/messages')))
OUT.mkdir(parents=True, exist_ok=True)
IMAGE = (f.ROOT / 'assets/squaredgroup-logo.png').read_bytes()
PDF = sample_pdf()
f.USER['avatarData'] = base64.b64encode((f.ROOT / 'assets/appicon-256.png').read_bytes()).decode()
f.WORKSPACE['team'][0]['avatarData'] = f.USER['avatarData']
f.WORKSPACE['team'][1].update(firstName='Arthur', lastName='DUJARDIN-CAUSERET')

def message(mid, text, mine=False, minute=50, **extra):
    return dict(id=mid, authorId=f.USER['id'] if mine else 'member-2', authorName='Arthur DUJARDIN-CAUSERET', body=text, createdAt=f'2026-09-30T08:{minute:02}:00Z', **extra)

f.WORKSPACE['conversations'] = [
    dict(id='conversation-1', name='Arthur DUJARDIN-CAUSERET', kind='direct', participantIDs=[f.USER['id'], 'member-2'], unread=2, messages=[
        message('m1', 'Bonjour Arthur ! La présentation est prête.', True, 50),
        message('m2', 'Je te partage les dernières versions ici.', True, 51),
        message('m3', 'Parfait, merci ! On garde cette direction pour le lancement.', False, 52),
        message('m4', 'Voici le dossier pour la revue.', False, 53),
        message('m5', 'Document PDF', False, 54, attachments=[dict(id='preview-pdf', fileName='Présentation-Squared.pdf', mediaType='application/pdf')]),
        message('m6', 'Image', True, 55, attachments=[dict(id='preview-image', fileName='Identité-Squared.png', mediaType='image/png')]),
        message('m7', 'Tout est prêt pour demain ✨', True, 56),
    ]),
    dict(id='group-1', name='Squared Group', avatarData=base64.b64encode(IMAGE).decode(), participantIDs=[f.USER['id'], 'member-2', 'member-3'], unread=3, messages=[message('g1', 'Le point de demain est confirmé.', minute=58)]),
    *[dict(id=f'group-{index}', name=name, participantIDs=[f.USER['id'], 'member-2'], unread=0, messages=[message(f'g{index}', text, minute=40-index)]) for index, name, text in [
        (2, 'Studio créatif', 'La nouvelle identité est validée.'),
        (3, 'Lancement Workspace', 'Tu peux regarder la dernière version ?'),
        (4, 'Sarah Martin', 'Merci, à demain !'),
        (5, 'Direction produit', 'On se retrouve à 14 h.'),
    ]],
]
f.WORKSPACE['enterprise'] = {'messageProfiles': [dict(messageID='m7', readBy=['Arthur DUJARDIN-CAUSERET']), dict(messageID='m3', reactions={'👍':['Jordan Alévêque']})]}
f.WORKSPACE['intelligence'] = {'pinnedConversationIDs':['group-1']}

def fixture(route):
    path=urlsplit(route.request.url).path
    if path in ('/v1/files/preview-image/content', '/v1/files/preview-pdf/content'):
        pdf=path.endswith('preview-pdf/content')
        return route.fulfill(content_type='application/pdf' if pdf else 'image/png', headers={'Access-Control-Allow-Origin':f.origin}, body=PDF if pdf else IMAGE)
    return f.fixture(route)

def capture(page, name):
    f.settled(page)
    page.wait_for_timeout(250)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), name
    page.screenshot(path=str(OUT / f'{name}.png'))

def run():
    errors=[]
    with sync_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH')
        browser=p.chromium.launch(headless=True, **({'executable_path':executable} if executable else {}))
        context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,service_workers='block',reduced_motion='reduce')
        context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(f.origin) else route.abort())
        context.route('https://workspace.squaredgroup.studio/**',fixture)
        context.route_web_socket('wss://workspace.squaredgroup.studio/**',lambda ws:ws.on_message(lambda message:None))
        page=context.new_page();page.on('pageerror', lambda error:errors.append(str(error)))
        try:
            page.goto(f.origin);page.locator('input[name=email]').fill(f.USER['email']);page.locator('input[name=password]').fill('fixture-pass123')
            page.get_by_role('button',name='Se connecter',exact=True).click();f.settled(page)
            for theme in ['light','dark']:
                page.evaluate('async theme=>{const s=await import("/js/store.js");s.setAppearance({mode:theme})}',theme)
                for width, height in [(320,740),(390,844),(768,1024),(1440,1000)]:
                    page.set_viewport_size({'width':width,'height':height});f.go(page,'messages')
                    expect(page.get_by_role('button',name='Ouvrir la conversation épinglée Squared Group')).to_be_visible()
                    expect(page.locator('.sq-inbox-summary')).not_to_be_empty()
                    capture(page,f'inbox-{theme}-{width}')
                    if theme == 'light' and width == 390:
                        page.get_by_role('button',name='Ouvrir la conversation épinglée Squared Group').click();f.settled(page)
                        expect(page.locator('.sq-thread-heading')).to_contain_text('Squared Group')
                        page.get_by_role('button',name='Retour aux conversations').click();f.settled(page)
                    page.locator('.conversation-item').filter(has_text='Arthur DUJARDIN-CAUSERET').click();f.settled(page)
                    expect(page.locator('.sq-thread-heading')).to_be_visible()
                    assert page.locator('.message-bubble-head').count()==0, 'A direct thread must not repeat its contact heading'
                    expect(page.locator('.sq-message-text-only .sq-bubble-surface .sq-message-footer').first).to_be_visible()
                    page.locator('.message-thread').evaluate('(el)=>el.scrollTop=0')
                    expect(page.get_by_role('img',name='Aperçu PDF : Présentation-Squared.pdf')).to_have_attribute('data-rendered','true')
                    expect(page.locator('.sq-attachment-card-pdf .sq-attachment-caption')).to_contain_text('PDF · 2 pages')
                    capture(page,f'thread-{theme}-{width}')
                    page.locator('.sq-attachment-card-image').scroll_into_view_if_needed()
                    expect(page.locator('.sq-attachment-card-image .sq-attachment-preview img')).to_be_visible()
                    expect(page.locator('.sq-attachment-card-image .sq-attachment-caption')).to_be_hidden()
                    expect(page.get_by_role('button',name='Télécharger Identité-Squared.png',exact=True)).to_be_visible()
                    capture(page,f'media-{theme}-{width}')
                    page.get_by_role('button',name='Ajouter au message').click()
                    expect(page.get_by_role('dialog',name='Ajouter au message')).to_be_visible()
                    capture(page,f'tools-{theme}-{width}')
                    page.keyboard.press('Escape')
                    expect(page.get_by_role('button',name='Ajouter au message')).to_be_focused()
            assert not errors,errors
        finally:
            context.close();browser.close()

if __name__=='__main__':
    try:
        run();print('PASS: Messenger renders at 320, 390, 768 and 1440 px in light/dark; real PDF and image previews; tool sheet focus and no overflow.')
    finally:
        f.server.shutdown()
