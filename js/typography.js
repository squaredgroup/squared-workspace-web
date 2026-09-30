export function spaceGroteskFaces(){
  return [[300,"light"],[400,"regular"],[500,"medium"],[600,"semibold"],[700,"bold"]].map(([weight,name])=>`@font-face{font-family:'Space Grotesk';font-style:normal;font-weight:${weight};font-display:swap;src:url('${location.origin}/assets/fonts/space-grotesk-${name}.woff') format('woff')}`).join("");
}

export function withWorkspaceTypography(html){
  const doc=new DOMParser().parseFromString(String(html||""),"text/html");
  for(const node of doc.querySelectorAll("*"))node.style?.setProperty("font-family","Space Grotesk","important");
  const style=doc.createElement("style");
  style.textContent=spaceGroteskFaces()+"*,*::before,*::after{font-family:'Space Grotesk'!important}";
  doc.head.append(style);
  return new XMLSerializer().serializeToString(doc);
}
