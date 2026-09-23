from pathlib import Path
p=Path('js/focus-records.js')
s=p.read_text()
old='h("span",{text:"Filtres et tri"})),filterBody='
new='h("span",{text:"Filtres et tri"}))),filterBody='
assert old in s
p.write_text(s.replace(old,new))
