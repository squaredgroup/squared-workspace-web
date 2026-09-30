import { state } from "../store.js";
import { h, button, modal, input, select, icon, profileAvatar, emptyState, pretty, statusText } from "../ui.js";
import { canAccessSection } from "../config.js";
import { openRecord } from "../focus-records.js";
import { businessUnitVisual } from "../business-unit-visual.js";
import { viewContext } from "../focus-state.js";

const kinds={holding:"Groupe",businessUnit:"Pôle",division:"Division",department:"Département",team:"Équipe",subsidiary:"Filiale",brand:"Marque",legalEntity:"Entité juridique",company:"Entreprise"};
const member=id=>(state.workspace?.team||[]).find(value=>(value.id||value.memberId)===id);
const memberName=value=>`${value?.firstName||""} ${value?.lastName||""}`.trim()||value?.name||value?.email||"Non renseigné";
export function businessUnitList({items,writable,reload,onEdit}){
  const context=viewContext("business-unit-directory",{query:"",status:"all"});
  const search=input(context.query,{type:"search",placeholder:"Rechercher un pôle ou une entité…","aria-label":"Rechercher un pôle"});
  search.setAttribute("aria-label","Rechercher un pôle");
  const filter=select(context.status,[{value:"all",label:"Tous les statuts"},...[...new Set(items.map(item=>item.status).filter(Boolean))].map(value=>({value,label:statusText(value)}))]);filter.setAttribute("aria-label","Filtrer les pôles");
  const grid=h("div",{class:"sq-unit-grid"}),summary=h("p",{class:"sq-results-summary",role:"status"});
  const root=h("div",{class:"sq-unit-directory"},h("div",{class:"sq-directory-controls"},h("div",{class:"sq-board-search"},icon("search",17),search),filter,writable?button("Créer un pôle",{kind:"primary",iconName:"add",onClick:()=>onEdit(null)}):null),summary,grid);
  function inspect(unit){
    const data=unit.data||unit,lead=member(data.leadUserID),members=(data.memberIDs||[]).map(member).filter(Boolean);
    const identity=h("div",{class:"sq-unit-inspector-identity"},businessUnitVisual(unit,{size:88}),h("div",{},
      h("span",{class:"sq-unit-code",text:data.code||"Pôle"}),h("h3",{text:data.name||unit.title}),h("p",{text:kinds[data.kind]||pretty(data.kind||"Pôle")})));
    const stats=h("div",{class:"sq-unit-detail-stats"},...[["Membres",(data.memberIDs||[]).length],["Projets",(data.projectIDs||[]).length],["Objectifs",(data.objectiveIDs||[]).length]].map(([title,count])=>h("div",{},h("strong",{text:String(count)}),h("span",{text:title}))));
    const leader=h("section",{},h("h4",{text:"Responsable"}),lead?h("div",{class:"sq-unit-person"},profileAvatar(lead,{size:32,ariaHidden:true}),h("span",{text:memberName(lead)})):h("p",{class:"muted",text:"Non attribué"}));
    const memberList=members.length?h("section",{},h("h4",{text:"Membres"}),h("div",{class:"sq-unit-members"},...members.map(value=>h("div",{class:"sq-unit-person"},profileAvatar(value,{size:28,ariaHidden:true}),h("span",{text:memberName(value)}))))):null;
    const content=h("div",{class:"sq-unit-inspector"},identity,h("p",{class:"sq-unit-description",text:data.summary||data.description||"Aucune description renseignée."}),stats,leader,memberList);
    const projects=canAccessSection("projects",state.user)?(state.workspace?.projects||[]).filter(item=>(data.projectIDs||[]).includes(item.id)):[];
    let dialog;
    if(projects.length)content.append(h("section",{},h("h4",{text:"Projets du pôle"}),h("div",{class:"sq-unit-projects"},...projects.map(item=>button(item.title||item.data?.title||"Projet",{kind:"ghost",iconName:"folder",onClick:()=>{dialog.close();openRecord("projects",item.id);}})))));
    dialog=modal({title:data.name||unit.title||"Pôle",className:"sq-unit-modal",content,actions:writable?[{label:"Modifier le pôle",icon:"edit",onClick:close=>{close();onEdit(unit);}}]:[]});
  }
  function draw(){
    const query=context.query.toLocaleLowerCase("fr"),visible=items.filter(unit=>{const data=unit.data||unit;return(context.status==="all"||unit.status===context.status)&&`${data.name||unit.title||""} ${data.code||""} ${data.summary||""}`.toLocaleLowerCase("fr").includes(query);});
    summary.textContent=`${visible.length} pôle${visible.length>1?"s":""} et entité${visible.length>1?"s":""}`;
    grid.replaceChildren(...(visible.length?visible.map(unit=>{
      const data=unit.data||unit,lead=member(data.leadUserID);
      return h("button",{type:"button",class:"sq-unit-card","aria-label":`Ouvrir le pôle ${data.name||unit.title}`,onClick:()=>inspect(unit)},h("span",{class:"sq-unit-card-top"},businessUnitVisual(unit,{size:58}),h("span",{class:"sq-unit-code",text:data.code||statusText(unit.status)})),h("strong",{text:data.name||unit.title}),h("span",{class:"sq-unit-kind",text:kinds[data.kind]||pretty(data.kind||"Pôle")}),h("p",{text:data.summary||data.description||"Description à renseigner"}),h("span",{class:"sq-unit-card-bottom"},h("span",{text:`${(data.memberIDs||[]).length} membre${(data.memberIDs||[]).length>1?"s":""} · ${(data.projectIDs||[]).length} projet${(data.projectIDs||[]).length>1?"s":""}`}),lead?profileAvatar(lead,{size:27,label:`Responsable : ${memberName(lead)}`}):icon("external",15)));
    }):[emptyState("Aucun pôle à afficher",query?"Essayez un autre nom ou un autre filtre.":"Les pôles accessibles apparaîtront ici.","businessUnits")]));
  }
  search.addEventListener("input",()=>{context.query=search.value;draw();});filter.addEventListener("change",()=>{context.status=filter.value;draw();});draw();return root;
}
