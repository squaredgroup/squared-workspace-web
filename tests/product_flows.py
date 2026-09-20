"""Product-level browser coverage with a synthetic Squared Workspace API.

The suite exercises navigation, permissions, notifications, Messages, E-mails,
settings and responsive rendering without using a real account or mutating production.
"""
import functools
import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


PERMISSIONS = [
    "readWorkspace", "manageProjects", "publishProjects", "manageCMS", "manageMissions",
    "manageTasks", "decideValidations", "manageDeliverables", "manageContracts",
    "manageDocuments", "sendMessages", "manageClients", "manageTeam", "manageOrganization",
    "editOwnProfile", "viewFinance", "manageFinance", "approveExpenses", "manageSales",
    "manageSuppliers", "manageBusinessUnits", "viewHR", "manageHR", "manageTimesheets",
    "manageObjectives", "manageRisks", "manageCompliance", "viewReports", "manageAutomations",
    "manageSupport", "manageMarketing", "manageAssets", "viewLegal", "manageLegal",
    "viewPeople", "managePeople", "reviewPeople", "configurePeople", "manageOwnership",
    "manageAccess", "createSupportRequests", "viewMail", "sendMail", "organizeMail",
    "deleteMail", "manageMailSettings", "manageMail",
]
USER = {
    "id": "00000000-0000-4000-a000-000000000001", "firstName": "Jordan",
    "lastName": "Alévêque", "email": "product-test@example.invalid", "role": "OWNER",
    "permissions": PERMISSIONS,
}
SESSION = {"accessToken": "fixture-access", "refreshToken": "fixture-refresh-token-long-enough", "sessionId": "fixture-session", "user": USER}
WORKSPACE = {
    "projects": [{"id": "project-1", "version": 1, "title": "Workspace Web V4", "status": "active", "updatedAt": "2026-09-20T08:00:00Z"}],
    "tasks": [{"id": "task-1", "version": 1, "title": "Valider la refonte", "status": "pending", "dueAt": "2026-09-21T12:00:00Z"}],
    "missions": [], "validations": [], "deliverables": [],
    "notifications": [{"id": "notification-1", "version": 1, "title": "Décision requise", "body": "Validez la version Web V4.", "kind": "Produit", "isRead": False, "createdAt": "2026-09-20T09:00:00Z"}],
    "conversations": [{"id": "conversation-1", "name": "Direction produit", "participantIDs": [USER["id"], "member-2"], "unread": 1, "messages": [{"id": "message-1", "authorId": "member-2", "authorName": "Équipe Design", "body": "La revue est prête.", "createdAt": "2026-09-20T08:30:00Z"}]}],
    "team": [{"id": USER["id"], "firstName": "Jordan", "lastName": "Alévêque", "email": USER["email"], "role": "OWNER", "isActive": True}, {"id": "member-2", "firstName": "Équipe", "lastName": "Design", "email": "design@example.invalid", "role": "COLLABORATOR", "isActive": True}],
}
MAIL = {"id": "mail-1", "subject": "Revue Workspace V4", "fromName": "Squared Design", "fromEmail": "design@example.invalid", "preview": "La revue est disponible.", "body": "La revue est disponible.", "isRead": False, "receivedAt": "2026-09-20T08:45:00Z"}
SETTINGS = {"appearanceMode": "dark", "dashboardDensity": "balanced", "contentWidth": "balanced", "language": "fr-FR", "timezone": "Europe/Paris", "compactSidebar": False, "reducedMotion": False}
requests = []
visual_dir = Path(os.environ["WORKSPACE_VISUAL_DIR"]) if os.environ.get("WORKSPACE_VISUAL_DIR") else None
if visual_dir:
    visual_dir.mkdir(parents=True, exist_ok=True)

server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f"http://127.0.0.1:{server.server_port}"


def respond(route, payload, status=200, headers=None):
    route.fulfill(status=status, content_type="application/json", headers={"Access-Control-Allow-Origin": origin, "ETag": '"fixture-v4"', **(headers or {})}, body=json.dumps(payload))


