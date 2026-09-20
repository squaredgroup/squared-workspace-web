import { trainingCatalog,trainingLesson,setTrainingProgress } from "../api.js";
import { h,pageHeader,card,row,button,modal,emptyState,toast,errorMessage,statCard,advancedEditor,pretty } from "../ui.js";

function lessonContent(detail){
  const content=detail?.content;
  if(typeof content==="string"){
    const paragraphs=content.split(/\n{2,}/).map(value=>value.trim()).filter(Boolean);
    return h("article",{class:"lesson-content"},...paragraphs.map(value=>h("p",{text:value})));
  }
  if(content&&typeof content==="object"){
    const readable=Object.entries(content).filter(([,value])=>typeof value==="string"&&value.trim()).slice(0,12);
    return h("div",{class:"stack"},...readable.map(([key,value])=>h("section",{class:"lesson-section"},h("div",{class:"eyebrow",text:pretty(key)}),h("p",{text:value}))),advancedEditor("Contenu technique",h("pre",{class:"json-view",text:JSON.stringify(content,null,2)})));
  }
  return emptyState("Contenu indisponible","Cette leçon ne contient pas encore de contenu affichable.","document");
}
export async function renderTraining(){
  const root=h("div");root.append(pageHeader({eyebrow:"Squared BUILD",title:"Formation BUILD",subtitle:"Parcours, leçons et progression synchronisés avec Squared BUILD."}));
  try{
    let catalog=await trainingCatalog();const stats=catalog.stats||{};
    root.append(h("div",{class:"grid stats"},
      statCard("Modules",stats.modules||0,"Programme","folder"),
      statCard("Leçons",stats.lessons||0,"Contenu total","document"),
      statCard("Accessibles",stats.accessibleLessons||0,"Disponibles maintenant","star"),
      statCard("Terminées",stats.completedLessons||0,"Progression","check")
    ));
    const host=h("div",{class:"list"});
    const redraw=()=>{
      const lessons=catalog.lessons||[];
      host.replaceChildren(...(lessons.length?lessons.map(lesson=>row({
        title:`${lesson.code?lesson.code+" · ":""}${lesson.title}`,
        subtitle:lesson.summary||lesson.learningObjective,
        status:lesson.isCompleted?"completed":lesson.isUnlocked?"active":"locked",
        meta:lesson.readingMinutes?`${lesson.readingMinutes} min`:"",
        actions:[button("Ouvrir",{small:true,disabled:!lesson.isUnlocked,onClick:async()=>{
          try{
            const detail=await trainingLesson(lesson.id);
            modal({title:lesson.title,content:h("div",{class:"stack"},lesson.learningObjective?h("p",{class:"page-subtitle",text:lesson.learningObjective}):null,lessonContent(detail)),wide:true,actions:[{label:lesson.isCompleted?"Marquer à refaire":"Marquer terminée",kind:"primary",icon:"check",onClick:async close=>{try{catalog=await setTrainingProgress(lesson.id,!lesson.isCompleted);toast("Progression enregistrée");close();redraw()}catch(error){toast(errorMessage(error),"error")}}}]});
          }catch(error){toast(errorMessage(error),"error")}
        }})]
      })):[emptyState("Aucune leçon","Aucune leçon n’est actuellement disponible.")]));
    };
    redraw();
    root.append(card(catalog.program?.title||"Programme BUILD",catalog.program?.description||"Programme de formation Squared.",host,{iconName:"star",className:"section-gap"}));
  }catch(error){root.append(emptyState("Formation indisponible",errorMessage(error),"warning"))}
  return root;
}
