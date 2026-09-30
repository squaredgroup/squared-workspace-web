import { h, icon, avatarDataURL } from "./ui.js";

export function businessUnitVisual(unit,{size=56}={}){
  const data=unit?.data||unit?.payload||unit||{};
  const source=avatarDataURL(data.visualImageData||data.visual_image_data||"");
  const color=/^#[0-9a-f]{6}$/i.test(data.visualColorHex||"")?data.visualColorHex:null;
  const node=h("span",{class:"sq-unit-visual",style:{width:`${size}px`,height:`${size}px`,...(color?{"--sq-unit-color":color}:{})}});
  if(source){
    const fallback=icon("businessUnits",Math.round(size*.4));fallback.hidden=true;
    const image=h("img",{src:source,alt:`Image du pôle ${data.name||unit.title||""}`,width:size,height:size,decoding:"async",loading:"lazy"});
    image.addEventListener("error",()=>{image.remove();fallback.hidden=false;},{once:true});node.append(image,fallback);
  }else{
    const glyph=String(data.visualIconName||"").replace(/[^A-Za-z]/g,"");
    const supported=["Company","Folder","Bag","Chart","Users","Globe","Star","Sparkles","Grid","Wallet","Cloud","Shield"];
    node.append(icon(supported.includes(glyph)?glyph:"businessUnits",Math.round(size*.4)));
  }
  return node;
}