def fixture(route):
    global SETTINGS
    request = route.request
    path = urlsplit(request.url).path
    method = request.method
    body = request.post_data_json if request.post_data else None
    requests.append((method, path, body))
    if path in ("/v1/auth/password", "/v1/auth/refresh"):
        return respond(route, SESSION)
    if path == "/v1/me":
        return respond(route, USER)
    if path == "/v1/workspace":
        return respond(route, WORKSPACE)
    if path == "/v1/domain-data/catalog":
        return respond(route, {"kinds": []})
    if path == "/v1/me/security":
        return respond(route, {"multiFactorEnabled": True, "loginAlertsEnabled": True})
    if path == "/v1/settings":
        if method == "PUT":
            SETTINGS = body
        return respond(route, SETTINGS)
    if path == "/v1/sessions":
        return respond(route, [{"id": "fixture-session", "device_name": "Navigateur Web", "platform": "Web", "last_seen_at": "2026-09-20T09:00:00Z"}])
    if path == "/v1/people":
        return respond(route, {"people": []})
    if path == "/v1/people/overview":
        return respond(route, {"activePeople": 0, "onboardingPeople": 0, "openAssessments": 0, "profilesToReview": 0})
    if path == "/v1/training/catalog":
        return respond(route, {"program": {"title": "Squared BUILD"}, "stats": {}, "lessons": []})
    if path == "/v1/admin/security-overview":
        return respond(route, {"healthy": True, "services": []})
    if path in ("/v1/invitations", "/v1/custom-roles"):
        return respond(route, [])
    if path == "/v1/mailbox/newsletters/subscribers":
        return respond(route, {"subscribers": [], "counts": {"active": 0}})
    if path == "/v1/cms/collections":
        return respond(route, {"collections": []})
    if path == "/v1/mailbox":
        return respond(route, {"messages": [MAIL]})
    if path == "/v1/mailbox/mail-1/thread":
        return respond(route, {"messages": [MAIL]})
    if path == "/v1/mailbox/mail-1" and method == "PATCH":
        MAIL.update(body or {})
        return respond(route, MAIL)
    if path == "/v1/mailbox/send" and method == "POST":
        return respond(route, {"id": "sent-mail"}, 201)
    if path == "/v1/mailbox/templates":
        return respond(route, {"templates": []})
    if path == "/v1/mailbox/style":
        return respond(route, {})
    if path == "/v1/notifications":
        return respond(route, WORKSPACE["notifications"])
    if path == "/v1/notifications/notification-1" and method == "PATCH":
        WORKSPACE["notifications"][0].update(body or {})
        return respond(route, WORKSPACE["notifications"][0])
    if path == "/v1/conversations/conversation-1/read":
        return respond(route, {"ok": True})
    if path == "/v1/conversations/conversation-1/messages" and method == "POST":
        message = body["message"]
        message["authorId"] = USER["id"]
        WORKSPACE["conversations"][0]["messages"].append(message)
        return respond(route, message, 201)
    if path == "/health":
        return respond(route, {"status": "ok"})
    if method == "GET" and path.startswith("/v1/domain-data/"):
        return respond(route, {"items": [], "nextCursor": None})
    if method == "GET" and path.startswith("/v1/projects/") and path.endswith("/publication"):
        return respond(route, {"state": "draft"})
    core = {"projects", "missions", "tasks", "validations", "deliverables", "contracts", "documents", "resources", "clients", "events", "activities"}
    if method == "GET" and path.removeprefix("/v1/") in core:
        return respond(route, WORKSPACE.get(path.removeprefix("/v1/"), []))
    return respond(route, {})


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, service_workers="block")
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin) else route.abort())
    context.route("https://workspace.squaredgroup.studio/**", fixture)
    context.route_web_socket("wss://workspace.squaredgroup.studio/**", lambda websocket: websocket.on_message(lambda message: None))
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(origin)
    page.get_by_label("Adresse e-mail", exact=True).fill(USER["email"])
    page.get_by_label("Mot de passe", exact=True).fill("FixturePassword123")
    page.get_by_role("button", name="Se connecter", exact=True).click()
    expect(page.get_by_role("heading", name="Tableau de bord", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Notifications, 1 non lue", exact=True)).to_be_visible()
    if visual_dir:
        page.wait_for_timeout(400)
        page.screenshot(path=str(visual_dir / "dashboard-desktop.png"), full_page=True)

    sections = page.evaluate("""async()=>{const c=await import('/js/config.js');return Object.entries(c.SECTIONS).filter(([,s])=>!s.adminOnly||true).map(([key,s])=>({key,title:s.title,subpage:(s.subpages||[])[0]?.id||''}))}""")
    for section in sections:
        page.evaluate("""async value=>{const s=await import('/js/store.js');s.setRoute(value.key,value.subpage)}""", section)
        expect(page.locator("#workspace-main")).to_have_attribute("aria-busy", "false")
        expect(page.get_by_role("heading", name=section["title"], exact=True).first).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"), section["key"]

    page.evaluate("""async()=>{const s=await import('/js/store.js');s.setRoute('notifications')}""")
    expect(page.get_by_text("Décision requise", exact=True)).to_be_visible()
    if visual_dir:
        page.wait_for_timeout(400)
        page.screenshot(path=str(visual_dir / "notifications-desktop.png"), full_page=True)
    page.get_by_role("button", name="Marquer comme lue", exact=True).click()
    expect(page.get_by_role("button", name="Notifications", exact=True)).to_be_visible()

    page.evaluate("""async()=>{const s=await import('/js/store.js');s.setRoute('messages')}""")
    page.get_by_role("button", name="Direction produit", exact=False).click()
    composer = page.get_by_placeholder("Écrire un message…")
    composer.fill("Validation fonctionnelle terminée.")
    page.get_by_role("button", name="Envoyer", exact=True).click()
    expect(page.get_by_role("log", name="Messages de Direction produit").get_by_text("Validation fonctionnelle terminée.", exact=True)).to_be_visible()

    page.evaluate("""async()=>{const s=await import('/js/store.js');s.setRoute('mailbox','mailbox')}""")
    expect(page.get_by_role("heading", name="E-mails", exact=True)).to_be_visible()
    page.get_by_role("button", name="Revue Workspace V4", exact=False).click()
    expect(page.get_by_text("La revue est disponible.", exact=True).last).to_be_visible()

    page.evaluate("""async()=>{const s=await import('/js/store.js');s.setRoute('settings')}""")
    expect(page.get_by_role("heading", name="Paramètres", exact=True)).to_be_visible()
    page.locator(".field", has_text="Thème").locator("select").select_option("system")
    page.get_by_role("button", name="Enregistrer les paramètres", exact=True).click()
    expect(page.get_by_text("Paramètres enregistrés", exact=True)).to_be_visible()
    assert any(method == "PUT" and path == "/v1/settings" and body.get("appearanceMode") == "system" for method, path, body in requests if body)

    assert not errors, errors
    context.close()

    mobile = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    mobile.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin) else route.abort())
    mobile.route("https://workspace.squaredgroup.studio/**", fixture)
    mobile.route_web_socket("wss://workspace.squaredgroup.studio/**", lambda websocket: websocket.on_message(lambda message: None))
    page = mobile.new_page()
    page.goto(origin)
    page.get_by_label("Adresse e-mail", exact=True).fill(USER["email"])
    page.get_by_label("Mot de passe", exact=True).fill("FixturePassword123")
    page.get_by_role("button", name="Se connecter", exact=True).click()
    expect(page.get_by_role("heading", name="Tableau de bord", exact=True)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    expect(page.locator(".mobile-tabs")).to_be_visible()
    if visual_dir:
        page.wait_for_timeout(400)
        page.screenshot(path=str(visual_dir / "dashboard-mobile.png"), full_page=True)
    mobile.close()
    browser.close()

server.shutdown()
print(f"PASS product flows: {len(sections)} sections, notifications, Messages, E-mails, settings and responsive")
