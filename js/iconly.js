// Iconly SVG assets: the native catalogue and verified Iconly Essential exports.
export const ICONLY_REGULAR = Object.freeze(["Add","Archive","ArrowLeft","ArrowRight","Bag","Calendar","Chart","Check","ChevronDown","ChevronUp","CircleMessages","Clock","Close","Cloud","Company","Document","Download","Edit","External","EyeOff","Favorite","Folder","FolderOpen","Globe","Grid","HelpSign","Home","Image","Invoice","Key","Lock","Logout","Mail","Map","Money","Moon","MoreSquare","Notification","Payment","PersonAdd","Phone","Pin","Play","Plus4","Scan","Search","Send","Settings","Share","Shield","Show","SidebarBusinessUnits","SidebarContracts","SidebarDashboard","SidebarDeliverables","SidebarDocuments","SidebarFinance","SidebarGovernance","SidebarLeft","SidebarMap","SidebarMissions","SidebarObjectives","SidebarPlanning","SidebarProjects","SidebarReports","SidebarResources","SidebarRight","SidebarSiteMedia","SidebarSiteProducts","SidebarSitePublications","SidebarSiteReferences","SidebarSiteReleases","SidebarSiteServices","SidebarTasks","SidebarTimeExpenses","SidebarToday","SidebarValidations","Sliders","Sparkles","Star","Sun","Sync","Tag","Trash","Trend","UpdateRight","Upload","User","Users","Wallet","WalletPass","Warning"]);
export const ICONLY_FILLED = Object.freeze(["Add","ArrowLeft","ArrowRight","Bag","Camera","Check","ChevronRight","Clock","Close","Cloud","Company","Document","EyeOff","Favorite","Grid","Home","Mail","Map","Notification","Phone","Pin","Scan","Settings","Shield","Sparkles","Star","Sync","Tag","User","Wallet","Warning"]);
export function iconlyPath(token, fill=false){
  const requested=fill?ICONLY_FILLED:ICONLY_REGULAR;
  if(requested.includes(token))return `/assets/icons/Iconly${fill?"Fill":"Regular"}${token}.svg`;
  const alternate=fill?ICONLY_REGULAR:ICONLY_FILLED;
  if(alternate.includes(token))return `/assets/icons/Iconly${fill?"Regular":"Fill"}${token}.svg`;
  return "/assets/icons/IconlyRegularGrid.svg";
}
