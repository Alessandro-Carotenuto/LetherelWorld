(() => {
  const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 400'%3E%3Crect width='640' height='400' fill='%23211e1b'/%3E%3Cpath d='M0 330 160 170l95 95 98-130 287 195v70H0z' fill='%232a2520'/%3E%3Cpath d='M320 104 430 200 320 296 210 200z' fill='none' stroke='%23c9ad78' stroke-opacity='.55' stroke-width='2'/%3E%3Cpath d='M320 138 390 200 320 262 250 200z' fill='none' stroke='%23c9ad78' stroke-opacity='.25'/%3E%3Cpath d='M38 38h68M38 38v45M602 38h-68M602 38v45M38 362h68M38 362v-45M602 362h-68M602 362v-45' fill='none' stroke='%23c9ad78' stroke-opacity='.6' stroke-width='2'/%3E%3C/svg%3E";
  window.siteImages = Object.fromEntries(Object.entries({confraternita:1,distretti:26,bacheca:3,rovere:43,taverna:10,avventure:1,casate:22}).map(([key,count]) => [key,Array(count).fill(placeholder)]));
  window.siteImages.inline = {
    momento: {src:"./assets/regno/momento.png",alt:"Una luce squarcia il cielo sopra una città, sovrastata da due mani gigantesche.",align:"right"},
    primoRifiuto: {src:"./assets/regno/primo-rifiuto.png",alt:"Una donna affronta un drago tra fiamme e fulmini, dando inizio al Primo Rifiuto.",align:"left"},
    battagliaPrimePaludi: {src:"./assets/regno/battaglia-prime-paludi.png",alt:"I popoli delle paludi affrontano tre draghi durante la Battaglia delle Prime Paludi.",align:"full"},
    primiDecenniResistenza: {src:"./assets/regno/primi-decenni-resistenza.png",alt:"Un drago sorvola un villaggio paludoso durante i primi decenni della resistenza.",align:"right"},
    ribellioneDragonide: {src:"./assets/regno/ribellione-dragonide.png",alt:"I Dragonidi e i draghi dissidenti affrontano gli oppressori nelle Pianure di Fuoco.",align:"full"},
    alleanzaGrotteScaglie: {src:"./assets/regno/alleanza-grotte-scaglie.png",alt:"I rappresentanti delle Grotte a Scaglie si riuniscono davanti a un cristallo luminoso.",align:"left"},
    periodoAlleanze: {src:"./assets/regno/periodo-alleanze.png",alt:"Una fortezza e un accampamento si preparano a resistere ai draghi durante il Periodo delle Alleanze.",align:"right",size:"large"},
    fortezzaBiancofiore: {src:"./assets/regno/fortezza-biancofiore.png",alt:"La Fortezza del Biancofiore arroccata tra le montagne, raggiunta da un gruppo di viaggiatori.",align:"left"},
    emergereSud: {src:"./assets/regno/emergere-sud.png",alt:"Una stratega del sud cammina tra due guerrieri orcheschi.",align:"right"},
    battagliaGhiaccioLuce: {src:"./assets/regno/battaglia-ghiaccio-luce.png",alt:"Draghi combattono sopra il mare mentre le forze alleate affrontano la battaglia del ghiaccio e della luce.",align:"left"},
    alleanzeNord: {src:"./assets/regno/alleanze-nord.png",alt:"Una fortezza tra le montagne innevate rappresenta le alleanze del nord.",align:"right"},
    disfattaSolbruciato: {src:"./assets/regno/disfatta-solbruciato.png",alt:"Un esercito affronta i draghi tra ghiaccio e fuoco durante la disfatta di Solbruciato.",align:"left"},
    solbruciatoSuccessiva: {src:"./assets/regno/solbruciato-ricostruzione.png",alt:"Artigiani lavorano alla forgia dopo la disfatta di Solbruciato.",align:"right"},
    consiglioGuerra: {src:"./assets/regno/consiglio-guerra.png?v=20261031-stemmi-casate",alt:"Le casate si riuniscono in un grande consiglio prima della guerra di liberazione.",align:"left"},
    logoRilva: {src:"./assets/salvati/Rilva.png",alt:"Stemma della Casata Rilva.",align:"right"},
    regnoNuoveStelle: {src:"./assets/regno/regno-01-nuove-stelle.png",alt:"Il cielo stellato sopra il tempio delle Nuove Stelle.",align:"left"},
    regnoInfluenzaTusk: {src:"./assets/regno/regno-02-influenza-tusk.png",alt:"Le forze Tusk avanzano nella notte verso la fortezza in fiamme.",align:"right"},
    regnoDeposizione: {src:"./assets/regno/regno-03-deposizione-pacifica.png",alt:"La deposizione pacifica dei Rilva nel tempio.",align:"left"},
    logoTusk: {src:"./assets/salvati/Tusk.png",alt:"Stemma della Casata Tusk.",align:"right"},
    regnoScismaLune: {src:"./assets/regno/regno-04-scisma-lune.png",alt:"Due lune si incontrano sopra le montagne e il lago.",align:"left"},
    regnoNozze: {src:"./assets/regno/regno-05-nozze-regno.png",alt:"Le nozze dinastiche di Karina Tusk e Merien Jart.",align:"left"},
    logoJart: {src:"./assets/salvati/Jart.png",alt:"Stemma della Casata Jart.",align:"left"},
    regnoRibellioneTusk: {src:"./assets/regno/regno-06-ribellione-tusk.png",alt:"Le truppe Tusk avanzano verso una fortezza in fiamme.",align:"right"},
    regnoValleAmetista: {src:"./assets/regno/regno-07-valle-ametista.png",alt:"La battaglia nella Valle Ametista.",align:"left"},
    regnoBassopiano: {src:"./assets/regno/regno-08-bassopiano.png",alt:"La distruzione del Ponte Eterno durante la Ribellione del Bassopiano.",align:"left"},
    regnoResaGalvant: {src:"./assets/regno/regno-09-resa-galvant.png",alt:"La resa dei Galvànt davanti al sovrano.",align:"right"},
    regnoPresaVerde: {src:"./assets/regno/regno-10-presa-verde.png",alt:"L’esercito Vendril si avvicina al castello di Alabaster sotto la luna.",align:"left"},
    logoVendril: {src:"./assets/salvati/Vendril.png",alt:"Stemma della Casata Vendril.",align:"right"},
    logoAlaven: {src:"./assets/salvati/Alaven.png",alt:"Stemma della Casata Alaven.",align:"left"},    regnoFondazione: {src:"./assets/regno/regno-fondazione-confraternita.png",alt:"Un gruppo eterogeneo di mercenari si raduna tra rovine attorno a un portale, sotto il grande stendardo della Confraternita.",align:"full"},
  };
  const savedCrests={Whiteflower:"Whiteflower.png",Alaven:"Alaven.png",Sewerly:"Sewerly.png",Barlon:"Barlon.png",Allomance:"Allomance.png",Tusk:"Tusk.png",Tikle:"Tikle.png","Revachòl":"Revachol.png",Likari:"Likari.png",Igglopolt:"Igglopolt.png",Gray:"Gray.png",Mankos:"Mankos.png",Falkner:"Falkner.png",Brightforge:"Brightforge.png","Galvànt":"Galvànt.png",Dalinar:"Dalinar.png",Obsidian:"Obsidian.png",Lavender:"Lavender.png",Pages:"Pages.png",Jart:"Jart.png",Rilva:"Rilva.png",Vendril:"Vendril.png"};
  window.siteImages.casate=window.casateContent.map(house=>savedCrests[house.name]?`./assets/salvati/${savedCrests[house.name]}`:placeholder);
  const districtCrests=["Rovere-v2.png","Avorio-v2.png","Berillo-v2.png","Corniola-v2.png","Destino-v2.png","Evocazioni-v2.png","Ferro-v2.png","Giostre-v2.png","Hex-v2.png","Idra-v2.png","Jinn-v2.png","Kalite-v2.png","Lapislazzuli-v2.png","Marmo-v2.png","Nymphae-v2.png","Oro-v2.png","Platino-v2.png","Quarzo-v2.png","Serrato-v2.png","Tombe-v2.png","Unicorno-v2.png","Vetro-v2.png","Warlock-v2.png","Xanto-v2.png","Yucca-v2.png","Zaffiro-v2.png"];
  window.siteImages.distretti=window.siteImages.distretti.map((image,index)=>districtCrests[index]?`./assets/salvati/${districtCrests[index]}`:image);
})();
