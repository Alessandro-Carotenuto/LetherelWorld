# Mapmaker di Letherel

Apri `index.html` nel browser: si carica il preset ricostruito dalle immagini di riferimento, con 20 territori modificabili: Igglopolt, Likari, Gray, Dalinar, Tusk, Sewerly, Tikle, Barlon, Galvànt, Alaven, Revachòl, Whiteflower, Allomance, Lavender, Brightforge, Pages, Mankos, Obsidian, Falkner e La Confraternita.

Ogni riga permette di rinominare, ricolorare, eliminare o nascondere l’etichetta del territorio. I riempimenti iniziali sono livelli modificabili: cambiare il colore aggiorna tutta la regione base, eliminare uno Stato toglie il suo riempimento e la gomma può cancellare anche parti degli Stati iniziali lasciando terra neutra. Le cancellazioni sono pennellate salvate nel progetto e si possono annullare. Tutti gli Stati e le pennellate hanno opacità fissa al 70%, senza slider: la mappa chiara resta sotto i colori e lascia intravedere i fiumi. Le pennellate sostituiscono il colore sottostante senza sommare l'opacità. I pezzi scollegati hanno contorni separati; quando una pennellata li unisce, il bordo viene ricalcolato sulla forma risultante e resta solo sul perimetro esterno. I fiumi non diventano contorni e il confine interno viene sostituito da un solo bordo. Il tratto si ferma quando esce dalla terra e riprende quando rientra; lo slider **Frastagliazione** controlla il bordo di pennello e gomma nelle nuove pennellate. **Ripristina preset Letherel** ricarica il preset originale e annulla le modifiche correnti.

Il progetto viene salvato automaticamente nel browser. **Esporta progetto** crea un JSON riapribile con **Apri progetto**; **Esporta mappa** produce un PNG con immagine, colori ed etichette visibili.

## Luoghi

Ogni luogo ha due cursori indipendenti: **Dimensione simbolo** (16–120 px) e **Dimensione etichetta** (10–80 px). I progetti precedenti usano le dimensioni originali di 44 px e 24 px.

Nella sezione **Luoghi sulla mappa**, premi **+ Aggiungi luogo** in cima alla barra laterale, scegli il simbolo **Città**, **Monti** o **Foresta** e scrivi il nome nel campo dell'etichetta. Premi **Posiziona** e clicca sulla mappa; in seguito **Sposta** permette di cambiare posizione. Puoi lasciare il nome vuoto per mostrare solo il simbolo o eliminare un luogo dalla lista. **Mostra il livello dei luoghi** accende o spegne tutti i simboli e le relative etichette, anche nel PNG esportato. I luoghi e la visibilità sono inclusi nel salvataggio automatico e nel file progetto JSON; i vecchi progetti si aprono con il livello vuoto e visibile.

La cartella non dipende dalla dashboard in `local-admin` e non modifica i dati del sito: serve a preparare mappe autonome da usare come immagini. La mappa chiara del preset conserva costa e fiumi sotto i colori; geometria politica, colori ed etichette restano modificabili nel progetto.
