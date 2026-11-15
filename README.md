# LetherelWorld

Sito statico per l’archivio della campagna D&D ambientata nel Regno di Letherel. 

## Pagine

- La Confraternita
- Bacheca delle missioni
- Distretti e Distretto Rovere
- Cassa Distretto
- Regno di Letherel
- Giochi da taverna
- Registro avventure
- Casate
- Info

## Pubblicazione con GitHub Pages

Il sito usa solo HTML, CSS e JavaScript. Nelle impostazioni del repository, apri **Settings → Pages**, scegli **Deploy from a branch**, poi seleziona `main` e `/(root)`. GitHub Pages pubblicherà `index.html` e i file in `assets/`.

Il sito pubblicato è pubblico. Mantieni qui solo contenuti destinati ai giocatori.

## Anteprima locale

Per provare il sito sul computer, avvia `Avvia-LetherelWorld.bat`. Il browser deve aprire il sito tramite l'indirizzo locale che appare, perché non può caricare i file JSON se apri `index.html` direttamente come `file://`.

## Modificare la Bacheca

I testi e le missioni della Bacheca sono in `assets/data/bacheca.json`. L'ordine degli oggetti in `missions` è l'ordine delle card: per aggiungere una missione, copia un oggetto e assegna un `id` univoco. I dati sono raggruppati per immagine (`artwork`), contratto (`contract`), compagni (`companions`), profilo (`profile`), ricompensa (`reward`) e durata (`duration`).

Il renderer legge direttamente questi gruppi: `companions.fixed` e `companions.alternatives`, le metriche `{ label, value, maximum }` in `profile`, e i dettagli della ricompensa in `reward`. I campi immagine, compagni e durata possono essere omessi quando non servono.

La card viene generata da `createMissionCard` e inserita da `insertMissionCard` in `assets/js/bacheca.js`. Il conteggio nella navigazione si aggiorna dal JSON. Il sito resta statico: GitHub Pages serve direttamente questi file senza un server applicativo.

## Mapmaker

Apri `mapmaker/index.html` per usare il preset cartografico di Letherel, con i confini colorati e le etichette delle 20 casate e della Confraternita. Il tool è autonomo rispetto alla dashboard in `local-admin`; dettagli in `mapmaker/README.md`.

## Battlemap Printer

Apri `battlemap-printer/index.html` per dividere una o più battlemap in tessere A4 stampabili in scala reale. Seleziona un quadretto da 1 pollice per calibrare la mappa; ogni PDF contiene una tessera per pagina, con segni di ritaglio. Il tool calcola i fogli minimi; puoi chiedere fogli extra, che restano vuoti. Attiva il toggle per aggiungere una pagina reference numerata. Stampa le tessere al 100%, senza adattamento alla pagina. Il collegamento è disponibile nella dashboard di `local-admin`.

## Modificare i personaggi

Ogni scheda è un JSON in `assets/data/player-cards/`. Per mostrarla nel Rovere, aggiungi il file anche a `assets/data/player-cards/index.json` e il nome esatto al rango corrispondente in `assets/data/player-cards/roster.json`.

## Modificare la pagina Info

I contenuti della pagina Info sono in `assets/data/info.json`. Il titolo contiene una o più sottosezioni; ciascuna può avere un sottotitolo, un paragrafo (separando i paragrafi con una riga vuota) e un elenco puntato facoltativo. Gli elementi dell’elenco possono includere un collegamento. La gestione locale permette di modificare questi campi senza intervenire direttamente sul JSON.
