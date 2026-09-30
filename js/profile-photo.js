import { state } from "./store.js";
import { updateMe } from "./api.js";
import { h, button, modal, field, toast, errorMessage, profileAvatar, confirmAction } from "./ui.js";

function profileBody(user,avatarData){
  return {email:user.email,firstName:user.firstName||user.first_name||"",lastName:user.lastName||user.last_name||"",title:user.title||"",company:user.company||"",phone:user.phone||"",phoneCountryCode:user.phoneCountryCode||user.phone_country_code||"FR",avatarData};
}
export function profilePhotoControl(user){
  const avatar=h("div",{class:"sq-photo-avatar"},profileAvatar(user,{className:"profile-avatar-large",size:88}));
  const status=h("p",{class:"sq-photo-status",role:"status","aria-live":"polite",text:"Votre photo est partagée avec l’app et les autres membres."});
  const picker=h("input",{type:"file",accept:"image/jpeg,image/png,image/webp",hidden:true,"aria-label":"Choisir une photo de profil"});
  const writable=user.permissions?.includes("editOwnProfile");
  const change=button("Changer la photo",{iconName:"image",onClick:()=>picker.click(),disabled:!writable});
  const remove=button("Retirer",{kind:"ghost",onClick:()=>confirmAction({title:"Retirer votre photo ?",message:"Vos initiales remplaceront votre photo sur le web et dans l’app.",confirmLabel:"Retirer la photo",onConfirm:async()=>{
    try{if(state.user?.id!==user.id)return;await updateMe(profileBody(state.user,null));refresh();toast("Photo retirée");}catch(error){status.textContent=errorMessage(error);}
  }})});
  function refresh(){avatar.replaceChildren(profileAvatar(state.user,{className:"profile-avatar-large",size:88}));remove.hidden=!Boolean(state.user?.avatarData||state.user?.avatar_data);status.textContent="Photo synchronisée avec votre compte.";}
  remove.hidden=!writable||!Boolean(user.avatarData||user.avatar_data);
  picker.addEventListener("change",async()=>{
    const file=picker.files?.[0];picker.value="";if(!file)return;
    if(file.size>10*1024*1024){status.textContent="Choisissez une image de 10 Mo maximum.";return;}
    change.disabled=true;
    try{await photoEditor(file,user.id,refresh);}catch(error){status.textContent=errorMessage(error);}finally{change.disabled=!writable;}
  });
  return h("div",{class:"sq-profile-photo"},avatar,h("div",{class:"sq-photo-info"},h("strong",{text:`${user.firstName||user.first_name||""} ${user.lastName||user.last_name||""}`.trim()||user.email}),h("span",{text:[user.title,user.company].filter(Boolean).join(" · ")||user.role||"Membre"}),h("div",{class:"button-row"},change,remove),status,h("small",{text:"JPG, PNG ou WebP · 10 Mo maximum"})),picker);
}
async function photoEditor(file,owner,refresh){
  const url=URL.createObjectURL(file),image=new Image();image.src=url;
  try{await image.decode();}catch{URL.revokeObjectURL(url);throw new Error("Cette image ne peut pas être ouverte. Choisissez un fichier JPG, PNG ou WebP.");}
  if(image.naturalWidth*image.naturalHeight>64_000_000){URL.revokeObjectURL(url);throw new Error("Cette image est trop grande. Exportez une version plus petite.");}
  const size=280,canvas=h("canvas",{width:size,height:size,"aria-label":"Aperçu du recadrage de la photo",role:"img"});
  const zoom=h("input",{type:"range",min:1,max:3,step:.01,value:1,"aria-label":"Zoom de la photo"});
  const error=h("p",{class:"sq-inline-error",role:"alert",hidden:true});
  let factor=1,x=0,y=0,busy=false,drag=null,dialog;
  const base=Math.max(size/image.naturalWidth,size/image.naturalHeight);
  function draw(target=canvas,outputSize=size){
    const scale=base*factor,limitX=(image.naturalWidth*scale-size)/2,limitY=(image.naturalHeight*scale-size)/2;
    x=Math.max(-limitX,Math.min(limitX,x));y=Math.max(-limitY,Math.min(limitY,y));
    const context=target.getContext("2d"),ratio=outputSize/size;
    context.fillStyle="#ffffff";context.fillRect(0,0,outputSize,outputSize);
    context.drawImage(image,(size/2-image.naturalWidth*scale/2+x)*ratio,(size/2-image.naturalHeight*scale/2+y)*ratio,image.naturalWidth*scale*ratio,image.naturalHeight*scale*ratio);
  }
  zoom.addEventListener("input",()=>{factor=Number(zoom.value);draw();});
  canvas.addEventListener("pointerdown",event=>{if(busy)return;drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,offsetX:x,offsetY:y};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener("pointermove",event=>{if(!drag||drag.pointer!==event.pointerId)return;const ratio=size/canvas.getBoundingClientRect().width;x=drag.offsetX+(event.clientX-drag.x)*ratio;y=drag.offsetY+(event.clientY-drag.y)*ratio;draw();});
  for(const type of ["pointerup","pointercancel"])canvas.addEventListener(type,()=>{drag=null;});
  const shift=h("div",{class:"sq-photo-position","aria-label":"Déplacer la photo"},...[["←",-14,0,"Déplacer vers la gauche"],["↑",0,-14,"Déplacer vers le haut"],["↓",0,14,"Déplacer vers le bas"],["→",14,0,"Déplacer vers la droite"]].map(([label,dx,dy,name])=>button(label,{ariaLabel:name,onClick:()=>{x+=dx;y+=dy;draw();}})));
  dialog=modal({title:"Votre photo de profil",className:"sq-photo-editor",content:h("div",{class:"sq-photo-editor-content"},h("p",{text:"Déplacez la photo pour choisir le cadrage."}),h("div",{class:"sq-photo-crop"},canvas),field("Zoom",zoom),shift,error),beforeClose:()=>!busy,onClose:()=>URL.revokeObjectURL(url),actions:[{label:"Enregistrer la photo",kind:"primary",icon:"check",onClick:async close=>{
    if(busy||state.user?.id!==owner)return;
    busy=true;error.hidden=true;dialog.panel.setAttribute("aria-busy","true");dialog.panel.querySelectorAll("button,input").forEach(control=>control.disabled=true);
    try{
      const output=document.createElement("canvas");output.width=512;output.height=512;draw(output,512);
      const avatarData=output.toDataURL("image/jpeg",.88).split(",")[1];
      await updateMe(profileBody(state.user,avatarData));refresh();busy=false;close();toast("Photo de profil enregistrée");
    }catch(cause){busy=false;error.textContent=errorMessage(cause);error.hidden=false;dialog.panel.querySelectorAll("button,input").forEach(control=>control.disabled=false);}
    finally{dialog.panel.removeAttribute("aria-busy");}
  }}]});draw();
}
