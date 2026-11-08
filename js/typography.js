export function spaceGroteskFaces(){
  return `@font-face{font-family:'Space Grotesk';font-style:normal;font-weight:300 700;font-display:swap;src:url('${location.origin}/assets/fonts/SpaceGrotesk-Variable.ttf') format('truetype')}`;
}

export function withWorkspaceTypography(html){
  const doc=new DOMParser().parseFromString(String(html||""),"text/html");
  for(const node of doc.querySelectorAll("*"))node.style?.setProperty("font-family","Space Grotesk","important");
  const style=doc.createElement("style");
  style.textContent=spaceGroteskFaces()+"*,*::before,*::after{font-family:'Space Grotesk'!important}";
  doc.head.append(style);
  return new XMLSerializer().serializeToString(doc);
}
