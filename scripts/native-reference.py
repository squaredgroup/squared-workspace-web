"""Source-only native change inventory. Does not launch, build or test the app."""
from pathlib import Path
import argparse, hashlib, json, subprocess, datetime
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--native',default='/Users/squaredgroup/Desktop/Squared Workspace')
parser.add_argument('--record-reviewed',action='store_true',help='Record the reviewed source inventory; does not certify runtime or visual parity')
args=parser.parse_args();native=Path(args.native).resolve();manifest=root/'docs/native-parity.json'
if not (native/'SquaredWorkspace').is_dir():raise SystemExit('Source native introuvable : '+str(native))
files={}
for directory,extensions in [('SquaredWorkspace',{'.swift','.svg','.ttf','.strings'}),('SquaredWorkspaceMac',{'.swift','.plist'}),('Backend/src',{'.ts'})]:
 for path in sorted((native/directory).rglob('*')):
  if path.is_file() and path.suffix in extensions:files[str(path.relative_to(native))]=hashlib.sha256(path.read_bytes()).hexdigest()
previous=json.loads(manifest.read_text()) if manifest.exists() else {}
old=previous.get('nativeFiles',{})
changes={'added':[p for p in files if p not in old],'changed':[p for p in files if p in old and files[p]!=old[p]],'removed':[p for p in old if p not in files]}
if args.record_reviewed:
 data={**previous,'formatVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nativeRoot':str(native),'nativeCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=native,text=True).strip(),'includesUncommittedSources':True,'nativeFiles':files,'inventoryMeaning':'Empreintes des sources observées. La couverture du report figure séparément ; ces empreintes ne certifient ni les parcours exécutés ni le rendu visuel.'}
 manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'recordedFiles':len(files),'manifest':str(manifest)},ensure_ascii=False))
else:
 print(json.dumps({'baselineExists':manifest.exists(),'currentFiles':len(files),'counts':{key:len(values) for key,values in changes.items()},'changes':changes},ensure_ascii=False,indent=2))
