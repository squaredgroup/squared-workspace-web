import { request } from "../api.js";
import { h,pageHeader,card,row,button,modal,toast,errorMessage,emptyState,statCard,pretty,advancedEditor } from "../ui.js";

function valueRow(label,value){if(value==null||value===""||(Array.isArray(value)&&!value.length))return null;return h("div",{class:"detail-row"},h("span",{text:label}),h("strong",{text:Array.isArray(value)?value.join(", "):String(value)}))}
function personDetail(person){
  const fields=[
    ["E-mail",person.email],["Fonction",person.title],["Entreprise",person.company],["Statut",person.status],["Relation",person.relationshipLabel||person.relationshipCode],["Téléphone",person.phone],["Localisation",person.location]
  ].map(([label,value])=>valueRow(label,value)).filter(Boolean);
  return h("div",{class:"stack"},h("div",{class:"detail-list"},...fields),advancedEditor("Données complémentaires",h("pre",{class:"json-view",text:JSON.stringify(person,null,2)})));
}
export async function renderPeople(){
  const root=h("div");root.append(pageHeader({eyebrow:"People",title:"People",subtitle:"Profils, onboarding et suivi des personnes visibles dans votre périmètre."}));
  try{
    const [{data},{data:overview}]=await Promise.all([request("/v1/people"),request("/v1/people/overview")]),people=data.people||[];
    root.append(h("div",{class:"grid stats"},
      statCard("Personnes actives",overview.activePeople||0,"Profils actifs","users"),
      statCard("Onboarding",overview.onboardingPeople||0,"Parcours en cours","trend"),
      statCard("Évaluations",overview.openAssessments||0,"Évaluations ouvertes","document"),
      statCard("À revoir",overview.profilesToReview||0,"Profils à actualiser","warning")
    ));
    const host=h("div",{class:"list"});
    for(const person of people)host.append(row({
      title:`${person.firstName||""} ${person.lastName||""}`.trim()||person.email,
      subtitle:[person.title,person.email].filter(Boolean).join(" · "),
      status:person.status,
      meta:person.relationshipLabel||person.relationshipCode||"",
      actions:[button("Détail",{small:true,onClick:async()=>{try{const detail=(await request(`/v1/people/${person.id}`)).data;modal({title:`${person.firstName||""} ${person.lastName||""}`.trim()||person.email,content:personDetail(detail),wide:true})}catch(error){toast(errorMessage(error),"error")}}})]
    }));
    root.append(card("Personnes",`${people.length} profil${people.length>1?"s":""} visible${people.length>1?"s":""}.`,people.length?host:emptyState("Aucun profil","Aucune personne n’est visible dans ce périmètre."),{iconName:"users",className:"section-gap"}));
  }catch(error){root.append(emptyState("People indisponible",errorMessage(error),"warning"))}
  return root;
}
