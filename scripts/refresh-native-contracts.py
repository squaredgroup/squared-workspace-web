"""Extract API schemas from native sources without importing or starting the backend."""
from pathlib import Path
import argparse,base64,hashlib,json,subprocess,tarfile,tempfile
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--native',default='/Users/squaredgroup/Desktop/Squared Workspace')
parser.add_argument('--plugin',default='/Users/squaredgroup/plugins/squared-workspace')
parser.add_argument('--work-dir',default=None)
parser.add_argument('--write',action='store_true')
args=parser.parse_args();native=Path(args.native);plugin=Path(args.plugin);target=root/'js/native/workflow-contracts.json';old=json.loads(target.read_text())
def execute(work):
 compiler=next((path for path in [plugin/'node_modules/typescript/lib/typescript.js',native/'Backend/node_modules/typescript/lib/typescript.js'] if path.exists()),None)
 if compiler is None:
  cache=Path.home()/'.npm/_cacache';key='make-fetch-happen:request-cache:https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz';digest=hashlib.sha256(key.encode()).hexdigest();index=cache/'index-v5'/digest[:2]/digest[2:4]/digest[4:]
  if not index.exists():raise SystemExit('TypeScript avec API d’analyse absent des dépendances et du cache. Aucune installation automatique.')
  entries=[json.loads(line.split('\t',1)[1]) for line in index.read_text().splitlines() if '\t' in line];entry=next(row for row in reversed(entries) if row.get('key')==key and row.get('integrity'));algorithm,encoded=entry['integrity'].split('-',1);expected=base64.b64decode(encoded);hexdigest=expected.hex();archive=cache/'content-v2'/algorithm/hexdigest[:2]/hexdigest[2:4]/hexdigest[4:];data=archive.read_bytes()
  if hashlib.new(algorithm,data).digest()!=expected:raise SystemExit('Empreinte du cache npm invalide.')
  packed=work/'typescript.tgz';packed.write_bytes(data);compiler=work/'typescript.cjs'
  with tarfile.open(packed) as bundle:
   member=bundle.extractfile('package/lib/typescript.js')
   if member is None:raise SystemExit('Module d’analyse TypeScript absent du paquet en cache.')
   compiler.write_bytes(member.read())
 source=(plugin/'scripts/extract-contracts.mjs').read_text().replace("import ts from 'typescript';",'import ts from '+json.dumps(str(compiler.resolve()))+';').replace("const out=path.resolve(new URL('../mcp/',import.meta.url).pathname);",'const out='+json.dumps(str(work))+';')
 extractor=work/'extract-contracts.mjs';extractor.write_text(source);subprocess.run(['node',str(extractor),'--backend',str(native/'Backend/src')],check=True)
 source=(plugin/'scripts/catalog-families.mjs').read_text().replace("const dir=new URL('../mcp/',import.meta.url).pathname;",'const dir='+json.dumps(str(work))+';').replace("JSON.parse(fs.readFileSync(new URL('../.codex-plugin/plugin.json',import.meta.url),'utf8')).version","'web-source-contracts'")
 source=source.replace("const p=r.path,f=r.source.file;","const p=r.path,f=r.source.file;\n if(f==='server-trash-purge-routes.ts')return 'trash';").replace('const labels={',"const labels={trash:'Corbeille et conservation',")
 classifier=work/'catalog-families.mjs';classifier.write_text(source);subprocess.run(['node',str(classifier)],check=True)
 catalog=json.loads((work/'catalog.json').read_text());known={group['id'] for group in old['groups']}|{'trash'};unknown={op['group'] for op in catalog['operations']}-known
 if unknown:raise SystemExit('Configurer explicitement les droits des nouveaux groupes avant leur ajout : '+', '.join(sorted(unknown)))
 labels={group['group']:group['label'] for group in catalog['groups']};operations=[]
 previews={'/v1/workflows/trash/status','/v1/workflows/trash/purge/prepare','/v1/communications/library/preview','/v1/communications/library/archive-manifest'}
 for op in catalog['operations']:
  row={key:op[key] for key in ['method','path','params','query','body','readOnly','requiresRevision','humanSession','group','action','sensitive'] if key in op}
  if row['path'] in previews:row['readOnly']=True;row['sensitive']=False
  if row['path']=='/v1/workflows/trash/purge':row['sensitive']=True
  operations.append(row)
 groups=[{'id':key,'title':labels[key]} for key in dict.fromkeys(op['group'] for op in operations)];result={'groups':groups,'operations':operations};before={(op['method'],op['path']):op for op in old['operations']};after={(op['method'],op['path']):op for op in operations};summary={'operations':len(operations),'unresolvedSchemas':0,'added':[list(key) for key in after.keys()-before.keys()],'removed':[list(key) for key in before.keys()-after.keys()],'changedSchemas':[list(key) for key in before.keys()&after.keys() if any(before[key].get(part)!=after[key].get(part) for part in ['params','query','body'])]}
 if args.write:target.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
 print(json.dumps(summary,ensure_ascii=False,indent=2))
if args.work_dir:
 work=Path(args.work_dir).resolve();work.mkdir(parents=True,exist_ok=True);execute(work)
else:
 with tempfile.TemporaryDirectory(prefix='workspace-native-contracts-') as directory:execute(Path(directory))
