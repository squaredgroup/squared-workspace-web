"""Accessibility and interaction standards regression tests with synthetic API responses."""
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

USER={"id":"00000000-0000-4000-a000-000000000001","firstName":"Test","lastName":"Workspace","email":"standards@example.invalid","role":"CLIENT","permissions":["readWorkspace","editOwnProfile","sendMessages"]}
SESSION={"accessToken":"fixture-access-token","refreshToken":"fixture-refresh-token-long-enough","sessionId":"fixture-session","user":USER}
WORKSPACE={"projects":[{"id":"project-1","title":"Projet test confidentiel","status":"active"}],"tasks":[],"missions":[],"notifications":[],"conversations":[],"deliverables":[],"validations":[]}

server=ThreadingHTTPServer(("127.0.0.1",0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f"http://127.0.0.1:{server.server_port}"

def fixture(route):
    path=urlsplit(route.request.url).path
    if path in ("/v1/auth/password","/v1/auth/refresh"): payload=SESSION
    elif path=="/v1/me": payload=USER
    elif path=="/v1/workspace": payload=WORKSPACE
    elif path=="/v1/domain-data/catalog": payload={"kinds":[]}
    elif path=="/health": payload={"status":"ok"}
    elif path.startswith("/v1/projects"): payload=[]
    else: return route.fulfill(status=404,content_type="application/json",body=json.dumps({"error":"fixture_not_defined"}))
    route.fulfill(status=200,content_type="application/json",headers={"Access-Control-Allow-Origin":origin,"ETag":"\"fixture\""},body=json.dumps(payload))

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
    def make_context(width=1280,init=None):
        c=browser.new_context(viewport={"width":width,"height":900},service_workers="block")
        c.route("**/*",lambda r:r.continue_() if r.request.url.startswith(origin) else r.abort())
        c.route("https://workspace.squaredgroup.studio/**",fixture)
        c.route_web_socket("wss://workspace.squaredgroup.studio/**",lambda ws:ws.on_message(lambda message:None))
        c.route("https://fonts.googleapis.com/**",lambda r:r.abort())
        c.route("https://fonts.gstatic.com/**",lambda r:r.abort())
        if init: c.add_init_script(init)
        return c
    def login(page):
        page.goto(origin)
        expect(page.locator("#workspace-main")).to_have_count(1)
        page.get_by_label("Adresse e-mail",exact=True).fill(USER["email"])
        page.get_by_label("Mot de passe",exact=True).fill("FixturePassword123")
        page.get_by_role("button",name="Se connecter",exact=True).click()
        expect(page.get_by_role("heading",name="Tableau de bord",exact=True)).to_be_visible()

    # Authentication surfaces must follow the active theme on every public auth flow.
    c=make_context();page=c.new_page();page.goto(origin)
    expect(page.get_by_role("heading",name="Connexion",exact=True)).to_be_visible()
    dark_auth_rgb=page.locator(".auth-box").evaluate("""el=>getComputedStyle(el).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number)""")
    dark_input_rgb=page.get_by_label("Adresse e-mail",exact=True).evaluate("""el=>getComputedStyle(el).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number)""")
    assert sum(dark_auth_rgb)/3<90,dark_auth_rgb
    assert sum(dark_input_rgb)/3<90,dark_input_rgb
    c.close()

    light_init="""localStorage.setItem('sq-web-appearance',JSON.stringify({mode:'light',density:'balanced',contentWidth:'balanced'}));"""
    c=make_context(init=light_init);page=c.new_page();page.goto(origin)
    expect(page.get_by_role("heading",name="Connexion",exact=True)).to_be_visible()
    assert page.locator("html").get_attribute("data-theme")=="light"
    light_auth_rgb=page.locator(".auth-box").evaluate("""el=>getComputedStyle(el).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number)""")
    light_panel_rgb=page.locator(".auth-panel").evaluate("""el=>getComputedStyle(el).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number)""")
    light_input_rgb=page.get_by_label("Adresse e-mail",exact=True).evaluate("""el=>getComputedStyle(el).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number)""")
    assert sum(light_auth_rgb)/3>220,light_auth_rgb
    assert sum(light_panel_rgb)/3>220,light_panel_rgb
    assert sum(light_input_rgb)/3>220,light_input_rgb
    for route,title in [
        ("/#/activation?email=test%40example.invalid&token=fixture-auth-token-123456","Activer votre accès"),
        ("/#/reinitialisation?email=test%40example.invalid&token=fixture-reset-token-1234567890","Nouveau mot de passe"),
        ("/#/verification-email?email=test%40example.invalid&token=fixture-verify-token-1234567890","Vérifier votre adresse")
    ]:
        page.goto(origin+route)
        expect(page.get_by_role("heading",name=title,exact=True)).to_be_visible()
        auth_rgb=page.locator(".auth-box").evaluate("""el=>getComputedStyle(el).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number)""")
        assert sum(auth_rgb)/3>220,(title,auth_rgb)
    c.close()

    c=make_context();page=c.new_page();login(page)
    assert page.locator(".skip-link").get_attribute("href")=="#workspace-main"
    trigger=page.get_by_role("button",name="Recherche",exact=True)
    trigger.focus();page.keyboard.press("Control+K")
    dialog=page.get_by_role("dialog",name="Recherche Workspace")
    expect(dialog).to_be_visible()
    assert page.locator("#app").evaluate("el=>el.inert") is True
    combo=page.get_by_role("combobox",name="Rechercher dans Workspace")
    expect(combo).to_be_focused()
    page.keyboard.press("Shift+Tab")
    expect(page.get_by_role("button",name="Fermer")).to_be_focused()
    page.keyboard.press("Shift+Tab")
    expect(combo).to_be_focused()
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    expect(trigger).to_be_focused()
    assert page.locator("#app").evaluate("el=>el.inert") is False

    page.keyboard.press("Control+K")
    combo=page.get_by_role("combobox",name="Rechercher dans Workspace")
    combo.fill("Projets");page.keyboard.press("Enter")
    expect(page.get_by_role("heading",name="Projets",exact=True)).to_be_visible()
    assert page.locator("#workspace-main").evaluate("el=>el===document.activeElement") is True

    undersized=page.evaluate("""()=>[...document.querySelectorAll("button,summary,.link-button")].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.visibility!=="hidden"&&s.display!=="none"&&r.width>0&&r.height>0&&(r.width<24||r.height<24)}).map(el=>({text:(el.innerText||el.getAttribute("aria-label")||"").trim(),w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,className:el.className}))""")
    assert undersized==[],undersized

    # Theme system: every Iconly asset loads and adapts between dark/light.
    page.goto(origin+"/#/dashboard")
    expect(page.get_by_role("heading",name="Tableau de bord",exact=True)).to_be_visible()
    assert page.evaluate("""()=>[...document.querySelectorAll(".icon,.nav-icon,.group-chevron")].filter(img=>img.getClientRects().length&&(!img.complete||img.naturalWidth===0)).map(img=>img.getAttribute("src"))""")==[]
    assert page.locator(".stat-icon img").evaluate_all("els=>els.every(img=>img.complete&&img.naturalWidth>0)")
    assert page.locator('meta[name="theme-color"]').get_attribute("content")=="#0D0D0E"
    dark_filter=page.locator(".stat-icon img").first.evaluate("el=>getComputedStyle(el).filter")
    assert dark_filter!="none"
    active_nav_filter=page.locator(".nav-item.active .nav-icon").first.evaluate("el=>getComputedStyle(el).filter")
    assert "invert(1)" in active_nav_filter,active_nav_filter
    page.get_by_role("button",name="Changer de thème",exact=True).click()
    assert page.locator("html").get_attribute("data-theme")=="light"
    assert page.locator('meta[name="theme-color"]').get_attribute("content")=="#F4F5F1"
    assert page.locator(".stat-icon img").first.evaluate("el=>getComputedStyle(el).filter")=="none"
    light_active_nav_filter=page.locator(".nav-item.active .nav-icon").first.evaluate("el=>getComputedStyle(el).filter")
    assert "invert(1)" not in light_active_nav_filter,light_active_nav_filter
    topbar_rgb=page.locator(".topbar").evaluate("""el=>getComputedStyle(el).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number)""")
    assert sum(topbar_rgb)/3>180,topbar_rgb
    pulse_rgb=page.locator(".pulse-item").first.evaluate("""el=>getComputedStyle(el).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number)""")
    assert sum(pulse_rgb)/3>180,pulse_rgb
    c.close()

    c=make_context(390);page=c.new_page();login(page)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    assert page.locator(".mobile-tabs").is_visible()
    page.get_by_role("button",name="Ouvrir le menu",exact=True).click()
    assert page.locator(".workspace").evaluate("el=>el.classList.contains(\"sidebar-open\")")
    page.get_by_role("button",name="Fermer le menu",exact=True).click()
    assert not page.locator(".workspace").evaluate("el=>el.classList.contains(\"sidebar-open\")")
    c.close();browser.close()
server.shutdown()
print("PASS standards V3: landmarks, modal focus, keyboard command palette, target sizes and responsive shell")
