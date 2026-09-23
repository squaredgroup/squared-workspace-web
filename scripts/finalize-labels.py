from pathlib import Path
import hashlib
p=Path('js/ui.js')
assert hashlib.sha256(p.read_bytes()).hexdigest()=='034e62a359be299bd080a64c5ef929ff0d1ba7579bb217c628ddeea9fa624195'
s=p.read_text()
old='export function field(label,control,hint=""){const hintId=hint?nextId("field-hint"):"";if(hintId)control.setAttribute("aria-describedby",hintId);return h("label",{class:`field ${control.required?"required":""}`.trim()},h("span",{text:label}),control,hint?h("small",{id:hintId,class:"muted",text:hint}):null)}'
new='export function field(label,control,hint=""){const controlId=control.id||nextId("field"),hintId=hint?nextId("field-hint"):"";control.id=controlId;control.setAttribute("aria-label",label);if(hintId)control.setAttribute("aria-describedby",hintId);return h("label",{for:controlId,class:`field ${control.required?"required":""}`.trim()},h("span",{text:label}),control,hint?h("small",{id:hintId,class:"muted",text:hint}):null)}'
assert old in s
p.write_text(s.replace(old,new))
