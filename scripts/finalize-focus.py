from pathlib import Path
import hashlib
checks={'js/modules/data.js':'fe1fb26ae9228d317e998eb56b67b6e09b690c06b25391d7477823ca2b128885','js/modules/messages.js':'00b35a577d23b615603871aadd00268883c57a0b4ed8a211ce0fdaf81c4bddc7','tests/mobile_flows.py':'25e657cb103fbc137c39c8036a6ad10f0a09914ba84d02dbc1c2c72268402886'}
for file,digest in checks.items():assert hashlib.sha256(Path(file).read_bytes()).hexdigest()==digest,file
def edit(file,old,new):
 p=Path(file);s=p.read_text();assert old in s,(file,old);p.write_text(s.replace(old,new))
edit('js/modules/data.js','panel=card(domainLabels[core]||pretty(core),','panel=card("Liste · "+(domainLabels[core]||pretty(core)),')
edit('js/modules/messages.js','const drafts = new Map(); // Memory only: never cache private messages in localStorage or the service worker.','// Draft content is held exclusively by the bounded, per-session draft store.')
edit('js/modules/messages.js','drafts.clear(); volatileDrafts.clear();','volatileDrafts.clear();')
edit('js/modules/messages.js','if(state.route.item)selectedId=state.route.item;','selectedId=state.route.item||null;')
edit('js/modules/messages.js','const draft = drafts.get(draftKey(conversation.id)) || getDraft(conversation.id);','const draft = getDraft(conversation.id);')
edit('js/modules/messages.js','textarea(drafts.get(key) || getDraft(conversation.id) || "",','textarea(getDraft(conversation.id) || "",')
edit('js/modules/messages.js','      if (box.value) drafts.set(key, box.value); else drafts.delete(key);\n','')
edit('js/modules/messages.js','drafts.delete(key); volatileDrafts.delete(key);','volatileDrafts.delete(key);')
edit('js/modules/messages.js','try { await reload(); } catch (error) { toast(`Conversation créée','try { await loadWorkspace(); setRoute("messages","",id); } catch (error) { toast(`Conversation créée')
edit('tests/mobile_flows.py',"go(page,'tasks');go(page,'messages');expect(box).to_have_value('Brouillon privé')","go(page,'tasks');go(page,'messages');page.locator('.conversation-item').filter(has_text='Direction produit').click();expect(box).to_have_value('Brouillon privé')")
edit('tests/mobile_flows.py',"go(page,'tasks');go(page,'messages');expect(box).to_have_value('Brouillon hors ligne')","go(page,'tasks');go(page,'messages');page.locator('.conversation-item').filter(has_text='Direction produit').click();expect(box).to_have_value('Brouillon hors ligne')")
