// Iconly SVG exports shared with the native Squared Workspace asset catalog.
export const ICONLY_REGULAR = Object.freeze(["Add","Archive","Bag","Calendar","Chart","Check","ChevronDown","ChevronUp","CircleMessages","Clock","Close","Cloud","Company","Document","Download","Edit","External","EyeOff","Favorite","Folder","FolderOpen","Globe","Grid","HelpSign","Home","Image","Invoice","Key","Lock","Logout","Mail","Map","Money","Moon","Notification","Payment","PersonAdd","Phone","Pin","Plus4","Scan","Search","Send","Settings","Share","Shield","SidebarBusinessUnits","SidebarContracts","SidebarDashboard","SidebarDeliverables","SidebarDocuments","SidebarFinance","SidebarGovernance","SidebarLeft","SidebarMap","SidebarMissions","SidebarObjectives","SidebarPlanning","SidebarProjects","SidebarReports","SidebarResources","SidebarRight","SidebarSiteMedia","SidebarSiteProducts","SidebarSitePublications","SidebarSiteReferences","SidebarSiteReleases","SidebarSiteServices","SidebarTasks","SidebarTimeExpenses","SidebarToday","SidebarValidations","Sliders","Sparkles","Star","Sun","Sync","Tag","Trash","Trend","UpdateRight","Upload","User","Users","Wallet","WalletPass","Warning"]);
export const ICONLY_FILLED = Object.freeze(["Add","ArrowLeft","ArrowRight","Bag","Camera","Check","ChevronRight","Clock","Close","Cloud","Company","Document","EyeOff","Favorite","Grid","Home","Mail","Map","Notification","Phone","Pin","Scan","Settings","Shield","Sparkles","Star","Sync","Tag","User","Wallet","Warning"]);
export function iconlyPath(token, fill=false){
  const requested=fill?ICONLY_FILLED:ICONLY_REGULAR;
  if(requested.includes(token))return `/assets/icons/Iconly${fill?"Fill":"Regular"}${token}.svg`;
  const alternate=fill?ICONLY_REGULAR:ICONLY_FILLED;
  if(alternate.includes(token))return `/assets/icons/Iconly${fill?"Regular":"Fill"}${token}.svg`;
  return "/assets/icons/IconlyRegularGrid.svg";
}
